import { isMacOS } from "@/utils/platform";
import {
  ZOOM_PINCH_FACTOR_MAC,
  ZOOM_PINCH_FACTOR_DEFAULT,
  WHEEL_DELTA_PIXEL_FACTOR,
  WHEEL_DELTA_LINE_FACTOR,
  WHEEL_DELTA_PAGE_FACTOR,
} from "@/lib/constants";
import { useCanvasContext } from "./useCanvasContext";

function wheelDelta(event: WheelEvent): number {
  const factor =
    event.ctrlKey && isMacOS
      ? ZOOM_PINCH_FACTOR_MAC
      : ZOOM_PINCH_FACTOR_DEFAULT;

  let deltaFactor: number;
  if (event.deltaMode === 1) {
    deltaFactor = WHEEL_DELTA_LINE_FACTOR;
  } else if (event.deltaMode === 2) {
    deltaFactor = WHEEL_DELTA_PAGE_FACTOR;
  } else {
    deltaFactor = WHEEL_DELTA_PIXEL_FACTOR;
  }

  const raw = -event.deltaY * deltaFactor * factor;
  // 限制單次 wheel 事件最大縮放量，避免大力滾動時爆衝（2^0.2 ≈ 1.15，最多 15%）
  return Math.max(-0.2, Math.min(0.2, raw));
}

export function useCanvasZoom(): {
  handleWheelZoom: (event: WheelEvent) => void;
} {
  const { viewportStore } = useCanvasContext();

  function handleWheelZoom(event: WheelEvent): void {
    event.preventDefault();

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const delta = wheelDelta(event);
    const newZoom = viewportStore.zoom * Math.pow(2, delta);

    viewportStore.zoomTo(newZoom, mouseX, mouseY);
  }

  return {
    handleWheelZoom,
  };
}
