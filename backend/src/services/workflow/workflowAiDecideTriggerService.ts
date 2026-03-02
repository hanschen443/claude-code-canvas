import type { Connection } from '../../types/index.js';
import type {
  TriggerStrategy,
  TriggerDecideContext,
  TriggerDecideResult,
  PipelineContext,
  TriggerLifecycleContext,
  CompletionContext,
  QueuedContext,
  QueueProcessedContext,
} from './types.js';
import { aiDecideService } from './aiDecideService.js';
import { workflowEventEmitter } from './workflowEventEmitter.js';
import { connectionStore } from '../connectionStore.js';
import { podStore } from '../podStore.js';
import { workflowStateService } from './workflowStateService.js';
import { pendingTargetStore } from '../pendingTargetStore.js';
import { workflowPipeline } from './workflowPipeline.js';
import { workflowMultiInputService } from './workflowMultiInputService.js';
import { forEachMultiInputGroupConnection } from './workflowHelpers.js';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/errorHelpers.js';
import { LazyInitializable } from './lazyInitializable.js';
import { autoClearService } from '../autoClear/autoClearService.js';

type AiDecideService = typeof aiDecideService;
type WorkflowEventEmitter = typeof workflowEventEmitter;
type ConnectionStore = typeof connectionStore;
type PodStore = typeof podStore;
type WorkflowStateService = typeof workflowStateService;
type PendingTargetStore = typeof pendingTargetStore;
type WorkflowPipeline = typeof workflowPipeline;
type WorkflowMultiInputService = typeof workflowMultiInputService;
type AutoClearService = typeof autoClearService;

interface AiDecideTriggerDependencies {
  aiDecideService: AiDecideService;
  eventEmitter: WorkflowEventEmitter;
  connectionStore: ConnectionStore;
  podStore: PodStore;
  stateService: WorkflowStateService;
  pendingTargetStore: PendingTargetStore;
  pipeline: WorkflowPipeline;
  multiInputService: WorkflowMultiInputService;
  autoClearService: AutoClearService;
}

class WorkflowAiDecideTriggerService extends LazyInitializable<AiDecideTriggerDependencies> implements TriggerStrategy {
  readonly mode = 'ai-decide' as const;

  onTrigger(context: TriggerLifecycleContext): void {
    this.ensureInitialized();
    this.deps.eventEmitter.emitWorkflowAiDecideTriggered(
      context.canvasId,
      context.connectionId,
      context.sourcePodId,
      context.targetPodId
    );
  }

  onComplete(context: CompletionContext, success: boolean, error?: string): void {
    this.ensureInitialized();
    forEachMultiInputGroupConnection(context.canvasId, context.targetPodId, (conn) => {
      this.deps.eventEmitter.emitWorkflowComplete(
        context.canvasId, conn.id, conn.sourcePodId,
        context.targetPodId, success, error, context.triggerMode
      );
      this.deps.connectionStore.updateConnectionStatus(context.canvasId, conn.id, 'idle');
    });
  }

  onError(context: CompletionContext, errorMessage: string): void {
    this.ensureInitialized();
    forEachMultiInputGroupConnection(context.canvasId, context.targetPodId, (conn) => {
      this.deps.eventEmitter.emitWorkflowComplete(
        context.canvasId, conn.id, conn.sourcePodId,
        context.targetPodId, false, errorMessage, context.triggerMode
      );
      this.deps.connectionStore.updateConnectionStatus(context.canvasId, conn.id, 'idle');
    });
  }

  onQueued(context: QueuedContext): void {
    this.ensureInitialized();
    forEachMultiInputGroupConnection(context.canvasId, context.targetPodId, (conn) => {
      this.deps.connectionStore.updateConnectionStatus(context.canvasId, conn.id, 'queued');
    });
    this.deps.eventEmitter.emitWorkflowQueued(context.canvasId, {
      canvasId: context.canvasId,
      targetPodId: context.targetPodId,
      connectionId: context.connectionId,
      sourcePodId: context.sourcePodId,
      position: context.position,
      queueSize: context.queueSize,
      triggerMode: context.triggerMode,
    });
  }

  onQueueProcessed(context: QueueProcessedContext): void {
    this.ensureInitialized();
    this.deps.eventEmitter.emitWorkflowQueueProcessed(context.canvasId, {
      canvasId: context.canvasId,
      targetPodId: context.targetPodId,
      connectionId: context.connectionId,
      sourcePodId: context.sourcePodId,
      remainingQueueSize: context.remainingQueueSize,
      triggerMode: context.triggerMode,
    });
  }

  async decide(context: TriggerDecideContext): Promise<TriggerDecideResult[]> {
    this.ensureInitialized();

    const { canvasId, sourcePodId, connections } = context;

    try {
      const batchResult = await this.deps.aiDecideService.decideConnections(
        canvasId,
        sourcePodId,
        connections
      );

      const results: TriggerDecideResult[] = [];

      for (const result of batchResult.results) {
        results.push({
          connectionId: result.connectionId,
          approved: result.shouldTrigger,
          reason: result.reason,
          isError: false,
        });
      }

      for (const errorResult of batchResult.errors) {
        logger.error('Workflow', 'Error', `[AI-Decide] Connection ${errorResult.connectionId} 錯誤：${errorResult.error}`);
        results.push({
          connectionId: errorResult.connectionId,
          approved: false,
          reason: 'AI 判斷服務發生錯誤',
          isError: true,
        });
      }

      return results;
    } catch (error) {
      logger.error('Workflow', 'Error', '[AI-Decide] aiDecideService.decideConnections 失敗', error);

      return connections.map(conn => ({
        connectionId: conn.id,
        approved: false,
        reason: `錯誤：${getErrorMessage(error)}`,
        isError: true,
      }));
    }
  }

  async processAiDecideConnections(
    canvasId: string,
    sourcePodId: string,
    connections: Connection[]
  ): Promise<void> {
    this.ensureInitialized();

    const connectionIds = connections.map(conn => conn.id);
    this.deps.eventEmitter.emitAiDecidePending(canvasId, connectionIds, sourcePodId);

    for (const conn of connections) {
      this.deps.connectionStore.updateDecideStatus(canvasId, conn.id, 'pending', null);
      this.deps.connectionStore.updateConnectionStatus(canvasId, conn.id, 'ai-deciding');
    }

    const decideResults = await this.decide({ canvasId, sourcePodId, connections });

    for (const decideResult of decideResults) {
      const conn = connections.find(c => c.id === decideResult.connectionId);
      if (!conn) continue;

      if (decideResult.isError) {
        this.handleErrorConnection(canvasId, sourcePodId, conn, decideResult);
      } else if (decideResult.approved) {
        this.handleApprovedConnection(canvasId, sourcePodId, conn, decideResult);
      } else {
        await this.handleRejectedConnection(canvasId, sourcePodId, conn, decideResult);
      }
    }
  }

  private handleErrorConnection(
    canvasId: string,
    sourcePodId: string,
    conn: Connection,
    decideResult: TriggerDecideResult
  ): void {
    this.ensureInitialized();
    const errorMessage = decideResult.reason ?? '未知錯誤';
    this.deps.connectionStore.updateDecideStatus(canvasId, conn.id, 'error', errorMessage);
    this.deps.connectionStore.updateConnectionStatus(canvasId, conn.id, 'ai-error');
    this.deps.eventEmitter.emitAiDecideError(
      canvasId,
      conn.id,
      sourcePodId,
      conn.targetPodId,
      errorMessage
    );
    const sourcePod = this.deps.podStore.getById(canvasId, sourcePodId);
    const targetPod = this.deps.podStore.getById(canvasId, conn.targetPodId);
    logger.error('Workflow', 'Error', `AI Decide 發生錯誤，連線 ${conn.id}（「${sourcePod?.name ?? sourcePodId}」→「${targetPod?.name ?? conn.targetPodId}」）：${errorMessage}`);
  }

  private handleApprovedConnection(
    canvasId: string,
    sourcePodId: string,
    conn: Connection,
    decideResult: TriggerDecideResult
  ): void {
    this.ensureInitialized();
    this.deps.connectionStore.updateDecideStatus(canvasId, conn.id, 'approved', decideResult.reason);
    this.deps.connectionStore.updateConnectionStatus(canvasId, conn.id, 'ai-approved');
    this.deps.eventEmitter.emitAiDecideResult(
      canvasId,
      conn.id,
      sourcePodId,
      conn.targetPodId,
      true,
      decideResult.reason ?? ''
    );
    const sourcePod = this.deps.podStore.getById(canvasId, sourcePodId);
    const targetPod = this.deps.podStore.getById(canvasId, conn.targetPodId);
    logger.log('Workflow', 'Create', `AI Decide 核准連線 ${conn.id}（「${sourcePod?.name ?? sourcePodId}」→「${targetPod?.name ?? conn.targetPodId}」）：${decideResult.reason}`);

    const pipelineContext: PipelineContext = {
      canvasId,
      sourcePodId,
      connection: conn,
      triggerMode: 'ai-decide',
      decideResult,
    };

    this.deps.pipeline.execute(pipelineContext, this).catch((error: unknown) => {
      logger.error('Workflow', 'Error', `AI Decide Workflow 執行失敗，連線 ${conn.id}`, error);
      this.deps.eventEmitter.emitWorkflowComplete(
        canvasId,
        conn.id,
        sourcePodId,
        conn.targetPodId,
        false,
        getErrorMessage(error),
        'ai-decide'
      );
    });
  }

  private async handleRejectedConnection(
    canvasId: string,
    sourcePodId: string,
    conn: Connection,
    decideResult: TriggerDecideResult
  ): Promise<void> {
    this.ensureInitialized();
    this.deps.connectionStore.updateDecideStatus(canvasId, conn.id, 'rejected', decideResult.reason);
    this.deps.connectionStore.updateConnectionStatus(canvasId, conn.id, 'ai-rejected');
    this.deps.eventEmitter.emitAiDecideResult(
      canvasId,
      conn.id,
      sourcePodId,
      conn.targetPodId,
      false,
      decideResult.reason ?? ''
    );
    const sourcePod = this.deps.podStore.getById(canvasId, sourcePodId);
    const targetPod = this.deps.podStore.getById(canvasId, conn.targetPodId);
    logger.log('Workflow', 'Update', `AI Decide 拒絕連線 ${conn.id}（「${sourcePod?.name ?? sourcePodId}」→「${targetPod?.name ?? conn.targetPodId}」）：${decideResult.reason}`);

    const { isMultiInput } = this.deps.stateService.checkMultiInputScenario(canvasId, conn.targetPodId);
    if (isMultiInput && this.deps.pendingTargetStore.hasPendingTarget(conn.targetPodId)) {
      await this.handleRejectedMultiInput(canvasId, sourcePodId, conn, decideResult.reason ?? '');
      return;
    }

    if (this.isLastRejectionTriggersGroupCancel(canvasId, conn.targetPodId)) {
      await this.deps.autoClearService.onGroupNotTriggered(canvasId, conn.targetPodId);
    }
  }

  private isLastRejectionTriggersGroupCancel(canvasId: string, targetPodId: string): boolean {
    this.ensureInitialized();
    const incomingConnections = this.deps.connectionStore.findByTargetPodId(canvasId, targetPodId);
    const autoAiIncoming = incomingConnections.filter(
      (c) => c.triggerMode === 'auto' || c.triggerMode === 'ai-decide'
    );
    return autoAiIncoming.length === 1;
  }

  private async handleRejectedMultiInput(
    canvasId: string,
    sourcePodId: string,
    conn: Connection,
    reason: string
  ): Promise<void> {
    this.ensureInitialized();
    this.deps.pendingTargetStore.recordSourceRejection(conn.targetPodId, sourcePodId, reason);
    this.deps.stateService.emitPendingStatus(canvasId, conn.targetPodId);

    const pending = this.deps.pendingTargetStore.getPendingTarget(conn.targetPodId);
    if (!pending) {
      return;
    }

    const allSourcesResponded = pending.completedSources.size + pending.rejectedSources.size >= pending.requiredSourcePodIds.length;
    if (allSourcesResponded && pending.rejectedSources.size > 0) {
      await this.deps.autoClearService.onGroupNotTriggered(canvasId, conn.targetPodId);
    }
  }
}

export const workflowAiDecideTriggerService = new WorkflowAiDecideTriggerService();
