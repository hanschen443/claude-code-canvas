import { ref, computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { ProgressTask } from "@/components/canvas/ProgressNote.vue";
import { t } from "@/i18n";
import {
  PROGRESS_REMOVE_DELAY_MS,
  PROGRESS_REMOVE_DELAY_ON_ERROR_MS,
} from "@/lib/constants";

export type DownloadStatus = "downloading" | "completed" | "failed";

export interface DownloadTask {
  requestId: string;
  podName: string;
  progress: number;
  message: string;
  status: DownloadStatus;
}

interface UseDownloadProgressReturn {
  downloadTasks: Ref<Map<string, DownloadTask>>;
  progressTasks: ComputedRef<Map<string, ProgressTask>>;
  addTask: (taskId: string, podName: string) => void;
  updateProgress: (taskId: string, downloadedBytes: number) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, errorMessage: string) => void;
  removeTask: (taskId: string) => void;
}

/**
 * 將 bytes 格式化為人類可讀的大小字串
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1);
    return `${kb}KB`;
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb}MB`;
}

const downloadTasks: Ref<Map<string, DownloadTask>> = ref<
  Map<string, DownloadTask>
>(new Map());
const removeTimers = new Map<string, ReturnType<typeof setTimeout>>();

const removeTask = (taskId: string): void => {
  const timer = removeTimers.get(taskId);
  if (timer !== undefined) {
    clearTimeout(timer);
    removeTimers.delete(taskId);
  }
  downloadTasks.value.delete(taskId);
  downloadTasks.value = new Map(downloadTasks.value);
};

const scheduleRemove = (taskId: string, delayMs: number): void => {
  const timer = setTimeout(() => {
    removeTask(taskId);
  }, delayMs);
  removeTimers.set(taskId, timer);
};

export function useDownloadProgress(): UseDownloadProgressReturn {
  const progressTasks = computed<Map<string, ProgressTask>>(() => {
    const result = new Map<string, ProgressTask>();
    for (const [key, task] of downloadTasks.value) {
      result.set(key, {
        requestId: task.requestId,
        title: task.podName,
        progress: task.progress,
        message: task.message,
        status: task.status === "downloading" ? "processing" : task.status,
      });
    }
    return result;
  });

  const addTask = (taskId: string, podName: string): void => {
    downloadTasks.value.set(taskId, {
      requestId: taskId,
      podName,
      progress: 0,
      message: t("composable.download.started"),
      status: "downloading",
    });
    downloadTasks.value = new Map(downloadTasks.value);
  };

  const updateProgress = (taskId: string, downloadedBytes: number): void => {
    const task = downloadTasks.value.get(taskId);
    if (!task || task.status !== "downloading") return;

    // 下載進度無法預知總大小，使用漸近曲線模擬進度感（最高 90%，留給完成階段）
    // 公式：90 * (1 - e^(-bytes/500MB))，500MB 時約 57%，1GB 時約 77%，2GB 時約 89%
    const SCALE_FACTOR = 500 * 1024 * 1024;
    const estimatedProgress = Math.min(
      90,
      Math.round(90 * (1 - Math.exp(-downloadedBytes / SCALE_FACTOR))),
    );
    task.progress = Math.max(task.progress, estimatedProgress);
    task.message = t("composable.download.downloading", {
      size: formatBytes(downloadedBytes),
    });
    downloadTasks.value = new Map(downloadTasks.value);
  };

  const completeTask = (taskId: string): void => {
    const task = downloadTasks.value.get(taskId);
    if (!task) return;

    task.status = "completed";
    task.progress = 100;
    task.message = t("composable.download.completed");
    downloadTasks.value = new Map(downloadTasks.value);
    scheduleRemove(taskId, PROGRESS_REMOVE_DELAY_MS);
  };

  const failTask = (taskId: string, errorMessage: string): void => {
    const task = downloadTasks.value.get(taskId);
    if (!task) return;

    task.status = "failed";
    task.message = errorMessage || t("composable.download.failed");
    downloadTasks.value = new Map(downloadTasks.value);
    scheduleRemove(taskId, PROGRESS_REMOVE_DELAY_ON_ERROR_MS);
  };

  return {
    downloadTasks,
    progressTasks,
    addTask,
    updateProgress,
    completeTask,
    failTask,
    removeTask,
  };
}
