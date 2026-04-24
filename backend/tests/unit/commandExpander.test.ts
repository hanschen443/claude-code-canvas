import { describe, it, expect } from "vitest";
import {
  COMMAND_EXPAND_FALLBACK_MESSAGE,
  buildCommandNotFoundMessage,
  expandCommandMessage,
} from "../../src/services/commandExpander.js";
import type {
  ContentBlock,
  ImageContentBlock,
  TextContentBlock,
} from "../../src/types/message.js";

// ─── COMMAND_EXPAND_FALLBACK_MESSAGE ────────────────────────────────────────

describe("COMMAND_EXPAND_FALLBACK_MESSAGE", () => {
  it("為非空字串", () => {
    expect(typeof COMMAND_EXPAND_FALLBACK_MESSAGE).toBe("string");
    expect(COMMAND_EXPAND_FALLBACK_MESSAGE.length).toBeGreaterThan(0);
  });
});

// ─── buildCommandNotFoundMessage ────────────────────────────────────────────

describe("buildCommandNotFoundMessage", () => {
  it("回傳包含命令名稱的 zh-TW 提示文字，使用全形引號與句號", () => {
    const result = buildCommandNotFoundMessage("my-cmd");
    expect(result).toBe(
      "Command 「my-cmd」已不存在，請至 Pod 設定重新選擇或解除綁定。",
    );
  });

  it("不同 commandId 皆正確嵌入", () => {
    const result = buildCommandNotFoundMessage("deploy-prod");
    expect(result).toBe(
      "Command 「deploy-prod」已不存在，請至 Pod 設定重新選擇或解除綁定。",
    );
  });

  it("commandId 為空字串時仍產生合法訊息", () => {
    const result = buildCommandNotFoundMessage("");
    expect(result).toBe(
      "Command 「」已不存在，請至 Pod 設定重新選擇或解除綁定。",
    );
  });
});

// ─── expandCommandMessage — string 訊息 ────────────────────────────────────

describe("expandCommandMessage（string 訊息）", () => {
  it("回傳 <command> 標籤包上後接原始訊息的單一字串", () => {
    const result = expandCommandMessage({
      message: "請幫我做這件事",
      markdown: "## 說明\n這是說明內容",
    });
    expect(result).toBe(
      "<command>\n## 說明\n這是說明內容\n</command>\n請幫我做這件事",
    );
  });

  it("原始訊息為空字串時仍能正確產生標籤", () => {
    const result = expandCommandMessage({
      message: "",
      markdown: "md content",
    });
    expect(result).toBe("<command>\nmd content\n</command>\n");
  });

  it("markdown 為空字串時標籤內容為空", () => {
    const result = expandCommandMessage({
      message: "訊息",
      markdown: "",
    });
    expect(result).toBe("<command>\n\n</command>\n訊息");
  });

  it("回傳型別為 string", () => {
    const result = expandCommandMessage({
      message: "測試",
      markdown: "md",
    });
    expect(typeof result).toBe("string");
  });
});

// ─── expandCommandMessage — ContentBlock[] 有 text block ──────────────────

describe("expandCommandMessage（ContentBlock[] 含 text block）", () => {
  it("在第一個 text block 前插入 <command> 標籤", () => {
    const blocks: ContentBlock[] = [{ type: "text", text: "原始文字" }];
    const result = expandCommandMessage({
      message: blocks,
      markdown: "## 標題",
    }) as ContentBlock[];

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect((result[0] as TextContentBlock).text).toBe(
      "<command>\n## 標題\n</command>\n原始文字",
    );
  });

  it("只有第一個 text block 被插入標籤，其餘 block 不受影響", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "第一段" },
      { type: "text", text: "第二段" },
    ];
    const result = expandCommandMessage({
      message: blocks,
      markdown: "md",
    }) as ContentBlock[];

    expect(result).toHaveLength(2);
    expect((result[0] as TextContentBlock).text).toContain("<command>");
    expect((result[1] as TextContentBlock).text).toBe("第二段");
  });

  it("第一個 block 是圖片，第二個是 text，標籤插入第二個 block", () => {
    const imgBlock: ImageContentBlock = {
      type: "image",
      mediaType: "image/png",
      base64Data: "abc123",
    };
    const blocks: ContentBlock[] = [
      imgBlock,
      { type: "text", text: "文字內容" },
    ];
    const result = expandCommandMessage({
      message: blocks,
      markdown: "md",
    }) as ContentBlock[];

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(imgBlock);
    expect((result[1] as TextContentBlock).text).toBe(
      "<command>\nmd\n</command>\n文字內容",
    );
  });

  it("回傳型別為陣列", () => {
    const result = expandCommandMessage({
      message: [{ type: "text", text: "hi" }],
      markdown: "m",
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── expandCommandMessage — ContentBlock[] 無 text block ──────────────────

describe("expandCommandMessage（ContentBlock[] 無 text block）", () => {
  it("全為圖片 block 時，於陣列最前插入新的 text block 承載 <command> 標籤", () => {
    const imgBlock: ImageContentBlock = {
      type: "image",
      mediaType: "image/jpeg",
      base64Data: "base64data",
    };
    const result = expandCommandMessage({
      message: [imgBlock],
      markdown: "image md",
    }) as ContentBlock[];

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect((result[0] as TextContentBlock).text).toBe(
      "<command>\nimage md\n</command>\n",
    );
    expect(result[1]).toEqual(imgBlock);
  });

  it("空陣列時插入一個新的 text block 到最前面", () => {
    const result = expandCommandMessage({
      message: [],
      markdown: "md",
    }) as ContentBlock[];

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect((result[0] as TextContentBlock).text).toBe(
      "<command>\nmd\n</command>\n",
    );
  });

  it("多張圖片 block 時，僅插入一個新的 text block 到最前面", () => {
    const img1: ImageContentBlock = {
      type: "image",
      mediaType: "image/png",
      base64Data: "a",
    };
    const img2: ImageContentBlock = {
      type: "image",
      mediaType: "image/gif",
      base64Data: "b",
    };
    const result = expandCommandMessage({
      message: [img1, img2],
      markdown: "md",
    }) as ContentBlock[];

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("text");
    expect(result[1]).toEqual(img1);
    expect(result[2]).toEqual(img2);
  });
});
