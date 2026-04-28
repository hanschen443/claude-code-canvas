import { ref, type Ref } from "vue";
import { useToast } from "@/composables/useToast";
import { t } from "@/i18n";
import { MAX_POD_DROP_FILE_BYTES } from "@/lib/constants";
import type { PodChatAttachment } from "@/types/websocket/requests";

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

    // 1. 檢查是否含有資料夾（透過 DataTransferItemList.webkitGetAsEntry）
    const items = event.dataTransfer?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i]?.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          toast({ title: t("errors.attachmentEmpty"), variant: "destructive" });
          return;
        }
      }
    }

    // 2. 確認有檔案
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      toast({ title: t("errors.attachmentEmpty"), variant: "destructive" });
      return;
    }

    const fileArray = Array.from(files);

    // 3. 逐檔比對大小，任一檔超過上限即整批拒絕
    for (const file of fileArray) {
      if (file.size > MAX_POD_DROP_FILE_BYTES) {
        toast({
          title: t("errors.attachmentTooLarge"),
          variant: "destructive",
        });
        return;
      }
    }

    // 讀取所有檔案（平行處理）
    let attachments: PodChatAttachment[];
    try {
      attachments = await Promise.all(
        fileArray.map(async (file): Promise<PodChatAttachment> => {
          const contentBase64 = await readFileAsBase64(file);
          return {
            filename: file.name,
            contentBase64,
          };
        }),
      );
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
