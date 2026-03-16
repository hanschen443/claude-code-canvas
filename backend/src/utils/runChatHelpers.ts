import { v4 as uuidv4 } from 'uuid';
import type { RunContext } from '../types/run.js';
import type { ContentBlock } from '../types/index.js';
import { WebSocketResponseEvents } from '../schemas/index.js';
import { runStore } from '../services/runStore.js';
import { socketService } from '../services/socketService.js';
import { extractDisplayContent } from './chatHelpers.js';
import { runExecutionService } from '../services/workflow/runExecutionService.js';
import { executeStreamingChat } from '../services/claude/streamingChatExecutor.js';

export interface LaunchMultiInstanceRunParams {
    canvasId: string;
    podId: string;
    message: string | ContentBlock[];
    abortable: boolean;
    onComplete: (runContext: RunContext) => void;
    onAborted?: (canvasId: string, podId: string, messageId: string) => void;
    onRunContextCreated?: (runContext: RunContext) => void;
}

export async function launchMultiInstanceRun(params: LaunchMultiInstanceRunParams): Promise<RunContext> {
    const { canvasId, podId, message, abortable, onComplete, onAborted, onRunContextCreated } = params;

    const triggerMessage = extractDisplayContent(message);
    const runContext = await runExecutionService.createRun(canvasId, podId, triggerMessage);
    runExecutionService.startPodInstance(runContext, podId);
    await injectRunUserMessage(runContext, podId, message);

    onRunContextCreated?.(runContext);

    await executeStreamingChat(
        { canvasId, podId, message, abortable, runContext },
        {
            onComplete: () => onComplete(runContext),
            ...(onAborted ? { onAborted } : {}),
        }
    );

    return runContext;
}

export async function injectRunUserMessage(
    runContext: RunContext,
    podId: string,
    content: string | ContentBlock[]
): Promise<void> {
    const displayContent = extractDisplayContent(content);

    // 不呼叫 podStore.setStatus（pod 全域狀態不變）
    await runStore.addRunMessage(runContext.runId, podId, 'user', displayContent);

    socketService.emitToCanvas(runContext.canvasId, WebSocketResponseEvents.RUN_MESSAGE, {
        runId: runContext.runId,
        canvasId: runContext.canvasId,
        podId,
        messageId: uuidv4(),
        content: displayContent,
        isPartial: false,
        role: 'user',
    });
}
