import { executeDisposableChat } from "./disposableChatService.js";
import { summaryPromptBuilder } from "./summaryPromptBuilder.js";
import { podStore } from "./podStore.js";
import { messageStore } from "./messageStore.js";
import { runStore } from "./runStore.js";
import { commandService } from "./commandService.js";
import { logger } from "../utils/logger.js";
import { getLastAssistantMessage } from "../utils/messageHelper.js";
import type { Pod, PersistedMessage } from "../types/index.js";
import type { RunContext } from "../types/run.js";
import type { ProviderName } from "./provider/index.js";

interface TargetSummaryResult {
  targetPodId: string;
  summary: string;
  success: boolean;
  error?: string;
  /** 實際使用的模型名稱（disposableChatService 成功時才有值，可能因 fallback 與輸入不同） */
  resolvedModel?: string;
}

async function buildSummaryContext(
  sourcePod: Pod,
  targetPod: Pod,
  messages: PersistedMessage[],
): Promise<{
  sourcePodName: string;
  targetPodName: string;
  targetPodCommand: string | null;
  conversationHistory: string;
}> {
  const targetPodCommand = targetPod.commandId
    ? await commandService.getContent(targetPod.commandId)
    : null;

  const conversationHistory =
    summaryPromptBuilder.formatConversationHistory(messages);

  return {
    sourcePodName: sourcePod.name,
    targetPodName: targetPod.name,
    targetPodCommand,
    conversationHistory,
  };
}

class SummaryService {
  async generateSummaryForTarget(
    canvasId: string,
    sourcePodId: string,
    targetPodId: string,
    provider: ProviderName,
    summaryModel: string,
    runContext?: RunContext,
  ): Promise<TargetSummaryResult> {
    const sourcePod = podStore.getById(canvasId, sourcePodId);
    if (!sourcePod) {
      return {
        targetPodId,
        summary: "",
        success: false,
        error: `找不到來源 Pod：${sourcePodId}`,
      };
    }

    const targetPod = podStore.getById(canvasId, targetPodId);
    if (!targetPod) {
      return {
        targetPodId,
        summary: "",
        success: false,
        error: `找不到目標 Pod：${targetPodId}`,
      };
    }

    const messages = runContext
      ? runStore.getRunMessages(runContext.runId, sourcePodId)
      : messageStore.getMessages(sourcePodId);
    if (messages.length === 0) {
      return {
        targetPodId,
        summary: "",
        success: false,
        error: `來源 Pod ${sourcePodId} 沒有訊息記錄`,
      };
    }

    const context = await buildSummaryContext(sourcePod, targetPod, messages);
    const systemPrompt = summaryPromptBuilder.buildSystemPrompt();
    const userPrompt = summaryPromptBuilder.buildUserPrompt(context);

    const result = await executeDisposableChat({
      provider,
      model: summaryModel,
      systemPrompt,
      userMessage: userPrompt,
      workspacePath: sourcePod.workspacePath,
    });

    if (!result.success) {
      logger.error(
        "Workflow",
        "Error",
        `[SummaryService] 無法為目標 ${targetPodId} 生成摘要：${result.error ?? ""}`,
      );

      // fallback 到上游最後一則 Assistant 訊息
      let fallbackContent: string | null;
      if (runContext) {
        const runMessages = runStore.getRunMessages(
          runContext.runId,
          sourcePodId,
        );
        const lastAssistant = [...runMessages]
          .reverse()
          .find((message) => message.role === "assistant");
        fallbackContent = lastAssistant?.content ?? null;
      } else {
        fallbackContent = getLastAssistantMessage(sourcePodId);
      }

      if (fallbackContent !== null) {
        return { targetPodId, summary: fallbackContent, success: true };
      }

      return {
        targetPodId,
        summary: "",
        success: false,
        error: result.error ?? "",
      };
    }

    return {
      targetPodId,
      summary: result.content,
      success: true,
      resolvedModel: result.resolvedModel,
    };
  }
}

export const summaryService = new SummaryService();
