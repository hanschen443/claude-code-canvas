import path from "path";
import { z } from "zod";
import { requestIdSchema, podIdSchema, canvasIdSchema } from "./base.js";

export const MAX_MESSAGE_LENGTH = 10000;

/** 純文字內容區塊：type="text" + text 字串 */
export const TextContentBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

/** 圖片內容區塊：type="image" + mediaType 白名單 + base64Data */
export const ImageContentBlockSchema = z
  .object({
    type: z.literal("image"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
    base64Data: z
      .string()
      .regex(/^[A-Za-z0-9+/]*={0,2}$/, "base64Data 包含非法字元"),
  })
  .refine(
    (data) => {
      const base64Length = data.base64Data.length;
      const decodedSize = (base64Length * 3) / 4;
      const maxSize = 5 * 1024 * 1024;
      return decodedSize <= maxSize;
    },
    {
      message: "圖片大小不得超過 5MB",
    },
  );

/** ContentBlock union：text | image（帶 runtime 驗證） */
export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextContentBlockSchema,
  ImageContentBlockSchema,
]);

/** 向下相容別名，供現有程式碼繼續使用 */
export const contentBlockSchema = ContentBlockSchema;

/** 附件 schema：單一檔案的 filename 與 base64 內容 */
export const attachmentSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((name) => name.trim().length > 0, {
      message: "filename 不得為純空白",
    })
    .refine((name) => path.basename(name) === name, {
      message: "filename 不得包含路徑分隔符或 '..'",
    }),
  contentBase64: z
    .string()
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, "contentBase64 包含非法字元"),
});

export const chatSendSchema = z
  .object({
    requestId: requestIdSchema,
    canvasId: canvasIdSchema,
    podId: podIdSchema,
    message: z.union([
      // 允許空字串，讓拖檔流程（attachments 不為空）能通過 schema；
      // 無附件時的空字串檢查交由下方 superRefine 處理
      z.string().max(MAX_MESSAGE_LENGTH),
      z.array(contentBlockSchema).min(1),
    ]),
    attachments: z.array(attachmentSchema).min(1).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    // 無附件或附件為空時，純文字 message 不得為空白
    if (
      typeof data.message === "string" &&
      data.message.trim().length === 0 &&
      (!data.attachments || data.attachments.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Too small: expected string to have >=1 characters",
        path: ["message"],
      });
    }

    if (!data.attachments) return;

    // 逐檔估算 base64 解碼後 bytes，超過單檔 10 MB 上限即拒絕
    // 公式：length * 3 / 4 - padding ('=') 個數
    const maxSingleBytes = 10 * 1024 * 1024; // 10 MB
    for (let i = 0; i < data.attachments.length; i++) {
      const b64 = data.attachments[i].contentBase64;
      const padding = (b64.match(/={1,2}$/) ?? [])[0]?.length ?? 0;
      const decodedBytes = Math.floor((b64.length * 3) / 4) - padding;
      if (decodedBytes > maxSingleBytes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "單檔大小超過 10 MB 上限",
          path: ["attachments", i, "contentBase64"],
        });
      }
    }
  });

export const chatHistorySchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
});

export const chatAbortSchema = z.object({
  requestId: requestIdSchema,
  canvasId: canvasIdSchema,
  podId: podIdSchema,
});

export type Attachment = z.infer<typeof attachmentSchema>;
export type AttachmentInput = z.input<typeof attachmentSchema>;
export type ChatSendPayload = z.infer<typeof chatSendSchema>;
export type ChatHistoryPayload = z.infer<typeof chatHistorySchema>;
export type ChatAbortPayload = z.infer<typeof chatAbortSchema>;
