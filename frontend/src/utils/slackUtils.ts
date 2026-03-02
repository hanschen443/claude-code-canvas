import type { SlackApp } from '@/types/slack'

export function connectionStatusClass(app: SlackApp): string {
  if (app.connectionStatus === 'connected') return 'bg-green-500'
  if (app.connectionStatus === 'connecting') return 'bg-yellow-500 animate-pulse'
  return 'bg-red-500'
}
