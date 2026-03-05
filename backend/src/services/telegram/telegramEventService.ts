import {v4 as uuidv4} from 'uuid';
import type {Pod, TelegramMessage} from '../../types/index.js';
import {WebSocketResponseEvents} from '../../schemas/events.js';
import {podStore} from '../podStore.js';
import {messageStore} from '../messageStore.js';
import {socketService} from '../socketService.js';
import {connectionStore} from '../connectionStore.js';
import {executeStreamingChat} from '../claude/streamingChatExecutor.js';
import {logger} from '../../utils/logger.js';
import {createPostChatCompleteCallback} from '../../utils/operationHelpers.js';
import {autoClearService} from '../autoClear/index.js';
import {workflowExecutionService} from '../workflow/index.js';
import {telegramClientManager} from './telegramClientManager.js';
import type {TelegramApiMessage} from './telegramClientManager.js';
import {escapeUserInput} from '../../utils/escapeInput.js';
import {shouldSendBusyReply} from '../../utils/busyChatManager.js';

const BUSY_STATUSES = new Set(['chatting', 'summarizing'] as const);
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
const MAX_WORKFLOW_CHAIN_SIZE = 50;

export {escapeUserInput as escapeTelegramInput};

class TelegramEventService {
    private busyReplyCooldowns = new Map<string, number>();

    // 觸發條件複雜（私聊、群組 @mention、群組 /command、Bot 自己訊息過濾），加上超長截斷和文字清理，超過 6 個判斷
    async handleMessage(botId: string, message: TelegramApiMessage, botUsername: string): Promise<void> {
        if (message.from?.is_bot === true) return;

        const chatType = message.chat.type;
        const rawText = message.text ?? '';

        const isPrivate = chatType === 'private';
        const hasMention = rawText.includes(`@${botUsername}`);
        // 群組中只處理帶有 @botUsername 的斜線指令，避免響應其他 Bot 的指令大量消耗額度
        const hasCommand = isPrivate
            ? rawText.startsWith('/')
            : rawText.startsWith('/') && rawText.includes(`@${botUsername}`);

        if (!isPrivate && !hasMention && !hasCommand) return;

        const truncatedText = rawText.length > MAX_TELEGRAM_MESSAGE_LENGTH
            ? rawText.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '\n...(訊息過長，已截斷)'
            : rawText;

        const cleanedText = truncatedText.replace(new RegExp(`@${botUsername}`, 'g'), '').trim();

        const userName = message.from?.username ?? message.from?.first_name ?? 'unknown';
        const chatId = message.chat.id;

        const telegramMessage: TelegramMessage = {
            id: uuidv4(),
            telegramBotId: botId,
            chatId,
            userId: message.from?.id ?? 0,
            userName,
            text: cleanedText,
            messageId: message.message_id,
        };

        logger.log('Telegram', 'Complete', `[TelegramEventService] 收到訊息，Chat ${chatId}，Bot: ${botUsername}`);

        const fromUserId = message.from?.id;
        const boundPods = this.findBoundPods(botId, chatId, fromUserId);
        if (boundPods.length === 0) {
            logger.log('Telegram', 'Complete', `[TelegramEventService] 找不到綁定 Bot ${botId} 和 Chat ${chatId} 的 Pod`);
            return;
        }

        if (await this.handleBusyChat(botId, chatId)) return;

        const results = await Promise.allSettled(
            boundPods.map(({canvasId, pod}) => this.processBoundPod(canvasId, pod, telegramMessage))
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'rejected') {
                const pod = boundPods[i].pod;
                logger.error('Telegram', 'Error', `[TelegramEventService] Pod「${pod.name}」處理 Telegram 訊息失敗`, result.reason);
            }
        }
    }

    private async handleBusyChat(botId: string, chatId: number): Promise<boolean> {
        if (!this.isTelegramChatBusy(botId, chatId)) return false;

        const chatKey = `${botId}:${chatId}`;
        if (shouldSendBusyReply(this.busyReplyCooldowns, chatKey)) {
            await telegramClientManager.sendMessage(botId, chatId, '目前忙碌中，請稍後再試');
        }
        return true;
    }

    private async processBoundPod(canvasId: string, pod: Pod, message: TelegramMessage): Promise<void> {
        if (BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing')) return;

        if (pod.status === 'error') {
            podStore.setStatus(canvasId, pod.id, 'idle');
        }

        await this.injectTelegramMessage(canvasId, pod.id, message);
    }

    isTelegramChatBusy(botId: string, chatId: number): boolean {
        const allBoundPods = podStore.findByTelegramBot(botId);
        const chatPods = allBoundPods.filter(({pod}) => pod.telegramBinding?.telegramChatId === chatId);

        return chatPods.some(({canvasId, pod}) =>
            BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing') || this.isWorkflowChainBusy(canvasId, pod.id));
    }

    private getAdjacentPodIds(canvasId: string, podId: string): string[] {
        const downstream = connectionStore.findBySourcePodId(canvasId, podId).map(c => c.targetPodId);
        const upstream = connectionStore.findByTargetPodId(canvasId, podId).map(c => c.sourcePodId);
        return [...downstream, ...upstream];
    }

    private processQueueItem(
        canvasId: string,
        currentId: string,
        visited: Set<string>,
        queue: string[],
        predicate: (podId: string) => boolean,
    ): boolean {
        if (predicate(currentId)) return true;

        for (const adjacentId of this.getAdjacentPodIds(canvasId, currentId)) {
            if (!visited.has(adjacentId)) {
                visited.add(adjacentId);
                queue.push(adjacentId);
            }
        }
        return false;
    }

    private processBfsQueue(
        canvasId: string,
        queue: string[],
        visited: Set<string>,
        predicate: (podId: string) => boolean,
    ): boolean {
        while (queue.length > 0) {
            if (visited.size > MAX_WORKFLOW_CHAIN_SIZE) {
                logger.warn('Telegram', 'Warn', `Workflow 鏈超過最大限制 ${MAX_WORKFLOW_CHAIN_SIZE}，停止遍歷`);
                return false;
            }
            const currentId = queue.shift();
            if (!currentId) break;
            if (this.processQueueItem(canvasId, currentId, visited, queue, predicate)) return true;
        }
        return false;
    }

    // 需要雙向遍歷才能檢測到 Workflow 中間節點的狀態變化，單向遍歷會遺漏反向依賴
    private traverseWorkflowChain(canvasId: string, startPodId: string, predicate: (podId: string) => boolean): boolean {
        const visited = new Set<string>([startPodId]);
        const queue = this.getAdjacentPodIds(canvasId, startPodId).filter(id => !visited.has(id));
        queue.forEach(id => visited.add(id));
        return this.processBfsQueue(canvasId, queue, visited, predicate);
    }

    private isWorkflowChainBusy(canvasId: string, podId: string): boolean {
        return this.traverseWorkflowChain(canvasId, podId, (currentId) => {
            const pod = podStore.getById(canvasId, currentId);
            return pod !== undefined && BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing');
        });
    }

    async injectTelegramMessage(canvasId: string, podId: string, message: TelegramMessage): Promise<void> {
        // 二次確認 Pod 狀態，防止並發 Telegram 事件穿透
        const currentPod = podStore.getById(canvasId, podId);
        if (currentPod && BUSY_STATUSES.has(currentPod.status as 'chatting' | 'summarizing')) {
            logger.log('Telegram', 'Complete', `Pod「${currentPod.name}」已在忙碌中，跳過注入`);
            return;
        }

        const podName = currentPod?.name ?? podId;

        const escapedUserName = escapeUserInput(message.userName);
        const escapedText = escapeUserInput(message.text);
        // 第一層：escapeUserInput 處理特殊字元；第二層：<user_data> 標籤作為結構性隔離
        const formattedText = `[Telegram: @${escapedUserName}] <user_data>${escapedText}</user_data>`;

        podStore.setStatus(canvasId, podId, 'chatting');

        await messageStore.addMessage(canvasId, podId, 'user', formattedText);

        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.POD_CHAT_USER_MESSAGE, {
            canvasId,
            podId,
            messageId: uuidv4(),
            content: formattedText,
            timestamp: new Date().toISOString(),
        });

        logger.log('Telegram', 'Complete', `[TelegramEventService] 注入 Telegram 訊息至 Pod「${podName}」`);

        const onComplete = createPostChatCompleteCallback(
            (cId, pId) => autoClearService.onPodComplete(cId, pId),
            (cId, pId) => workflowExecutionService.checkAndTriggerWorkflows(cId, pId),
            'Telegram',
        );

        try {
            await executeStreamingChat(
                {canvasId, podId, message: formattedText, abortable: false},
                {onComplete},
            );
        } catch (error) {
            podStore.setStatus(canvasId, podId, 'error');
            logger.error('Telegram', 'Error', `[TelegramEventService] Pod「${podName}」注入 Telegram 訊息失敗`, error);
            throw error;
        }
    }

    findBoundPods(botId: string, chatId: number, fromUserId?: number): Array<{canvasId: string; pod: Pod}> {
        const allPods = podStore.findByTelegramBot(botId);

        return allPods.filter(({pod}) => {
            const binding = pod.telegramBinding;
            if (!binding || binding.telegramChatId !== chatId) return false;
            if (binding.chatType === 'private' && fromUserId !== undefined) {
                return fromUserId === binding.telegramChatId;
            }
            return true;
        });
    }
}

export const telegramEventService = new TelegramEventService();

telegramClientManager.setOnMessage((botId, message, botUsername) =>
    telegramEventService.handleMessage(botId, message, botUsername),
);
