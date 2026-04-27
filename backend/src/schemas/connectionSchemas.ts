import { z } from "zod";
import { requestIdSchema, podIdSchema, canvasIdSchema } from "./base.js";
import { modelTypeSchema } from "./podSchemas.js";

export const anchorPositionSchema = z.enum(["top", "bottom", "left", "right"]);

// summaryModel 接受任意非空字串，允許 Codex 模型名稱（如 "gpt-5.4"）等非 Claude enum 值
const summaryModelSchema = z.string().min(1);

export const connectionCreateSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  sourcePodId: podIdSchema,
  sourceAnchor: anchorPositionSchema,
  targetPodId: podIdSchema,
  targetAnchor: anchorPositionSchema,
  summaryModel: summaryModelSchema.optional(),
  aiDecideModel: modelTypeSchema.optional(),
});

export const connectionListSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
});

export const connectionDeleteSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  connectionId: z.uuid(),
});

export const connectionUpdateSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  connectionId: z.uuid(),
  triggerMode: z.enum(["auto", "ai-decide", "direct"]).optional(),
  summaryModel: summaryModelSchema.optional(),
  aiDecideModel: modelTypeSchema.optional(),
});

export type ConnectionCreatePayload = z.infer<typeof connectionCreateSchema>;
export type ConnectionListPayload = z.infer<typeof connectionListSchema>;
export type ConnectionDeletePayload = z.infer<typeof connectionDeleteSchema>;
export type ConnectionUpdatePayload = z.infer<typeof connectionUpdateSchema>;
