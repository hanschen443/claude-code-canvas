import { createWebSocketRequest } from "@/services/websocket/createWebSocketRequest";
import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
} from "@/types/websocket/events";
import type { PodSetPluginsPayload } from "@/types/websocket/requests";
import type { PodPluginsSetPayload } from "@/types/websocket/responses";

export async function updatePodPlugins(
  canvasId: string,
  podId: string,
  pluginIds: string[],
): Promise<PodPluginsSetPayload> {
  return createWebSocketRequest<PodSetPluginsPayload, PodPluginsSetPayload>({
    requestEvent: WebSocketRequestEvents.POD_SET_PLUGINS,
    responseEvent: WebSocketResponseEvents.POD_PLUGINS_SET,
    payload: {
      canvasId,
      podId,
      pluginIds,
    },
  });
}
