import { z } from 'zod';
import { requestIdSchema, canvasIdSchema, coordinateSchema, createPasteNoteItemSchema } from './base.js';
import { modelTypeSchema } from './podSchemas.js';
import { anchorPositionSchema } from './connectionSchemas.js';

export const pastePodItemSchema = z.object({
  originalId: z.uuid(),
  name: z.string().min(1).max(100),
  x: coordinateSchema,
  y: coordinateSchema,
  rotation: z.number().finite(),
  outputStyleId: z.string().uuid().nullable().optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  subAgentIds: z.array(z.string().uuid()).optional(),
  model: modelTypeSchema.optional(),
  repositoryId: z.string().uuid().nullable().optional(),
  commandId: z.string().uuid().nullable().optional(),
});

export const pasteOutputStyleNoteItemSchema = createPasteNoteItemSchema({ outputStyleId: z.string() });

export const pasteSkillNoteItemSchema = createPasteNoteItemSchema({ skillId: z.string() });

export const pasteRepositoryNoteItemSchema = createPasteNoteItemSchema({ repositoryId: z.string() });

export const pasteSubAgentNoteItemSchema = createPasteNoteItemSchema({ subAgentId: z.string() });

export const pasteCommandNoteItemSchema = createPasteNoteItemSchema({ commandId: z.string() });

export const pasteMcpServerNoteItemSchema = createPasteNoteItemSchema({ mcpServerId: z.string() });

export const pasteConnectionItemSchema = z.object({
  originalSourcePodId: z.uuid(),
  sourceAnchor: anchorPositionSchema,
  originalTargetPodId: z.uuid(),
  targetAnchor: anchorPositionSchema,
  triggerMode: z.enum(['auto', 'ai-decide', 'direct']).optional(),
});

export const canvasPasteSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  pods: z.array(pastePodItemSchema).max(100),
  outputStyleNotes: z.array(pasteOutputStyleNoteItemSchema).max(100),
  skillNotes: z.array(pasteSkillNoteItemSchema).max(100),
  repositoryNotes: z.array(pasteRepositoryNoteItemSchema).max(100),
  subAgentNotes: z.array(pasteSubAgentNoteItemSchema).max(100),
  commandNotes: z.array(pasteCommandNoteItemSchema).max(100).optional(),
  mcpServerNotes: z.array(pasteMcpServerNoteItemSchema).max(100).optional(),
  connections: z.array(pasteConnectionItemSchema).max(200).optional(),
});

export type PastePodItem = z.infer<typeof pastePodItemSchema>;
export type CanvasPastePayload = z.infer<typeof canvasPasteSchema>;
export type PasteOutputStyleNoteItem = z.infer<typeof pasteOutputStyleNoteItemSchema>;
export type PasteSkillNoteItem = z.infer<typeof pasteSkillNoteItemSchema>;
export type PasteRepositoryNoteItem = z.infer<typeof pasteRepositoryNoteItemSchema>;
export type PasteSubAgentNoteItem = z.infer<typeof pasteSubAgentNoteItemSchema>;
export type PasteCommandNoteItem = z.infer<typeof pasteCommandNoteItemSchema>;
export type PasteMcpServerNoteItem = z.infer<typeof pasteMcpServerNoteItemSchema>;
export type PasteConnectionItem = z.infer<typeof pasteConnectionItemSchema>;
