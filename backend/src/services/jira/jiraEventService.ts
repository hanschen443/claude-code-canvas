import {v4 as uuidv4} from 'uuid';
import type {Pod, JiraWebhookPayloadLite} from '../../types/index.js';
import {WebSocketResponseEvents} from '../../schemas/events.js';
import {podStore} from '../podStore.js';
import {messageStore} from '../messageStore.js';
import {socketService} from '../socketService.js';
import {executeStreamingChat} from '../claude/streamingChatExecutor.js';
import {logger} from '../../utils/logger.js';
import {createPostChatCompleteCallback} from '../../utils/operationHelpers.js';
import {autoClearService} from '../autoClear/index.js';
import {workflowExecutionService} from '../workflow/index.js';
import {escapeUserInput} from '../../utils/escapeInput.js';
import {shouldSendBusyReply} from '../../utils/busyChatManager.js';
import {isWorkflowChainBusy} from '../../utils/workflowChainTraversal.js';

const BUSY_STATUSES = new Set(['chatting', 'summarizing'] as const);

class JiraEventService {
    private busyReplyCooldowns = new Map<string, number>();

    async handleIssueEvent(jiraAppId: string, webhookEvent: string, payload: JiraWebhookPayloadLite): Promise<void> {
        const issueKey = payload.issue?.key ?? '';
        const projectKey = issueKey.split('-')[0] ?? '';

        if (!projectKey) {
            logger.warn('Jira', 'Warn', `[JiraEventService] 無法從 issue.key 解析 projectKey：${issueKey}`);
            return;
        }

        const summary = payload.issue?.fields?.summary ?? '';
        const userName = payload.user?.displayName ?? payload.user?.emailAddress ?? 'unknown';

        const text = this.formatMessage(webhookEvent, issueKey, summary, userName, payload);

        const boundPods = this.findBoundPods(jiraAppId, projectKey);
        if (boundPods.length === 0) {
            logger.log('Jira', 'Complete', `[JiraEventService] 找不到綁定 App ${jiraAppId} 和 Project ${projectKey} 的 Pod`);
            return;
        }

        if (this.isJiraProjectBusy(jiraAppId, projectKey)) {
            const cooldownKey = `${jiraAppId}:${projectKey}`;
            shouldSendBusyReply(this.busyReplyCooldowns, cooldownKey);
            return;
        }

        const results = await Promise.allSettled(
            boundPods.map(({canvasId, pod}) => this.processBoundPod(canvasId, pod, jiraAppId, projectKey, issueKey, webhookEvent, userName, text))
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'rejected') {
                const pod = boundPods[i].pod;
                logger.error('Jira', 'Error', `[JiraEventService] Pod「${pod.name}」處理 Jira 訊息失敗`, result.reason);
            }
        }
    }

    private formatMessage(webhookEvent: string, issueKey: string, summary: string, userName: string, payload: JiraWebhookPayloadLite): string {
        const escapedUserName = escapeUserInput(userName);
        const escapedIssueKey = escapeUserInput(issueKey);
        const escapedSummary = escapeUserInput(summary);

        if (webhookEvent === 'jira:issue_created') {
            return `[Jira: ${escapedUserName}] <user_data>建立了 Issue ${escapedIssueKey}: ${escapedSummary}</user_data>`;
        }

        if (webhookEvent === 'jira:issue_updated') {
            const changelogItems = payload.changelog?.items ?? [];
            const changelogDesc = changelogItems
                .map((item) => {
                    const field = escapeUserInput(item.field);
                    const from = escapeUserInput(item.fromString ?? '');
                    const to = escapeUserInput(item.toString ?? '');
                    return `${field}: ${from} → ${to}`;
                })
                .join(', ');
            return `[Jira: ${escapedUserName}] <user_data>更新了 Issue ${escapedIssueKey}: ${escapedSummary}\n變更: ${changelogDesc}</user_data>`;
        }

        return `[Jira: ${escapedUserName}] <user_data>刪除了 Issue ${escapedIssueKey}: ${escapedSummary}</user_data>`;
    }

    private async processBoundPod(
        canvasId: string,
        pod: Pod,
        jiraAppId: string,
        projectKey: string,
        issueKey: string,
        eventType: string,
        userName: string,
        text: string,
    ): Promise<void> {
        if (BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing')) return;

        if (pod.status === 'error') {
            podStore.setStatus(canvasId, pod.id, 'idle');
        }

        await this.injectJiraMessage(canvasId, pod.id, {
            id: uuidv4(),
            jiraAppId,
            projectKey,
            issueKey,
            eventType,
            userName,
            text,
        });
    }

    isJiraProjectBusy(jiraAppId: string, projectKey: string): boolean {
        const allBoundPods = podStore.findByJiraApp(jiraAppId);
        const projectPods = allBoundPods.filter(({pod}) => pod.jiraBinding?.jiraProjectKey === projectKey);

        return projectPods.some(({canvasId, pod}) =>
            BUSY_STATUSES.has(pod.status as 'chatting' | 'summarizing') || isWorkflowChainBusy(canvasId, pod.id));
    }

    async injectJiraMessage(canvasId: string, podId: string, message: {
        id: string;
        jiraAppId: string;
        projectKey: string;
        issueKey: string;
        eventType: string;
        userName: string;
        text: string;
    }): Promise<void> {
        // 二次確認 Pod 狀態，防止並發 Jira 事件穿透
        const currentPod = podStore.getById(canvasId, podId);
        if (currentPod && BUSY_STATUSES.has(currentPod.status as 'chatting' | 'summarizing')) {
            logger.log('Jira', 'Complete', `Pod「${currentPod.name}」已在忙碌中，跳過注入`);
            return;
        }

        const podName = currentPod?.name ?? podId;

        podStore.setStatus(canvasId, podId, 'chatting');

        await messageStore.addMessage(canvasId, podId, 'user', message.text);

        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.POD_CHAT_USER_MESSAGE, {
            canvasId,
            podId,
            messageId: uuidv4(),
            content: message.text,
            timestamp: new Date().toISOString(),
        });

        logger.log('Jira', 'Complete', `[JiraEventService] 注入 Jira 訊息至 Pod「${podName}」`);

        const onComplete = createPostChatCompleteCallback(
            (cId, pId) => autoClearService.onPodComplete(cId, pId),
            (cId, pId) => workflowExecutionService.checkAndTriggerWorkflows(cId, pId),
            'Jira'
        );

        try {
            await executeStreamingChat(
                {canvasId, podId, message: message.text, abortable: false},
                {onComplete}
            );
        } catch (error) {
            podStore.setStatus(canvasId, podId, 'error');
            logger.error('Jira', 'Error', `[JiraEventService] Pod「${podName}」注入 Jira 訊息失敗`, error);
            throw error;
        }
    }

    findBoundPods(jiraAppId: string, projectKey: string): Array<{canvasId: string; pod: Pod}> {
        return podStore.findByJiraApp(jiraAppId).filter(
            ({pod}) => pod.jiraBinding?.jiraProjectKey === projectKey
        );
    }
}

export const jiraEventService = new JiraEventService();
