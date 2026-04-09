import { v4 as uuidv4 } from "uuid";
import type { RunContext } from "../types/run.js";
import type { ContentBlock } from "../types/index.js";
import { WebSocketResponseEvents } from "../schemas/index.js";
import { runStore } from "../services/runStore.js";
import { socketService } from "../services/socketService.js";
import { extractDisplayContent } from "./chatHelpers.js";
import { runExecutionService } from "../services/workflow/runExecutionService.js";
import { executeStreamingChat } from "../services/claude/streamingChatExecutor.js";
import { RunModeExecutionStrategy } from "../services/executionStrategy.js";
import { logger } from "./logger.js";

export interface LaunchMultiInstanceRunParams {
  canvasId: string;
  podId: string;
  message: string | ContentBlock[];
  displayMessage?: string;
  abortable: boolean;
  onComplete: (runContext: RunContext) => void;
  onAborted?: (canvasId: string, podId: string, messageId: string) => void;
  onRunContextCreated?: (runContext: RunContext) => void;
}

export async function launchMultiInstanceRun(
  params: LaunchMultiInstanceRunParams,
): Promise<RunContext> {
  const {
    canvasId,
    podId,
    message,
    displayMessage,
    abortable,
    onComplete,
    onAborted,
    onRunContextCreated,
  } = params;

  // triggerMessage 僅用於 Run 標題顯示，固定使用純文字（displayMessage 或從 ContentBlock[] 提取文字）
  // injectRunUserMessage 第三個參數用於存 DB 和廣播給前端，保留原始格式（displayMessage 優先，否則傳入原始 message 可能含 ContentBlock[]）
  const triggerMessage = displayMessage ?? extractDisplayContent(message);
  const runContext = await runExecutionService.createRun(
    canvasId,
    podId,
    triggerMessage,
  );
  runExecutionService.startPodInstance(runContext, podId);
  await injectRunUserMessage(runContext, podId, displayMessage ?? message);

  onRunContextCreated?.(runContext);

  const strategy = new RunModeExecutionStrategy(canvasId, runContext);

  await executeStreamingChat(
    { canvasId, podId, message, abortable, strategy },
    {
      onComplete: () => onComplete(runContext),
      onError: (_canvasId, _podId, error) => {
        // 原始 error.message 可能含內部技術細節（SDK 錯誤、API 路徑等），
        // 僅記錄到 server log，不直接送往前端以避免資訊洩漏
        logger.error("Run", "Error", `Pod ${podId} 執行失敗: ${error.message}`);
        runExecutionService.errorPodInstance(runContext, podId, "執行發生錯誤");
      },
      ...(onAborted ? { onAborted } : {}),
    },
  );

  return runContext;
}

export async function injectRunUserMessage(
  runContext: RunContext,
  podId: string,
  content: string | ContentBlock[],
): Promise<void> {
  const displayContent = extractDisplayContent(content);

  // 不呼叫 podStore.setStatus（pod 全域狀態不變）
  await runStore.addRunMessage(runContext.runId, podId, "user", displayContent);

  socketService.emitToCanvas(
    runContext.canvasId,
    WebSocketResponseEvents.RUN_MESSAGE,
    {
      runId: runContext.runId,
      canvasId: runContext.canvasId,
      podId,
      messageId: uuidv4(),
      content: displayContent,
      isPartial: false,
      role: "user",
    },
  );
}
