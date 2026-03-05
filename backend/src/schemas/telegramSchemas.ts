import { z } from 'zod';
import { TELEGRAM_CHAT_TYPES } from '../types/telegram.js';

export const telegramBotListSchema = z.object({});

export const telegramBotCreateSchema = z.object({
  name: z.string().min(1).max(100),
  botToken: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, 'Bot Token 格式不正確'),
});

const telegramBotIdOnlySchema = z.object({
  telegramBotId: z.string().uuid(),
});

export const telegramBotDeleteSchema = telegramBotIdOnlySchema;
export const telegramBotGetSchema = telegramBotIdOnlySchema;
export const telegramBotChatsSchema = telegramBotIdOnlySchema;

export const podBindTelegramSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
  telegramBotId: z.string().uuid(),
  telegramChatId: z.number().int().positive({ message: 'User ID 必須為正整數' }),
  chatType: z.enum(TELEGRAM_CHAT_TYPES),
});

export const podUnbindTelegramSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
});

export type TelegramBotListPayload = z.infer<typeof telegramBotListSchema>;
export type TelegramBotCreatePayload = z.infer<typeof telegramBotCreateSchema>;
export type TelegramBotDeletePayload = z.infer<typeof telegramBotDeleteSchema>;
export type TelegramBotGetPayload = z.infer<typeof telegramBotGetSchema>;
export type TelegramBotChatsPayload = z.infer<typeof telegramBotChatsSchema>;
export type PodBindTelegramPayload = z.infer<typeof podBindTelegramSchema>;
export type PodUnbindTelegramPayload = z.infer<typeof podUnbindTelegramSchema>;
