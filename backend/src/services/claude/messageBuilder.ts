import { ContentBlock } from "../../types";

type ClaudeTextContent = {
  type: "text";
  text: string;
};

type ClaudeImageContent = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

export type ClaudeMessageContent = ClaudeTextContent | ClaudeImageContent;

export type SDKUserMessage = {
  type: "user";
  message: {
    role: "user";
    content: ClaudeMessageContent[];
  };
  parent_tool_use_id: string | null;
  session_id: string;
};

function processTextBlock(text: string): ClaudeTextContent | null {
  if (text.trim().length === 0) {
    return null;
  }
  return { type: "text", text };
}

function processImageBlock(
  block: Extract<ContentBlock, { type: "image" }>,
): ClaudeImageContent {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: block.mediaType,
      data: block.base64Data,
    },
  };
}

function convertBlockToContent(
  block: ContentBlock,
): ClaudeMessageContent | null {
  if (block.type === "text") {
    return processTextBlock(block.text);
  }
  if (block.type === "image") {
    return processImageBlock(block);
  }
  return null;
}

export function buildClaudeContentBlocks(
  message: ContentBlock[],
): ClaudeMessageContent[] {
  const contentArray: ClaudeMessageContent[] = [];

  for (const block of message) {
    const content = convertBlockToContent(block);
    if (content) {
      contentArray.push(content);
    }
  }

  if (contentArray.length === 0) {
    contentArray.push({ type: "text", text: "請開始執行" });
  }

  return contentArray;
}

export function createUserMessageStream(
  content: ClaudeMessageContent[],
  sessionId: string,
): AsyncIterable<SDKUserMessage> {
  return (async function* (): AsyncGenerator<SDKUserMessage, void, undefined> {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content,
      },
      parent_tool_use_id: null,
      session_id: sessionId,
    };
  })();
}
