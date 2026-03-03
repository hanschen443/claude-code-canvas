import path from 'path';
import { persistenceService } from './index.js';
import type { PersistedMessage, ChatHistory } from '../../types';
import { Result, ok, err } from '../../types';

const POD_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

class ChatPersistenceService {
  getChatFilePath(canvasDir: string, podId: string): Result<string> {
    if (!POD_ID_PATTERN.test(podId)) {
      return err(`無效的 podId 格式：${podId}`);
    }
    return ok(path.join(canvasDir, `pod-${podId}`, 'chat.json'));
  }

  private async mutateChatHistory(
    filePath: string,
    podId: string,
    errorMessage: string,
    mutate: (chatHistory: ChatHistory) => void
  ): Promise<Result<void>> {
    const readResult = await persistenceService.readJson<ChatHistory>(filePath);
    if (!readResult.success) {
      return err(`${errorMessage} (Pod ${podId})`);
    }

    const chatHistory: ChatHistory = readResult.data ?? {
      messages: [],
      lastUpdated: new Date().toISOString(),
    };

    mutate(chatHistory);
    chatHistory.lastUpdated = new Date().toISOString();

    const writeResult = await persistenceService.writeJson(filePath, chatHistory);
    if (!writeResult.success) {
      return err(`${errorMessage} (Pod ${podId})`);
    }

    return ok(undefined);
  }

  async saveMessage(canvasDir: string, podId: string, message: PersistedMessage): Promise<Result<void>> {
    const filePathResult = this.getChatFilePath(canvasDir, podId);
    if (!filePathResult.success) return err(filePathResult.error ?? '無效的 podId');
    return this.mutateChatHistory(filePathResult.data, podId, '儲存訊息失敗', (chatHistory) => {
      chatHistory.messages.push(message);
    });
  }

  async upsertMessage(canvasDir: string, podId: string, message: PersistedMessage): Promise<Result<void>> {
    const filePathResult = this.getChatFilePath(canvasDir, podId);
    if (!filePathResult.success) return err(filePathResult.error ?? '無效的 podId');
    return this.mutateChatHistory(filePathResult.data, podId, 'Upsert 訊息失敗', (chatHistory) => {
      const existingIndex = chatHistory.messages.findIndex(msg => msg.id === message.id);
      if (existingIndex >= 0) {
        chatHistory.messages[existingIndex] = message;
      } else {
        chatHistory.messages.push(message);
      }
    });
  }

  async loadChatHistory(canvasDir: string, podId: string): Promise<ChatHistory | null> {
    const filePathResult = this.getChatFilePath(canvasDir, podId);
    if (!filePathResult.success) return null;

    const result = await persistenceService.readJson<ChatHistory>(filePathResult.data);

    if (!result.success) {
      return null;
    }

    return result.data ?? null;
  }

  async clearChatHistory(canvasDir: string, podId: string): Promise<Result<void>> {
    const filePathResult = this.getChatFilePath(canvasDir, podId);
    if (!filePathResult.success) return err(filePathResult.error ?? '無效的 podId');

    const result = await persistenceService.deleteFile(filePathResult.data);
    if (!result.success) {
      return err(`清除聊天紀錄失敗 (Pod ${podId})`);
    }

    return ok(undefined);
  }
}

export const chatPersistenceService = new ChatPersistenceService();
