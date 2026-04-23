import type { Pod, PodProvider, ProviderConfig } from "@/types";
import { validatePodName } from "@/lib/sanitize";
import {
  CLAUDE_DEFAULT_MODEL,
  CODEX_DEFAULT_MODEL,
} from "@/constants/providerDefaults";

function hasValidIdentity(pod: Pod): boolean {
  return validatePodName(pod.name) && pod.id.trim() !== "";
}

function hasValidPosition(pod: Pod): boolean {
  return isFinite(pod.x) && isFinite(pod.y) && isFinite(pod.rotation);
}

function hasValidOutput(pod: Pod): boolean {
  return (
    Array.isArray(pod.output) &&
    pod.output.every((item) => typeof item === "string")
  );
}

export function isValidPod(pod: Pod): boolean {
  return hasValidIdentity(pod) && hasValidPosition(pod) && hasValidOutput(pod);
}

function resolveOutputArray(
  existingOutput: string[] | undefined,
  podOutput: string[] | undefined,
): string[] {
  if (Array.isArray(existingOutput)) return existingOutput;
  if (Array.isArray(podOutput)) return podOutput;
  return [];
}

/**
 * 依據 provider 決定預設的 providerConfig
 */
function resolveProviderConfig(
  provider: PodProvider,
  existing: ProviderConfig | undefined,
): ProviderConfig {
  if (existing) return existing;
  if (provider === "codex") {
    return { provider: "codex", model: CODEX_DEFAULT_MODEL };
  }
  return { provider: "claude", model: CLAUDE_DEFAULT_MODEL };
}

/**
 * 補全 Pod 缺少的欄位
 * @param pod Pod 物件
 * @param existingOutput 現有的 output（用於保留）
 * @returns 補全後的 Pod
 */
export function enrichPod(pod: Pod, existingOutput?: string[]): Pod {
  // 缺 provider 時視為舊有的 Claude Pod
  const provider: PodProvider = pod.provider ?? "claude";

  return {
    ...pod,
    x: pod.x ?? 100,
    y: pod.y ?? 150,
    rotation: pod.rotation ?? Math.random() * 2 - 1,
    output: resolveOutputArray(existingOutput, pod.output),
    outputStyleId: pod.outputStyleId ?? null,
    // model 欄位向後相容保留，不新增 default（後端 migration 完成後移除）
    model: pod.model,
    multiInstance: pod.multiInstance ?? false,
    commandId: pod.commandId ?? null,
    schedule: pod.schedule ?? null,
    pluginIds: pod.pluginIds ?? [],
    provider,
    providerConfig: resolveProviderConfig(provider, pod.providerConfig),
  };
}
