import { WebSocketResponseEvents } from "../schemas";
import type {
  ProviderListPayload,
  ProviderListResultPayload,
} from "../schemas";
import {
  providerRegistry,
  getProvider,
  type ProviderName,
} from "../services/provider/index.js";
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
  // 從 providerRegistry 建立 providers 列表，每個 provider 附帶 capabilities、defaultOptions 與 availableModels
  const providers = (Object.keys(providerRegistry) as ProviderName[]).map(
    (name) => {
      const { metadata } = getProvider(name);
      // 移除 pathToClaudeCodeExecutable：此為伺服器絕對路徑，不應洩漏給前端
      const { pathToClaudeCodeExecutable: _stripped, ...safeDefaultOptions } =
        metadata.defaultOptions as Record<string, unknown> & {
          pathToClaudeCodeExecutable?: unknown;
        };
      return {
        name,
        capabilities: metadata.capabilities,
        defaultOptions: safeDefaultOptions,
        availableModels: metadata.availableModels,
      };
    },
  );

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
