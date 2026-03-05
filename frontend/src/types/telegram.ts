export type TelegramBotConnectionStatus = 'connected' | 'disconnected' | 'error'

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup'
  title?: string
  username?: string
}

export interface TelegramBot {
  id: string
  name: string
  connectionStatus: TelegramBotConnectionStatus
  chats: TelegramChat[]
  botUsername: string
}

export interface PodTelegramBinding {
  telegramBotId: string
  telegramChatId: number
  chatType: 'private' | 'group'
}
