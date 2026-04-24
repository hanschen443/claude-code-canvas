import type { ContentBlock } from "../types/message.ts";

/**
 * 當 Command 不存在時的備援提示訊息（供整合錯誤處理使用）
 */
export const COMMAND_EXPAND_FALLBACK_MESSAGE =
  "Command 不存在，請在 Pod 上重新選擇或解除綁定";

/**
 * 當使用者綁定的 Command 檔案已被刪除時，產生對應的錯誤提示文字
 */
export function buildCommandNotFoundMessage(commandId: string): string {
  return `Command 「${commandId}」已不存在，請至 Pod 設定重新選擇或解除綁定。`;
}

/**
 * 將 Command 的 markdown 內容組裝成 <command> 標籤，並 prepend 到訊息前。
 *
 * - string 訊息：回傳「標籤 + 原字串」的單一字串
 * - ContentBlock[] 訊息：把標籤字串 prepend 到第一個 type='text' block 的 text 欄位前；
 *   若全無 text block，則在陣列最前插入一個新的 text block
 */
export function expandCommandMessage(params: {
  message: string | ContentBlock[];
  markdown: string;
}): string | ContentBlock[] {
  const { message, markdown } = params;
  const tag = `<command>\n${markdown}\n</command>\n`;

  if (typeof message === "string") {
    return tag + message;
  }

  const firstTextIndex = message.findIndex((block) => block.type === "text");

  if (firstTextIndex === -1) {
    // 全無 text block，插入新的 text block 到最前面
    return [{ type: "text", text: tag }, ...message];
  }

  // 把標籤字串 prepend 到第一個 text block 的 text 欄位前
  return message.map((block, index) => {
    if (index === firstTextIndex && block.type === "text") {
      return { ...block, text: tag + block.text };
    }
    return block;
  });
}
