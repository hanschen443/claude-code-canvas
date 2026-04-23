import { podStore } from "../services/podStore.js";
import { WebSocketResponseEvents } from "../schemas";
import type { PodSetMultiInstancePayload } from "../schemas";
import {
  validatePod,
  withCanvasId,
  emitPodUpdated,
  assertCapability,
} from "../utils/handlerHelpers.js";

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

      // Capability 守門：僅在啟用方向（true）檢查，不支援 runMode 的 provider 拒絕開啟
      if (
        multiInstance === true &&
        !assertCapability(
          connectionId,
          pod,
          "runMode",
          WebSocketResponseEvents.POD_MULTI_INSTANCE_SET,
          requestId,
        )
      ) {
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
