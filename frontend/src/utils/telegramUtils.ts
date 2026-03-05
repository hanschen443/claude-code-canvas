import type { TelegramBot, TelegramBotConnectionStatus } from '@/types/telegram'

export const TELEGRAM_CONNECTION_STATUS_CONFIG: Record<TelegramBotConnectionStatus, { dotClass: string; bg: string; label: string }> = {
  connected: { dotClass: 'bg-green-500', bg: 'bg-white', label: '已連接' },
  disconnected: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '已斷線' },
  error: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '錯誤' },
}

export function connectionStatusClass(bot: TelegramBot): string {
  return TELEGRAM_CONNECTION_STATUS_CONFIG[bot.connectionStatus]?.dotClass ?? 'bg-red-500'
}
