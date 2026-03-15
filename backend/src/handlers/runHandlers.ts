import {WebSocketResponseEvents} from '../schemas';
import type {RunDeletePayload, RunLoadHistoryPayload, RunLoadPodMessagesPayload} from '../schemas';
import {runExecutionService} from '../services/workflow/runExecutionService.js';
import {runStore} from '../services/runStore.js';
import {podStore} from '../services/podStore.js';
import {emitSuccess, emitError} from '../utils/websocketResponse.js';
import {withCanvasId} from '../utils/handlerHelpers.js';

export const handleRunDelete = withCanvasId<RunDeletePayload>(
    WebSocketResponseEvents.RUN_DELETED,
    async (connectionId: string, canvasId: string, payload: RunDeletePayload, requestId: string): Promise<void> => {
        const {runId} = payload;

        const run = runStore.getRun(runId);
        if (!run || run.canvasId !== canvasId) {
            emitError(connectionId, WebSocketResponseEvents.RUN_DELETED, '找不到指定的 Run', requestId, undefined, 'NOT_FOUND');
            return;
        }

        runExecutionService.deleteRun(runId);
    }
);

export const handleRunLoadHistory = withCanvasId<RunLoadHistoryPayload>(
    WebSocketResponseEvents.RUN_HISTORY_LOADED,
    async (connectionId: string, canvasId: string, _payload: RunLoadHistoryPayload, requestId: string): Promise<void> => {
        const runs = runStore.getRunsByCanvasId(canvasId);

        const runsWithInstances = runs.map((run) => {
            const instances = runStore.getPodInstancesByRunId(run.id);
            const sourcePod = podStore.getById(canvasId, run.sourcePodId);
            const sourcePodName = sourcePod?.name ?? run.sourcePodId;

            const podInstances = instances.map((instance) => {
                const pod = podStore.getById(canvasId, instance.podId);
                return {
                    ...instance,
                    podName: pod?.name ?? instance.podId,
                };
            });

            return {...run, podInstances, sourcePodName};
        });

        emitSuccess(connectionId, WebSocketResponseEvents.RUN_HISTORY_LOADED, {
            requestId,
            success: true,
            runs: runsWithInstances,
        });
    }
);

export const handleRunLoadPodMessages = withCanvasId<RunLoadPodMessagesPayload>(
    WebSocketResponseEvents.RUN_POD_MESSAGES_LOADED,
    async (connectionId: string, canvasId: string, payload: RunLoadPodMessagesPayload, requestId: string): Promise<void> => {
        const {runId, podId} = payload;

        const run = runStore.getRun(runId);
        if (!run || run.canvasId !== canvasId) {
            emitError(connectionId, WebSocketResponseEvents.RUN_POD_MESSAGES_LOADED, '找不到指定的 Run', requestId, undefined, 'NOT_FOUND');
            return;
        }

        const messages = runStore.getRunMessages(runId, podId);

        emitSuccess(connectionId, WebSocketResponseEvents.RUN_POD_MESSAGES_LOADED, {
            requestId,
            success: true,
            messages,
        });
    }
);
