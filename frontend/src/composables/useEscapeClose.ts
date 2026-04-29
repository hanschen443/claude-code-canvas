import { onMounted, onUnmounted } from "vue";
import type { Ref } from "vue";

/**
 * 掛載 ESC 鍵關閉的 document keydown listener。
 * 只處理 Escape 鍵，其他鍵一律忽略（不攔截、不阻擋）。
 *
 * @param onClose  按下 ESC 時呼叫的回呼
 * @param enabled  可選的響應式旗標，ref(false) 時停用；預設為啟用
 */
export function useEscapeClose(
  onClose: () => void,
  enabled?: Ref<boolean>,
): void {
  const handleKeydown = (event: KeyboardEvent): void => {
    // 只處理 Escape 鍵，其他鍵完全不介入
    if (event.key !== "Escape") return;
    // enabled 明確為 false 時跳過
    if (enabled !== undefined && !enabled.value) return;
    onClose();
  };

  onMounted(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
}
