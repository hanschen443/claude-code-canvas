import { createWebSocketRequest } from "@/services/websocket/createWebSocketRequest";
import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
} from "@/types/websocket/events";
import type {
  ConfigGetPayload,
  ConfigUpdatePayload,
} from "@/types/websocket/requests";
import type {
  ConfigGetResultPayload,
  ConfigUpdatedPayload,
} from "@/types/websocket/responses";
export async function getConfig(): Promise<ConfigGetResultPayload> {
  return createWebSocketRequest<ConfigGetPayload, ConfigGetResultPayload>({
    requestEvent: WebSocketRequestEvents.CONFIG_GET,
    responseEvent: WebSocketResponseEvents.CONFIG_GET_RESULT,
    payload: {},
  });
}

export async function updateConfig(config: {
  timezoneOffset: number;
  backupGitRemoteUrl?: string;
  backupTime?: string;
  backupEnabled?: boolean;
}): Promise<ConfigUpdatedPayload> {
  return createWebSocketRequest<ConfigUpdatePayload, ConfigUpdatedPayload>({
    requestEvent: WebSocketRequestEvents.CONFIG_UPDATE,
    responseEvent: WebSocketResponseEvents.CONFIG_UPDATED,
    payload: {
      timezoneOffset: config.timezoneOffset,
      backupGitRemoteUrl: config.backupGitRemoteUrl,
      backupTime: config.backupTime,
      backupEnabled: config.backupEnabled,
    },
  });
}
