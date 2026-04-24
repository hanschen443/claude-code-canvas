export type StreamEvent =
  | TextStreamEvent
  | ToolUseStreamEvent
  | ToolResultStreamEvent
  | CompleteStreamEvent
  | ErrorStreamEvent;

interface TextStreamEvent {
  type: "text";
  content: string;
}

interface ToolUseStreamEvent {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolResultStreamEvent {
  type: "tool_result";
  toolUseId: string;
  toolName: string;
  output: string;
}

interface CompleteStreamEvent {
  type: "complete";
}

interface ErrorStreamEvent {
  type: "error";
  error: string;
  /** true 代表嚴重錯誤，串流應立即中斷 */
  fatal?: boolean;
  /**
   * 結構化錯誤代碼，供前端分派對應處理邏輯。
   * Phase 2-E 會補完白名單機制與 handleErrorEvent 的分派邏輯。
   */
  code?: string;
}

export type StreamCallback = (event: StreamEvent) => void;
