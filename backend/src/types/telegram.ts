export type TelegramBotConnectionStatus = 'connected' | 'disconnected' | 'error';

export type TelegramChatType = 'private' | 'group' | 'supergroup';

export const TELEGRAM_CHAT_TYPES = ['private', 'group'] as const;
export type TelegramBindingChatType = typeof TELEGRAM_CHAT_TYPES[number];

export interface TelegramChat {
  id: number;
  type: TelegramChatType;
  title?: string;
  username?: string;
}

export interface TelegramBot {
  id: string;
  name: string;
  botToken: string;
  connectionStatus: TelegramBotConnectionStatus;
  chats: TelegramChat[];
  botUsername: string;
}

export interface PodTelegramBinding {
  telegramBotId: string;
  telegramChatId: number;
  chatType: TelegramBindingChatType;
}

export interface TelegramMessage {
  id: string;
  telegramBotId: string;
  chatId: number;
  userId: number;
  userName: string;
  text: string;
  messageId: number;
}
