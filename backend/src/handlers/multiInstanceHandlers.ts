import { podStore } from "../services/podStore.js";
import { WebSocketResponseEvents } from "../schemas";
import type { PodSetMultiInstancePayload } from "../schemas";
import {
  validatePod,
  withCanvasId,
  emitPodUpdated,
} from "../utils/handlerHelpers.js";
import { emitError } from "../utils/websocketResponse.js";
import { createI18nError } from "../utils/i18nError.js";
import { getCapabilities } from "../services/provider/index.js";

export const handlePodSetMultiInstance =
  withCanvasId<PodSetMultiInstancePayload>(
    WebSocketResponseEvents.POD_MULTI_INSTANCE_SET,
    async (
      connectionId: string,
      canvasId: string,
      payload: PodSetMultiInstancePayload,
      requestId: string,
    ): Promise<void> => {
      const { podId, multiInstance } = payload;

      const pod = validatePod(
        connectionId,
        podId,
        WebSocketResponseEvents.POD_MULTI_INSTANCE_SET,
        requestId,
      );

      if (!pod) {
        return;
      }

      // Capability 守門：Codex Pod 不支援 Run 模式，拒絕開啟 multiInstance
      if (multiInstance === true && !getCapabilities(pod.provider).runMode) {
        emitError(
          connectionId,
          WebSocketResponseEvents.POD_MULTI_INSTANCE_SET,
          createI18nError("errors.runNotSupported", { provider: pod.provider }),
          requestId,
          pod.id,
          "RUN_NOT_SUPPORTED",
        );
        return;
      }

      podStore.setMultiInstance(canvasId, podId, multiInstance);

      emitPodUpdated(
        canvasId,
        podId,
        requestId,
        WebSocketResponseEvents.POD_MULTI_INSTANCE_SET,
      );
    },
  );
