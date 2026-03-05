export const BUSY_REPLY_COOLDOWN_MS = 30_000;

export function shouldSendBusyReply(cooldownMap: Map<string, number>, key: string): boolean {
    const lastReplyTime = cooldownMap.get(key);
    const now = Date.now();
    if (lastReplyTime && now - lastReplyTime < BUSY_REPLY_COOLDOWN_MS) {
        return false;
    }
    cooldownMap.set(key, now);
    return true;
}
