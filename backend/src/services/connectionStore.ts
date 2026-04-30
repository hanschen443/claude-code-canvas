import { v4 as uuidv4 } from "uuid";
import type {
  Connection,
  AnchorPosition,
  TriggerMode,
  DecideStatus,
  ConnectionStatus,
  AiDecideModelType,
} from "../types";
import { DEFAULT_AI_DECIDE_MODEL } from "../types/connection.js";
import { getDb } from "../database/index.js";
import { getStatements } from "../database/statements.js";
import { getProvider, resolveModelWithFallback } from "./provider/index.js";
import { podStore } from "./podStore.js";
import { logger } from "../utils/logger.js";

interface CreateConnectionData {
  sourcePodId: string;
  sourceAnchor: AnchorPosition;
  targetPodId: string;
  targetAnchor: AnchorPosition;
  triggerMode?: TriggerMode;
  /** summaryModel 接受任意非空模型名稱 */
  summaryModel?: string;
  aiDecideModel?: AiDecideModelType;
}

function shouldResetDecideState(oldMode: string, newMode: string): boolean {
  return (
    oldMode === "ai-decide" && (newMode === "auto" || newMode === "direct")
  );
}

interface ConnectionRow {
  id: string;
  canvas_id: string;
  source_pod_id: string;
  source_anchor: string;
  target_pod_id: string;
  target_anchor: string;
  trigger_mode: string;
  decide_status: string;
  decide_reason: string | null;
  connection_status: string;
  summary_model: string;
  ai_decide_model: string;
}

function rowToConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    sourcePodId: row.source_pod_id,
    sourceAnchor: row.source_anchor as AnchorPosition,
    targetPodId: row.target_pod_id,
    targetAnchor: row.target_anchor as AnchorPosition,
    triggerMode: row.trigger_mode as TriggerMode,
    decideStatus: row.decide_status as DecideStatus,
    decideReason: row.decide_reason,
    connectionStatus: row.connection_status as ConnectionStatus,
    summaryModel: row.summary_model,
    aiDecideModel: row.ai_decide_model as AiDecideModelType,
  };
}

class ConnectionStore {
  private get stmts(): ReturnType<typeof getStatements>["connection"] {
    return getStatements(getDb()).connection;
  }

  create(canvasId: string, data: CreateConnectionData): Connection {
    const id = uuidv4();

    // 從上游 Pod 取得 provider，用以決定 summaryModel 預設值與驗證合法性
    const sourcePod = podStore.getById(canvasId, data.sourcePodId);
    const provider = sourcePod?.provider ?? "claude";
    const providerMeta = getProvider(provider).metadata;
    const defaultModel =
      (providerMeta.defaultOptions as { model?: string }).model ?? "sonnet";

    let resolvedSummaryModel: string;
    if (!data.summaryModel) {
      // 客戶端未帶 summaryModel：使用上游 provider 的預設模型
      resolvedSummaryModel = defaultModel;
    } else {
      const { resolved, didFallback } = resolveModelWithFallback(
        provider,
        data.summaryModel,
      );
      if (didFallback) {
        logger.warn(
          "Connection",
          "Warn",
          `[ConnectionStore] summaryModel "${data.summaryModel}" 不在 ${provider} 合法清單內，fallback 到預設模型 "${resolved}"`,
        );
      }
      resolvedSummaryModel = resolved;
    }

    this.stmts.insert.run({
      $id: id,
      $canvasId: canvasId,
      $sourcePodId: data.sourcePodId,
      $sourceAnchor: data.sourceAnchor,
      $targetPodId: data.targetPodId,
      $targetAnchor: data.targetAnchor,
      $triggerMode: data.triggerMode ?? "auto",
      $decideStatus: "none",
      $decideReason: null,
      $connectionStatus: "idle",
      $summaryModel: resolvedSummaryModel,
      $aiDecideModel: data.aiDecideModel ?? DEFAULT_AI_DECIDE_MODEL,
    });

    return this.getById(canvasId, id) as Connection;
  }

  getById(canvasId: string, id: string): Connection | undefined {
    const row = this.stmts.selectById.get(canvasId, id) as
      | ConnectionRow
      | undefined;
    if (!row) return undefined;
    return rowToConnection(row);
  }

  list(canvasId: string): Connection[] {
    const rows = this.stmts.selectByCanvasId.all(canvasId) as ConnectionRow[];
    return rows.map(rowToConnection);
  }

  delete(canvasId: string, id: string): boolean {
    const result = this.stmts.deleteById.run(canvasId, id);
    return result.changes > 0;
  }

  findByPodId(canvasId: string, podId: string): Connection[] {
    const rows = this.stmts.selectByPodId.all({
      $canvasId: canvasId,
      $podId: podId,
    }) as ConnectionRow[];
    return rows.map(rowToConnection);
  }

  findBySourcePodId(canvasId: string, sourcePodId: string): Connection[] {
    const rows = this.stmts.selectBySourcePodId.all({
      $canvasId: canvasId,
      $sourcePodId: sourcePodId,
    }) as ConnectionRow[];
    return rows.map(rowToConnection);
  }

  findByTargetPodId(canvasId: string, targetPodId: string): Connection[] {
    const rows = this.stmts.selectByTargetPodId.all({
      $canvasId: canvasId,
      $targetPodId: targetPodId,
    }) as ConnectionRow[];
    return rows.map(rowToConnection);
  }

  update(
    canvasId: string,
    id: string,
    updates: Partial<{
      triggerMode: TriggerMode;
      decideStatus: DecideStatus;
      decideReason: string | null;
      /** summaryModel 接受任意非空模型名稱 */
      summaryModel: string;
      aiDecideModel: AiDecideModelType;
    }>,
  ): Connection | undefined {
    const existing = this.getById(canvasId, id);
    if (!existing) return undefined;

    let newTriggerMode = existing.triggerMode;
    let newDecideStatus = existing.decideStatus;
    let newDecideReason = existing.decideReason;
    let newConnectionStatus = existing.connectionStatus;
    let newSummaryModel = existing.summaryModel;
    let newAiDecideModel = existing.aiDecideModel;

    if (updates.triggerMode !== undefined) {
      if (shouldResetDecideState(existing.triggerMode, updates.triggerMode)) {
        newDecideStatus = "none";
        newDecideReason = null;
        newConnectionStatus = "idle";
      }
      newTriggerMode = updates.triggerMode;
    }

    if (updates.decideStatus !== undefined) {
      newDecideStatus = updates.decideStatus;
    }

    if (updates.decideReason !== undefined) {
      newDecideReason = updates.decideReason;
    }

    if (updates.summaryModel !== undefined) {
      // 與 create 路徑一致：驗證 summaryModel 合法性，不合法則 fallback 到 provider 預設模型
      const sourcePod = podStore.getById(canvasId, existing.sourcePodId);
      const provider = sourcePod?.provider ?? "claude";
      const providerMeta = getProvider(provider).metadata;
      const defaultModel =
        (providerMeta.defaultOptions as { model?: string }).model ?? "sonnet";

      const isValidModel = providerMeta.availableModelValues.has(
        updates.summaryModel,
      );
      if (isValidModel) {
        newSummaryModel = updates.summaryModel;
      } else {
        const { resolved } = resolveModelWithFallback(
          provider,
          updates.summaryModel,
        );
        logger.warn(
          "Connection",
          "Warn",
          `[ConnectionStore] update summaryModel "${updates.summaryModel}" 不在 ${provider} 合法清單內，fallback 到預設模型 "${defaultModel}"`,
        );
        newSummaryModel = resolved;
      }
    }

    if (updates.aiDecideModel !== undefined) {
      newAiDecideModel = updates.aiDecideModel;
    }

    const updatedRow = this.stmts.updateReturning.get({
      $canvasId: canvasId,
      $id: id,
      $sourcePodId: existing.sourcePodId,
      $sourceAnchor: existing.sourceAnchor,
      $targetPodId: existing.targetPodId,
      $targetAnchor: existing.targetAnchor,
      $triggerMode: newTriggerMode,
      $decideStatus: newDecideStatus,
      $decideReason: newDecideReason,
      $connectionStatus: newConnectionStatus,
      $summaryModel: newSummaryModel,
      $aiDecideModel: newAiDecideModel,
    }) as ConnectionRow | undefined;

    if (!updatedRow) return undefined;
    return rowToConnection(updatedRow);
  }

  updateConnectionStatus(
    canvasId: string,
    connectionId: string,
    status: ConnectionStatus,
  ): Connection | undefined {
    const updatedRow = this.stmts.updateConnectionStatusReturning.get({
      $canvasId: canvasId,
      $id: connectionId,
      $connectionStatus: status,
    }) as ConnectionRow | undefined;

    if (!updatedRow) return undefined;
    return rowToConnection(updatedRow);
  }

  updateDecideStatus(
    canvasId: string,
    connectionId: string,
    status: DecideStatus,
    reason: string | null,
  ): Connection | undefined {
    return this.update(canvasId, connectionId, {
      decideStatus: status,
      decideReason: reason,
    });
  }

  deleteByPodId(canvasId: string, podId: string): number {
    const result = this.stmts.deleteByPodId.run({
      $canvasId: canvasId,
      $podId: podId,
    });
    return result.changes;
  }

  clearDecideStatusByPodId(canvasId: string, podId: string): void {
    this.stmts.clearDecideStatusByPodId.run({
      $canvasId: canvasId,
      $podId: podId,
    });
  }

  findByTriggerMode(
    canvasId: string,
    sourcePodId: string,
    triggerMode: TriggerMode,
  ): Connection[] {
    const rows = this.stmts.selectByTriggerMode.all({
      $canvasId: canvasId,
      $sourcePodId: sourcePodId,
      $triggerMode: triggerMode,
    }) as ConnectionRow[];
    return rows.map(rowToConnection);
  }
}

export const connectionStore = new ConnectionStore();
