import { v4 as uuidv4 } from "uuid";
import { emitAndWaitResponse, setupIntegrationTest } from "../setup";
import { createPod, getCanvasId } from "../helpers";
import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
  type PodSetPluginsPayload,
} from "../../src/schemas";
import { type PodPluginsSetPayload } from "../../src/types";

describe("Pod set-plugins", () => {
  const { getClient } = setupIntegrationTest();

  describe("idle 狀態", () => {
    it("成功更新 pluginIds（無已安裝 plugin 時應過濾為空陣列）", async () => {
      const client = getClient();
      const pod = await createPod(client);
      const canvasId = await getCanvasId(client);

      const response = await emitAndWaitResponse<
        PodSetPluginsPayload,
        PodPluginsSetPayload
      >(
        client,
        WebSocketRequestEvents.POD_SET_PLUGINS,
        WebSocketResponseEvents.POD_PLUGINS_SET,
        { requestId: uuidv4(), canvasId, podId: pod.id, pluginIds: [] },
      );

      expect(response.success).toBe(true);
      expect(response.pod).toBeDefined();
      expect(response.pod!.pluginIds).toEqual([]);
    });

    it("不存在的 plugin id 被過濾後 pluginIds 為空陣列", async () => {
      const client = getClient();
      const pod = await createPod(client);
      const canvasId = await getCanvasId(client);

      // 傳入不存在的 plugin ID，應全數被過濾
      const response = await emitAndWaitResponse<
        PodSetPluginsPayload,
        PodPluginsSetPayload
      >(
        client,
        WebSocketRequestEvents.POD_SET_PLUGINS,
        WebSocketResponseEvents.POD_PLUGINS_SET,
        {
          requestId: uuidv4(),
          canvasId,
          podId: pod.id,
          pluginIds: ["non-existent-plugin-id"],
        },
      );

      expect(response.success).toBe(true);
      expect(response.pod!.pluginIds).toEqual([]);
    });
  });

  describe("busy 狀態", () => {
    it("chatting 狀態時回傳 success: false, reason: pod-busy", async () => {
      const client = getClient();
      const pod = await createPod(client);
      const canvasId = await getCanvasId(client);

      // 直接操作 podStore 設定為 busy 狀態
      const { podStore } = await import("../../src/services/podStore.js");
      podStore.setStatus(canvasId, pod.id, "chatting");

      const response = await emitAndWaitResponse<
        PodSetPluginsPayload,
        PodPluginsSetPayload
      >(
        client,
        WebSocketRequestEvents.POD_SET_PLUGINS,
        WebSocketResponseEvents.POD_PLUGINS_SET,
        { requestId: uuidv4(), canvasId, podId: pod.id, pluginIds: [] },
      );

      expect(response.success).toBe(false);
      expect(response.reason).toBe("pod-busy");

      podStore.setStatus(canvasId, pod.id, "idle");
    });

    it("summarizing 狀態時回傳 success: false, reason: pod-busy", async () => {
      const client = getClient();
      const pod = await createPod(client);
      const canvasId = await getCanvasId(client);

      const { podStore } = await import("../../src/services/podStore.js");
      podStore.setStatus(canvasId, pod.id, "summarizing");

      const response = await emitAndWaitResponse<
        PodSetPluginsPayload,
        PodPluginsSetPayload
      >(
        client,
        WebSocketRequestEvents.POD_SET_PLUGINS,
        WebSocketResponseEvents.POD_PLUGINS_SET,
        { requestId: uuidv4(), canvasId, podId: pod.id, pluginIds: [] },
      );

      expect(response.success).toBe(false);
      expect(response.reason).toBe("pod-busy");

      podStore.setStatus(canvasId, pod.id, "idle");
    });
  });
});
