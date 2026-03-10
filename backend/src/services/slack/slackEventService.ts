import {v4 as uuidv4} from 'uuid';
import type {Pod, SlackMessage, AppMentionEvent} from '../../types/index.js';
import {WebSocketResponseEvents} from '../../schemas/events.js';
import {podStore} from '../podStore.js';
import {messageStore} from '../messageStore.js';
import {socketService} from '../socketService.js';
import {slackAppStore} from './slackAppStore.js';
import {slackClientManager} from './slackClientManager.js';
import {executeStreamingChat} from '../claude/streamingChatExecutor.js';
import {logger} from '../../utils/logger.js';
import {createPostChatCompleteCallback} from '../../utils/operationHelpers.js';
import {autoClearService} from '../autoClear/index.js';
import {workflowExecutionService} from '../workflow/index.js';
import {escapeUserInput} from '../../utils/escapeInput.js';
import {shouldSendBusyReply} from '../../utils/busyChatManager.js';
import {isWorkflowChainBusy} from '../../utils/workflowChainTraversal.js';

const BUSY_STATUSES = new Set(['chatting', 'summarizing'] as const);
const MAX_SLACK_MESSAGE_LENGTH = 4000;

class SlackEventService {
    private busyReplyCooldowns = new Map<string, number>();

    async handleAppMention(slackAppId: string, event: AppMentionEvent): Promise<void> {
        const {channel, user, text, thread_ts, event_ts} = event;

        const slackApp = slackAppStore.getById(slackAppId);
        const botUserId = slackApp?.botUserId ?? '';
        const rawCleanedText = text.replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, '').trim();
        const cleanedText = rawCleanedText.length > MAX_SLACK_MESSAGE_LENGTH
            ? rawCleanedText.slice(0, MAX_SLACK_MESSAGE_LENGTH) + '\n...(訊息過長，已截斷)'
            : rawCleanedText;

        const userName = user ?? 'unknown';

        const message: SlackMessage = {
            id: uuidv4(),
            slackAppId,
            channelId: channel,
            userId: userName,
            userName,
            text: cleanedText,
            threadTs: thread_ts,
            eventTs: event_ts,
        };

        logger.log('Slack', 'Complete', `[SlackEventService] 收到 app_mention，頻道 ${channel}，Bot User ID: ${botUserId}`);

        const boundPods = this.findBoundPods(slackAppId, channel);
        if (boundPods.length === 0) {
            logger.log('Slack', 'Complete', `[SlackEventService] 找不到綁定 App ${slackAppId} 和頻道 ${channel} 的 Pod`);
            return;
        }

        if (await this.handleBusyChannel(slackAppId, channel)) {
            return;
        }

        const results = await Promise.allSettled(
            boundPods.map(({canvasId, pod}) => this.processBoundPod(canvasId, pod, message))
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'rejected') {
                const pod = boundPods[i].pod;
                logger.error('Slack', 'Error', `[SlackEventService] Pod「${pod.name}」處理 Slack 訊息失敗`, result.reason);
            }
        }
    }

    private async handleBusyChannel(slackAppId: string, channel: string): Promise<boolean> {
        if (!this.isSlackChannelBusy(slackAppId, channel)) {
            return false;
        }
        if (shouldSendBusyReply(this.busyReplyCooldowns, channel)) {
            await slackClientManager.sendMessage(slackAppId, channel, '目前忙碌中，請稍後再試');
        }
        return true;
    }

    private async processBoundPod(canvasId: string, pod: Pod, message: SlackMessage): Promise<void> {
        if (BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing')) return;

        if (pod.status === 'error') {
            podStore.setStatus(canvasId, pod.id, 'idle');
        }

        await this.injectSlackMessage(canvasId, pod.id, message);
    }

    isSlackChannelBusy(slackAppId: string, channelId: string): boolean {
        const allBoundPods = podStore.findBySlackApp(slackAppId);
        const channelPods = allBoundPods.filter(({pod}) => pod.slackBinding?.slackChannelId === channelId);

        return channelPods.some(({canvasId, pod}) =>
            BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing') || isWorkflowChainBusy(canvasId, pod.id));
    }

    async injectSlackMessage(canvasId: string, podId: string, message: SlackMessage): Promise<void> {
        // 二次確認 Pod 狀態，防止並發 Slack 事件穿透
        const currentPod = podStore.getById(canvasId, podId);
        if (currentPod && BUSY_STATUSES.has(currentPod.status as 'chatting' | 'summarizing')) {
            logger.log('Slack', 'Complete', `Pod「${currentPod.name}」已在忙碌中，跳過注入`);
            return;
        }

        const podName = currentPod?.name ?? podId;

        const escapedUserName = escapeUserInput(message.userName);
        const escapedText = escapeUserInput(message.text);
        // 第一層：escapeUserInput 處理特殊字元；第二層：<user_data> 標籤作為結構性隔離
        const formattedText = `[Slack: @${escapedUserName}] <user_data>${escapedText}</user_data>`;

        podStore.setStatus(canvasId, podId, 'chatting');

        await messageStore.addMessage(canvasId, podId, 'user', formattedText);

        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.POD_CHAT_USER_MESSAGE, {
            canvasId,
            podId,
            messageId: uuidv4(),
            content: formattedText,
            timestamp: new Date().toISOString(),
        });

        logger.log('Slack', 'Complete', `[SlackEventService] 注入 Slack 訊息至 Pod「${podName}」`);

        const onComplete = createPostChatCompleteCallback(
            (canvasId, podId) => autoClearService.onPodComplete(canvasId, podId),
            (canvasId, podId) => workflowExecutionService.checkAndTriggerWorkflows(canvasId, podId),
            'Slack'
        );

        try {
            await executeStreamingChat(
                {canvasId, podId, message: formattedText, abortable: false},
                {onComplete}
            );
        } catch (error) {
            podStore.setStatus(canvasId, podId, 'error');
            logger.error('Slack', 'Error', `[SlackEventService] Pod「${podName}」注入 Slack 訊息失敗`, error);
            throw error;
        }
    }

    findBoundPods(slackAppId: string, channelId: string): Array<{canvasId: string; pod: Pod}> {
        return podStore.findBySlackApp(slackAppId).filter(
            ({pod}) => pod.slackBinding?.slackChannelId === channelId
        );
    }
}

export const slackEventService = new SlackEventService();
