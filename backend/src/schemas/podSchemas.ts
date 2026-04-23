import { z } from "zod";
import {
  requestIdSchema,
  podIdSchema,
  canvasIdSchema,
  coordinateSchema,
} from "./base.js";
import { scheduleConfigSchema } from "./scheduleSchemas.js";

export const modelTypeSchema = z.enum(["opus", "sonnet", "haiku"]);

/** AI provider 名稱的允許清單，供多處 schema 共用 */
export const providerSchema = z.enum(["claude", "codex"]);

/** provider 設定物件，僅允許已知欄位（.strict() 拒絕未知 key），供多處 schema 共用 */
export const providerConfigSchema = z
  .object({
    /** model 名稱，僅允許字母、數字、點、底線、連字號，最長 100 字元 */
    model: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+$/, "model 名稱包含不允許的字元")
      .max(100)
      .optional(),
  })
  .strict();

export const podCreateSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  name: z.string().min(1).max(100),
  x: coordinateSchema,
  y: coordinateSchema,
  rotation: z.number(),
  /** AI provider 名稱，預設為 claude，未提供時由服務層補預設值 */
  provider: providerSchema.optional(),
  /** provider 的設定物件，僅允許已知欄位（.strict() 拒絕未知 key） */
  providerConfig: providerConfigSchema.optional(),
});

export const podListSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
});

export const podGetSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
});

export const podMoveSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
  x: coordinateSchema,
  y: coordinateSchema,
});

export const podRenameSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
  name: z.string().min(1).max(100),
});

export const podSetModelSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
  /** pod:set-model 可能傳 Claude 短名（opus/sonnet/haiku）或 Codex 完整名（gpt-5.4 等），使用與 providerConfig.model 同規則的 regex */
  model: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+$/, "model 名稱包含不允許的字元")
    .max(100),
});

export const podSetScheduleSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
  schedule: scheduleConfigSchema.nullable(),
});

export const podDeleteSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
});

export const podSetPluginsSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
  pluginIds: z
    .array(
      z
        .string()
        .regex(/^[a-zA-Z0-9@._-]+$/)
        .max(100),
    )
    .max(50),
});

export type PodCreatePayload = z.infer<typeof podCreateSchema>;
export type PodListPayload = z.infer<typeof podListSchema>;
export type PodGetPayload = z.infer<typeof podGetSchema>;
export type PodMovePayload = z.infer<typeof podMoveSchema>;
export type PodRenamePayload = z.infer<typeof podRenameSchema>;
export type PodSetModelPayload = z.infer<typeof podSetModelSchema>;
export type PodSetSchedulePayload = z.infer<typeof podSetScheduleSchema>;
export type PodDeletePayload = z.infer<typeof podDeleteSchema>;
export type PodSetPluginsPayload = z.infer<typeof podSetPluginsSchema>;
