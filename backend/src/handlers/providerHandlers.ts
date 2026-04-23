import { WebSocketResponseEvents } from "../schemas";
import type {
  ProviderListPayload,
  ProviderListResultPayload,
} from "../schemas";
import { PROVIDER_NAMES, getCapabilities } from "../services/provider/index.js";
import { socketService } from "../services/socketService.js";

/**
 * 處理 provider:list 請求
 * 回傳所有支援的 Provider 名稱與對應的能力矩陣
 */
export async function handleProviderList(
  connectionId: string,
  payload: ProviderListPayload,
  requestId: string,
): Promise<void> {
  // 從 PROVIDER_NAMES 建立 providers 列表，每個 provider 附帶其 capabilities
  const providers = PROVIDER_NAMES.map((name) => ({
    name,
    capabilities: getCapabilities(name),
  }));

  const response: ProviderListResultPayload = {
    requestId,
    success: true,
    providers,
  };

  socketService.emitToConnection(
    connectionId,
    WebSocketResponseEvents.PROVIDER_LIST_RESULT,
    response,
  );
}
