import { ref, type Ref } from "vue";
import { useToast } from "@/composables/useToast";
import { t } from "@/i18n";
import { MAX_POD_DROP_FILE_BYTES } from "@/lib/constants";
import type { PodChatAttachment } from "@/types/websocket/requests";

type ValidateDropResult = { ok: true } | { ok: false; toastKey: string };

/**
 * 純函式：驗證 drop 事件中的 items 與 files 是否合法。
 * 回傳 { ok: true } 代表可繼續讀檔；{ ok: false, toastKey } 代表應顯示對應 i18n 錯誤。
 *
 * 驗證順序：
 * 1. 資料夾偵測（透過 DataTransferItemList.webkitGetAsEntry）
 * 2. 空檔清單
 * 3. 單檔大小超過上限
 */
export function validateDropFiles(
  items: DataTransferItemList | null | undefined,
  files: FileList | null | undefined,
): ValidateDropResult {
  // 1. 資料夾偵測
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        return { ok: false, toastKey: "errors.attachmentFolderNotAllowed" };
      }
    }
  }

  // 2. 空檔清單
  if (!files || files.length === 0) {
    return { ok: false, toastKey: "errors.attachmentEmpty" };
  }

  // 3. 單檔大小超過上限
  for (const file of Array.from(files)) {
    if (file.size > MAX_POD_DROP_FILE_BYTES) {
      return { ok: false, toastKey: "errors.attachmentTooLarge" };
    }
  }

  // 4. 檔案名稱路徑字元過濾（defense-in-depth：後端有雙重防禦，前端提前擋下）
  // 含 '/'、'\'、或 '..' 的名稱視為路徑穿越風險，整批拒絕
  for (const file of Array.from(files)) {
    if (
      file.name.includes("/") ||
      file.name.includes("\\") ||
      file.name.includes("..")
    ) {
      return { ok: false, toastKey: "errors.attachmentInvalidName" };
    }
  }

  return { ok: true };
}

interface UsePodFileDropOptions {
  /** getter，回傳 true 時所有事件 early return */
  disabled: () => boolean;
  /** 合法 drop 且所有檔案讀取成功後觸發 */
  onDrop: (attachments: PodChatAttachment[]) => void | Promise<void>;
}

interface UsePodFileDropReturn {
  /** 拖入目標範圍時為 true，用於模板綁定高亮 class */
  isDragOver: Ref<boolean>;
  handleDragEnter: (event: DragEvent) => void;
  handleDragOver: (event: DragEvent) => void;
  handleDragLeave: (event: DragEvent) => void;
  handleDrop: (event: DragEvent) => Promise<void>;
}

/**
 * 每批並行讀取的檔案數量上限。
 * 限制 Promise.all 平行度，避免大量大檔同時讀進記憶體造成瞬間峰值過高。
 */
const READ_FILES_CHUNK_SIZE = 5;

/**
 * 處理 Pod 聊天視窗的檔案拖曳上傳邏輯。
 * 不做檔案類型白名單，不需預覽 / 確認步驟，drop 即送。
 */
export function usePodFileDrop(
  options: UsePodFileDropOptions,
): UsePodFileDropReturn {
  const { disabled, onDrop } = options;
  const { toast } = useToast();

  const isDragOver = ref(false);

  const handleDragEnter = (event: DragEvent): void => {
    event.preventDefault();
    if (disabled()) return;
    isDragOver.value = true;
  };

  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    if (disabled()) return;
  };

  /**
   * 以 relatedTarget 是否仍在 currentTarget 內判斷是否真的離開，
   * 避免游標移到子元素時觸發假離開（dragenter/leave 抖動問題）。
   */
  const handleDragLeave = (event: DragEvent): void => {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;

    if (
      currentTarget &&
      relatedTarget &&
      currentTarget.contains(relatedTarget)
    ) {
      // 仍在容器內，忽略
      return;
    }

    isDragOver.value = false;
  };

  /**
   * 將 File 讀成純 base64 字串（剝離 dataURL 前綴）。
   * 讀取失敗時 reject。
   */
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event): void => {
        const result = event.target?.result;
        if (typeof result !== "string") {
          reject(new Error("讀取結果非字串"));
          return;
        }
        // dataURL 格式：data:<mime>;base64,<base64data>
        const base64Data = result.split(",")[1];
        if (!base64Data) {
          reject(new Error("無法剝離 base64 前綴"));
          return;
        }
        resolve(base64Data);
      };
      reader.onerror = (): void => {
        reject(new Error(`讀取檔案 "${file.name}" 失敗`));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    isDragOver.value = false;

    if (disabled()) return;

    const items = event.dataTransfer?.items;
    const files = event.dataTransfer?.files;

    // 驗證：資料夾、空檔、大小
    const validation = validateDropFiles(items, files);
    if (!validation.ok) {
      toast({ title: t(validation.toastKey), variant: "destructive" });
      return;
    }

    const fileArray = Array.from(files!);

    // 以 chunk 方式並行讀取檔案，避免大量大檔同時讀入記憶體造成瞬間峰值過高。
    // 每批最多 READ_FILES_CHUNK_SIZE 個並行，讀完再處理下一批。
    let attachments: PodChatAttachment[];
    try {
      const results: PodChatAttachment[] = [];
      for (let i = 0; i < fileArray.length; i += READ_FILES_CHUNK_SIZE) {
        const chunk = fileArray.slice(i, i + READ_FILES_CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map(async (file): Promise<PodChatAttachment> => {
            const contentBase64 = await readFileAsBase64(file);
            return {
              filename: file.name,
              contentBase64,
            };
          }),
        );
        results.push(...chunkResults);
      }
      attachments = results;
    } catch {
      toast({
        title: t("composable.chat.podDropReadFailed"),
        variant: "destructive",
      });
      return;
    }

    // 觸發 onDrop
    try {
      await onDrop(attachments);
    } catch {
      toast({
        title: t("composable.chat.podDropSendFailed"),
        variant: "destructive",
      });
    }
  };

  return {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
