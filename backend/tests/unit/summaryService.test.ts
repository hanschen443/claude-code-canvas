// Import 真實模組
import { summaryService } from "../../src/services/summaryService.js";
import { commandService } from "../../src/services/commandService.js";
import { podStore } from "../../src/services/podStore.js";
import { messageStore } from "../../src/services/messageStore.js";
import { runStore } from "../../src/services/runStore.js";
import * as disposableChatService from "../../src/services/disposableChatService.js";
import { summaryPromptBuilder } from "../../src/services/summaryPromptBuilder.js";
import { logger } from "../../src/utils/logger.js";
import type { RunContext } from "../../src/types/run.js";

describe("SummaryService", () => {
  const mockSourcePod = {
    id: "source-pod",
    name: "Source Pod",
    provider: "claude" as const,
    model: "claude-sonnet-4-5-20250929" as const,
    sessionId: null,
    repositoryId: null,
    workspacePath: "/test/workspace",
    commandId: null,
    status: "idle" as const,
  } as any;

  const mockTargetPod = {
    id: "target-pod",
    name: "Target Pod",
    provider: "claude" as const,
    model: "claude-sonnet-4-5-20250929" as const,
    sessionId: null,
    repositoryId: null,
    workspacePath: "/test/workspace",
    commandId: null,
    status: "idle" as const,
  } as any;

  const mockMessages: any[] = [
    {
      id: "msg-1",
      role: "user" as const,
      content: "Hello",
      timestamp: new Date().toISOString(),
    },
    {
      id: "msg-2",
      role: "assistant" as const,
      content: "Hi there!",
      timestamp: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    // commandService
    vi.spyOn(commandService, "getContent").mockResolvedValue(null);

    // podStore
    vi.spyOn(podStore, "getById").mockImplementation(
      (_canvasId: string, podId: string) => {
        if (podId === "source-pod") return mockSourcePod;
        if (podId === "target-pod") return mockTargetPod;
        return undefined;
      },
    );

    // messageStore
    vi.spyOn(messageStore, "getMessages").mockReturnValue(mockMessages);

    // runStore
    vi.spyOn(runStore, "getRunMessages").mockReturnValue(mockMessages);

    // disposableChatService
    vi.spyOn(disposableChatService, "executeDisposableChat").mockResolvedValue({
      success: true,
      content: "Summary result",
      resolvedModel: "claude-sonnet-4-5-20250929",
    });

    // summaryPromptBuilder
    vi.spyOn(summaryPromptBuilder, "formatConversationHistory").mockReturnValue(
      "[User]: Hello\n\n[Assistant]: Hi",
    );
    vi.spyOn(summaryPromptBuilder, "buildSystemPrompt").mockReturnValue(
      "System prompt",
    );
    vi.spyOn(summaryPromptBuilder, "buildUserPrompt").mockReturnValue(
      "User prompt",
    );

    // logger
    vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generateSummaryForTarget Command 讀取邏輯", () => {
    it("Target Pod 有 commandId 時，正確讀取 Command 內容", async () => {
      const targetPodWithCommand = {
        ...mockTargetPod,
        commandId: "review-command",
      };

      (podStore.getById as any).mockImplementation(
        (canvasId: string, podId: string) => {
          if (podId === "source-pod") return mockSourcePod;
          if (podId === "target-pod") return targetPodWithCommand;
          return null;
        },
      );

      (commandService.getContent as any).mockResolvedValue(
        "Review the code carefully.",
      );

      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(commandService.getContent).toHaveBeenCalledWith("review-command");
      expect(summaryPromptBuilder.buildUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPodCommand: "Review the code carefully.",
        }),
      );
    });

    it("Target Pod commandId 為 null 時，不讀取 Command", async () => {
      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(commandService.getContent).not.toHaveBeenCalled();
      expect(summaryPromptBuilder.buildUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPodCommand: null,
        }),
      );
    });

    it("commandService.getContent 回傳 null 時，降級處理", async () => {
      const targetPodWithCommand = {
        ...mockTargetPod,
        commandId: "nonexistent-command",
      };

      (podStore.getById as any).mockImplementation(
        (canvasId: string, podId: string) => {
          if (podId === "source-pod") return mockSourcePod;
          if (podId === "target-pod") return targetPodWithCommand;
          return null;
        },
      );

      (commandService.getContent as any).mockResolvedValue(null);

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(commandService.getContent).toHaveBeenCalledWith(
        "nonexistent-command",
      );
      expect(summaryPromptBuilder.buildUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPodCommand: null,
        }),
      );
      expect(result.success).toBe(true);
    });

    it("正確傳遞 targetPodCommand 至 buildUserPrompt", async () => {
      const targetPodWithCommand = {
        ...mockTargetPod,
        commandId: "analyze-command",
      };

      (podStore.getById as any).mockImplementation(
        (canvasId: string, podId: string) => {
          if (podId === "source-pod") return mockSourcePod;
          if (podId === "target-pod") return targetPodWithCommand;
          return null;
        },
      );

      (commandService.getContent as any).mockResolvedValue(
        "Analyze the performance.",
      );

      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(summaryPromptBuilder.buildUserPrompt).toHaveBeenCalledWith({
        sourcePodName: "Source Pod",
        targetPodName: "Target Pod",
        targetPodCommand: "Analyze the performance.",
        conversationHistory: "[User]: Hello\n\n[Assistant]: Hi",
      });
    });
  });

  describe("generateSummaryForTarget runContext 訊息來源選擇", () => {
    const mockRunContext: RunContext = {
      runId: "run-1",
      canvasId: "canvas-1",
      sourcePodId: "source-pod",
    };

    it("有 runContext 時從 runStore 讀取訊息", async () => {
      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
        mockRunContext,
      );

      expect(runStore.getRunMessages).toHaveBeenCalledWith(
        "run-1",
        "source-pod",
      );
      expect(messageStore.getMessages).not.toHaveBeenCalled();
    });

    it("沒有 runContext 時從 messageStore 讀取訊息", async () => {
      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(messageStore.getMessages).toHaveBeenCalledWith("source-pod");
      expect(runStore.getRunMessages).not.toHaveBeenCalled();
    });

    it("有 runContext 但 run 內無訊息時回傳錯誤", async () => {
      (runStore.getRunMessages as any).mockReturnValue([]);

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
        mockRunContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("沒有訊息記錄");
    });
  });

  describe("generateSummaryForTarget 使用傳入的 summaryModel 參數", () => {
    it("呼叫 executeDisposableChat 時帶入傳入的 provider 與 summaryModel", async () => {
      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "opus",
      );

      expect(disposableChatService.executeDisposableChat).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "claude", model: "opus" }),
      );
    });

    it("codex provider 時帶入 provider=codex 與對應 model", async () => {
      await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "codex",
        "gpt-5.4",
      );

      expect(disposableChatService.executeDisposableChat).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "codex", model: "gpt-5.4" }),
      );
    });
  });

  describe("generateSummaryForTarget resolvedModel 回傳", () => {
    it("成功時 resolvedModel 應包含實際使用的模型名稱", async () => {
      (disposableChatService.executeDisposableChat as any).mockResolvedValue({
        success: true,
        content: "Summary result",
        resolvedModel: "claude-sonnet-4-5-20250929",
      });

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(true);
      expect(result.resolvedModel).toBe("claude-sonnet-4-5-20250929");
    });

    it("fallback 路徑時 resolvedModel 不應存在", async () => {
      // success: false 時 disposableChatService 不應回傳 resolvedModel（與真實行為對齊）
      (disposableChatService.executeDisposableChat as any).mockResolvedValue({
        success: false,
        content: "",
        resolvedModel: undefined,
        error: "執行失敗",
      });

      const messagesWithAssistant: any[] = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "Hello",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          content: "fallback content",
          timestamp: new Date().toISOString(),
        },
      ];
      (messageStore.getMessages as any).mockReturnValue(messagesWithAssistant);

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(true);
      expect(result.resolvedModel).toBeUndefined();
    });
  });

  describe("generateSummaryForTarget 錯誤處理", () => {
    it("Source Pod 不存在時回傳錯誤", async () => {
      (podStore.getById as any).mockImplementation(
        (canvasId: string, podId: string) => {
          if (podId === "target-pod") return mockTargetPod;
          return null;
        },
      );

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "nonexistent",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("找不到來源 Pod：nonexistent");
    });

    it("Target Pod 不存在時回傳錯誤", async () => {
      (podStore.getById as any).mockImplementation(
        (canvasId: string, podId: string) => {
          if (podId === "source-pod") return mockSourcePod;
          return null;
        },
      );

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "nonexistent",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("找不到目標 Pod：nonexistent");
    });

    it("Source Pod 沒有訊息時回傳錯誤", async () => {
      (messageStore.getMessages as any).mockReturnValue([]);

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("沒有訊息記錄");
    });

    it("disposableChat 執行失敗但有 fallback 訊息時，應回傳 success: true 並使用 fallback 內容", async () => {
      (disposableChatService.executeDisposableChat as any).mockResolvedValue({
        success: false,
        content: "",
        resolvedModel: "sonnet",
        error: "執行失敗",
      });

      const messagesWithAssistant: any[] = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "Hello",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          content: "fallback content",
          timestamp: new Date().toISOString(),
        },
      ];
      (messageStore.getMessages as any).mockReturnValue(messagesWithAssistant);

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(true);
      expect(result.summary).toBe("fallback content");
    });

    it("disposableChat 執行失敗且無 fallback 訊息時，應回傳 success: false", async () => {
      (disposableChatService.executeDisposableChat as any).mockResolvedValue({
        success: false,
        content: "",
        resolvedModel: "sonnet",
        error: "some error",
      });

      const messagesWithoutAssistant: any[] = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "Hello",
          timestamp: new Date().toISOString(),
        },
      ];
      (messageStore.getMessages as any).mockReturnValue(
        messagesWithoutAssistant,
      );

      const result = await summaryService.generateSummaryForTarget(
        "canvas-1",
        "source-pod",
        "target-pod",
        "claude",
        "sonnet",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("some error");
    });
  });
});
