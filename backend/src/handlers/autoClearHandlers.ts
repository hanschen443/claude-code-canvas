import {podStore} from '../services/podStore.js';
import {WebSocketResponseEvents} from '../schemas';
import type {PodSetAutoClearPayload} from '../schemas';
import {validatePod, withCanvasId, emitPodUpdated} from '../utils/handlerHelpers.js';

export const handlePodSetAutoClear = withCanvasId<PodSetAutoClearPayload>(
    WebSocketResponseEvents.POD_AUTO_CLEAR_SET,
    async (connectionId: string, canvasId: string, payload: PodSetAutoClearPayload, requestId: string): Promise<void> => {
        const {podId, autoClear} = payload;

        const pod = validatePod(connectionId, podId, WebSocketResponseEvents.POD_AUTO_CLEAR_SET, requestId);

        if (!pod) {
            return;
        }

        podStore.setAutoClear(canvasId, podId, autoClear);

        emitPodUpdated(canvasId, podId, requestId, WebSocketResponseEvents.POD_AUTO_CLEAR_SET);
    }
);
