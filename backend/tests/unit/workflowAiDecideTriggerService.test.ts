import {
  createWorkflowPipelineMock,
  createErrorHelpersMock,
  createAiDecideServiceMock,
  createWorkflowEventEmitterMock,
  createConnectionStoreMock,
  createWorkflowStateServiceMock,
  createPendingTargetStoreMock,
  createWorkflowMultiInputServiceMock,
  createLoggerMock,
  createPodStoreMock,
  createRunExecutionServiceMock,
  createRunStoreMock,
} from '../mocks/workflowModuleMocks.js';

vi.mock('../../src/services/podStore.js', () => createPodStoreMock());

vi.mock('../../src/services/workflow/aiDecideService.js', () => createAiDecideServiceMock());

vi.mock('../../src/services/workflow/workflowEventEmitter.js', () => createWorkflowEventEmitterMock());

vi.mock('../../src/services/connectionStore.js', () => createConnectionStoreMock());

vi.mock('../../src/services/workflow/workflowStateService.js', () => createWorkflowStateServiceMock());

vi.mock('../../src/services/pendingTargetStore.js', () => createPendingTargetStoreMock());

vi.mock('../../src/services/workflow/workflowPipeline.js', () => createWorkflowPipelineMock());

vi.mock('../../src/services/workflow/workflowMultiInputService.js', () => createWorkflowMultiInputServiceMock());

vi.mock('../../src/utils/logger.js', () => createLoggerMock());

vi.mock('../../src/utils/errorHelpers.js', () => createErrorHelpersMock());

vi.mock('../../src/services/workflow/runExecutionService.js', () => createRunExecutionServiceMock());

vi.mock('../../src/services/runStore.js', () => createRunStoreMock());

import { workflowAiDecideTriggerService } from '../../src/services/workflow/workflowAiDecideTriggerService.js';
import { aiDecideService } from '../../src/services/workflow/aiDecideService.js';
import { workflowEventEmitter } from '../../src/services/workflow/workflowEventEmitter.js';
import { connectionStore } from '../../src/services/connectionStore.js';
import { workflowStateService } from '../../src/services/workflow/workflowStateService.js';
import { pendingTargetStore } from '../../src/services/pendingTargetStore.js';
import { workflowPipeline } from '../../src/services/workflow/workflowPipeline.js';
import { workflowMultiInputService } from '../../src/services/workflow/workflowMultiInputService.js';
import { podStore } from '../../src/services/podStore.js';
import { logger } from '../../src/utils/logger.js';
import { runExecutionService } from '../../src/services/workflow/runExecutionService.js';
import { runStore } from '../../src/services/runStore.js';
import type { Connection } from '../../src/types';
import type { RunContext } from '../../src/types/run.js';
import { createMockConnection, createMockPod, createMockRunPodInstance, TEST_IDS } from '../mocks/workflowTestFactories.js';

describe('WorkflowAiDecideTriggerService', () => {
  const { canvasId, sourcePodId, targetPodId } = TEST_IDS;

  const mockConnection: Connection = createMockConnection({
    id: 'conn-ai-1',
    sourcePodId,
    targetPodId,
    triggerMode: 'ai-decide',
  });

  const mockRunContext: RunContext = {
    runId: 'run-1',
    canvasId,
    sourcePodId,
  };

  const createUninitializedService = () =>
    Object.create(Object.getPrototypeOf(workflowAiDecideTriggerService));

  beforeEach(() => {
    vi.clearAllMocks();

    workflowAiDecideTriggerService.init({
      aiDecideService,
      eventEmitter: workflowEventEmitter,
      connectionStore,
      podStore,
      stateService: workflowStateService,
      pendingTargetStore,
      pipeline: workflowPipeline,
      multiInputService: workflowMultiInputService,
    });

    (podStore.getById as any).mockImplementation((_canvasId: string, podId: string) =>
      createMockPod({ id: podId, name: `Pod ${podId}` })
    );

    (connectionStore.findByTargetPodId as any).mockReturnValue([]);

    (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
      isMultiInput: false,
      requiredSourcePodIds: [],
    });
    (pendingTargetStore.hasPendingTarget as any).mockReturnValue(false);
    (workflowPipeline.execute as any).mockResolvedValue(undefined);
  });

  describe('decide() - 批次決策格式轉換', () => {
    it('正確轉換 aiDecideService 的成功結果為 TriggerDecideResult 格式', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務' },
        ],
        errors: [],
      });

      const results = await workflowAiDecideTriggerService.decide({
        canvasId,
        sourcePodId,
        connections: [mockConnection],
      });

      expect(results).toEqual([
        {
          connectionId: 'conn-ai-1',
          approved: true,
          reason: '相關任務',
          isError: false,
        },
      ]);
    });

    it('正確轉換 aiDecideService 的錯誤結果為 approved=false 格式', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [],
        errors: [
          { connectionId: 'conn-ai-1', error: 'AI 決策失敗' },
        ],
      });

      const results = await workflowAiDecideTriggerService.decide({
        canvasId,
        sourcePodId,
        connections: [mockConnection],
      });

      expect(results).toEqual([
        {
          connectionId: 'conn-ai-1',
          approved: false,
          reason: 'AI 判斷服務發生錯誤',
          isError: true,
        },
      ]);
    });

    it('當 aiDecideService 拋出錯誤時，所有 connection 標記為錯誤', async () => {
      (aiDecideService.decideConnections as any).mockRejectedValue(new Error('網路錯誤'));

      const results = await workflowAiDecideTriggerService.decide({
        canvasId,
        sourcePodId,
        connections: [mockConnection],
      });

      expect(results).toEqual([
        {
          connectionId: 'conn-ai-1',
          approved: false,
          reason: '錯誤：網路錯誤',
          isError: true,
        },
      ]);
      expect(logger.error).toHaveBeenCalledWith(
        'Workflow',
        'Error',
        '[AI-Decide] aiDecideService.decideConnections 失敗',
        expect.any(Error)
      );
    });
  });

  describe('processAiDecideConnections() - 完整批次判斷流程', () => {
    it('批次決策 approved 的 connection 進入 Pipeline', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(workflowEventEmitter.emitAiDecidePending).toHaveBeenCalledWith(
        canvasId,
        ['conn-ai-1'],
        sourcePodId
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledTimes(2);
      expect(connectionStore.updateDecideStatus).toHaveBeenNthCalledWith(
        1,
        canvasId,
        'conn-ai-1',
        'pending',
        null
      );
      expect(connectionStore.updateDecideStatus).toHaveBeenNthCalledWith(
        2,
        canvasId,
        'conn-ai-1',
        'approved',
        '相關任務'
      );

      expect(connectionStore.updateConnectionStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'ai-approved');

      expect(workflowEventEmitter.emitAiDecideResult).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        shouldTrigger: true,
        reason: '相關任務',
      });

      expect(workflowPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasId,
          sourcePodId,
          connection: mockConnection,
          triggerMode: 'ai-decide',
          decideResult: {
            connectionId: 'conn-ai-1',
            approved: true,
            reason: '相關任務',
            isError: false,
          },
        }),
        workflowAiDecideTriggerService
      );

      expect(logger.log).toHaveBeenCalledWith(
        'Workflow',
        'Create',
        expect.stringContaining('AI Decide 核准連線 conn-ai-1')
      );
    });

    it('批次決策 rejected 的 connection 更新狀態並發送事件', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        'rejected',
        '不相關'
      );

      expect(workflowEventEmitter.emitAiDecideResult).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        shouldTrigger: false,
        reason: '不相關',
      });

      expect(workflowPipeline.execute).not.toHaveBeenCalled();

      expect(logger.log).toHaveBeenCalledWith(
        'Workflow',
        'Update',
        expect.stringContaining('AI Decide 拒絕連線 conn-ai-1')
      );
    });

    it('批次決策 error 時所有 connection 標記為 error', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [],
        errors: [
          { connectionId: 'conn-ai-1', error: 'AI 決策失敗' },
        ],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        'error',
        'AI 判斷服務發生錯誤'
      );

      expect(connectionStore.updateConnectionStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'ai-error');

      expect(workflowEventEmitter.emitAiDecideError).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        error: 'AI 判斷服務發生錯誤',
      });

      expect(workflowPipeline.execute).not.toHaveBeenCalled();

      expect(logger.error).toHaveBeenCalledWith(
        'Workflow',
        'Error',
        expect.stringContaining('AI Decide 發生錯誤，連線 conn-ai-1')
      );
    });

    it('aiDecideService.decideConnections 拋出錯誤時所有 connection 標記為 error', async () => {
      (aiDecideService.decideConnections as any).mockRejectedValue(new Error('網路錯誤'));

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        'error',
        '錯誤：網路錯誤'
      );

      expect(workflowEventEmitter.emitAiDecideError).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        error: '錯誤：網路錯誤',
      });

      expect(workflowPipeline.execute).not.toHaveBeenCalled();
    });

    it('PENDING 事件在決策前正確發送', async () => {
      const callOrder: string[] = [];

      (workflowEventEmitter.emitAiDecidePending as any).mockImplementation(() => {
        callOrder.push('emitAiDecidePending');
      });

      (connectionStore.updateDecideStatus as any).mockImplementation(
        (cId: string, connId: string, status: string) => {
          if (status === 'pending') {
            callOrder.push('updateDecideStatus-pending');
          } else if (status === 'approved') {
            callOrder.push('updateDecideStatus-approved');
          }
        }
      );

      (connectionStore.updateConnectionStatus as any).mockImplementation(
        (cId: string, connId: string, status: string) => {
          if (status === 'ai-deciding') {
            callOrder.push('updateConnectionStatus-ai-deciding');
          }
        }
      );

      (aiDecideService.decideConnections as any).mockImplementation(async () => {
        callOrder.push('decide');
        return {
          results: [
            { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務' },
          ],
          errors: [],
        };
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(callOrder).toEqual([
        'emitAiDecidePending',
        'updateDecideStatus-pending',
        'updateConnectionStatus-ai-deciding',
        'decide',
        'updateDecideStatus-approved',
      ]);
    });

    it('rejected 時多輸入場景下記錄 rejection', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: true,
        requiredSourcePodIds: [sourcePodId, 'other-source'],
      });

      (pendingTargetStore.hasPendingTarget as any).mockReturnValue(true);

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(pendingTargetStore.recordSourceRejection).toHaveBeenCalledWith(
        targetPodId,
        sourcePodId,
        '不相關'
      );

      expect(workflowStateService.emitPendingStatus).toHaveBeenCalledWith(
        canvasId,
        targetPodId
      );
    });

    it('rejected 時非多輸入場景不記錄 rejection', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: false,
        requiredSourcePodIds: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(pendingTargetStore.recordSourceRejection).not.toHaveBeenCalled();
      expect(workflowStateService.emitPendingStatus).not.toHaveBeenCalled();
    });

    it('多個 connections 批次處理', async () => {
      const conn2 = createMockConnection({
        id: 'conn-ai-2',
        sourcePodId,
        targetPodId: 'target-pod-2',
        triggerMode: 'ai-decide',
      });

      const conn3 = createMockConnection({
        id: 'conn-ai-3',
        sourcePodId,
        targetPodId: 'target-pod-3',
        triggerMode: 'ai-decide',
      });

      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務 1' },
          { connectionId: 'conn-ai-2', shouldTrigger: false, reason: '不相關任務 2' },
        ],
        errors: [
          { connectionId: 'conn-ai-3', error: 'AI 決策失敗' },
        ],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection, conn2, conn3]
      );

      expect(workflowEventEmitter.emitAiDecidePending).toHaveBeenCalledWith(
        canvasId,
        ['conn-ai-1', 'conn-ai-2', 'conn-ai-3'],
        sourcePodId
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        'approved',
        '相關任務 1'
      );
      expect(workflowPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: mockConnection,
          triggerMode: 'ai-decide',
        }),
        workflowAiDecideTriggerService
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-2',
        'rejected',
        '不相關任務 2'
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-3',
        'error',
        'AI 判斷服務發生錯誤'
      );
      expect(workflowEventEmitter.emitAiDecideError).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-3',
        sourcePodId,
        targetPodId: 'target-pod-3',
        error: 'AI 判斷服務發生錯誤',
      });
    });
  });

  describe('錯誤處理', () => {
    it('未初始化時呼叫 decide() 拋出錯誤', async () => {
      const uninitializedService = createUninitializedService();

      await expect(
        uninitializedService.decide({
          canvasId,
          sourcePodId,
          connections: [mockConnection],
        })
      ).rejects.toThrow('WorkflowAiDecideTriggerService 尚未初始化，請先呼叫 init()');
    });

    it('未初始化時呼叫 processAiDecideConnections() 拋出錯誤', async () => {
      const uninitializedService = createUninitializedService();

      await expect(
        uninitializedService.processAiDecideConnections(canvasId, sourcePodId, [mockConnection])
      ).rejects.toThrow('WorkflowAiDecideTriggerService 尚未初始化，請先呼叫 init()');
    });

    it('pipeline.execute 拋出錯誤時記錄但不影響流程', async () => {
      const pipelineError = new Error('Pipeline 執行失敗');
      (workflowPipeline.execute as any).mockRejectedValue(pipelineError);

      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      await vi.waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          'Workflow',
          'Error',
          expect.stringContaining('AI Decide Workflow 執行失敗，連線'),
          pipelineError
        );
      });

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        'approved',
        '相關任務'
      );

      expect(workflowEventEmitter.emitWorkflowComplete).toHaveBeenCalledWith({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        success: false,
        error: 'Pipeline 執行失敗',
        triggerMode: 'ai-decide',
      });
    });
  });

  describe('onTrigger() - 觸發生命週期', () => {
    it('onTrigger 應呼叫 emitWorkflowAiDecideTriggered', () => {
      workflowAiDecideTriggerService.onTrigger({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        summary: 'Test summary',
        isSummarized: true,
      });

      expect(workflowEventEmitter.emitWorkflowAiDecideTriggered).toHaveBeenCalledWith(
        canvasId,
        'conn-ai-1',
        sourcePodId,
        targetPodId
      );
    });

    it('run 模式下 onTrigger 不呼叫 emitWorkflowAiDecideTriggered', () => {
      workflowAiDecideTriggerService.onTrigger({
        canvasId,
        connectionId: 'conn-ai-1',
        sourcePodId,
        targetPodId,
        summary: 'Test summary',
        isSummarized: true,
        runContext: mockRunContext,
      });

      expect(workflowEventEmitter.emitWorkflowAiDecideTriggered).not.toHaveBeenCalled();
    });

    it('onTrigger 未初始化時應拋出錯誤', () => {
      const uninitializedService = createUninitializedService();

      expect(() =>
        uninitializedService.onTrigger({
          canvasId,
          connectionId: 'conn-ai-1',
          sourcePodId,
          targetPodId,
          summary: 'Test summary',
          isSummarized: true,
        })
      ).toThrow('WorkflowAiDecideTriggerService 尚未初始化');
    });
  });

  describe('onQueued() - 佇列生命週期', () => {
    const mockQueuedContext = {
      canvasId,
      connectionId: 'conn-ai-1',
      sourcePodId,
      targetPodId,
      position: 0,
      queueSize: 1,
      triggerMode: 'ai-decide' as const,
      participatingConnectionIds: ['conn-ai-1'],
    };

    it('非 run 模式：更新連線狀態為 queued 並發送 emitWorkflowQueued 事件', () => {
      (connectionStore.findByTargetPodId as any).mockReturnValue([mockConnection]);

      workflowAiDecideTriggerService.onQueued(mockQueuedContext);

      expect(connectionStore.updateConnectionStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'queued');
      expect(workflowEventEmitter.emitWorkflowQueued).toHaveBeenCalled();
    });

    it('run 模式：不更新連線狀態也不發送 emitWorkflowQueued 事件', () => {
      workflowAiDecideTriggerService.onQueued({
        ...mockQueuedContext,
        runContext: mockRunContext,
      });

      expect(connectionStore.updateConnectionStatus).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitWorkflowQueued).not.toHaveBeenCalled();
    });
  });

  describe('handleRejectedConnection - 拒絕處理路徑', () => {
    it('多輸入場景 + 拒絕是最後一個回應 → 應更新 pending 狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: true,
        requiredSourcePodIds: [sourcePodId, 'other-source'],
      });

      (pendingTargetStore.hasPendingTarget as any).mockReturnValue(true);

      (pendingTargetStore.recordSourceRejection as any).mockReturnValue({ allSourcesResponded: true });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(pendingTargetStore.recordSourceRejection).toHaveBeenCalled();
    });

    it('多輸入場景 + 拒絕但還有其他 source 未回應 → 應記錄拒絕但不結束', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: true,
        requiredSourcePodIds: [sourcePodId, 'other-source', 'another-source'],
      });

      (pendingTargetStore.hasPendingTarget as any).mockReturnValue(true);

      (pendingTargetStore.recordSourceRejection as any).mockReturnValue({ allSourcesResponded: false });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(pendingTargetStore.recordSourceRejection).toHaveBeenCalled();
    });

    it('單一 ai-decide connection 被拒絕 + 非 multi input 場景 → 應更新連線狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: false,
        requiredSourcePodIds: [],
      });

      (connectionStore.findByTargetPodId as any).mockReturnValue([
        { id: 'conn-ai-1', triggerMode: 'ai-decide', sourcePodId, targetPodId },
      ]);

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'rejected', '不相關');
      expect(connectionStore.updateConnectionStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'ai-rejected');
    });

    it('多條 auto/ai-decide 連到同一 target，其中一條 ai-decide 被拒絕 → 應更新連線狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關' },
        ],
        errors: [],
      });

      (workflowStateService.checkMultiInputScenario as any).mockReturnValue({
        isMultiInput: false,
        requiredSourcePodIds: [],
      });

      (connectionStore.findByTargetPodId as any).mockReturnValue([
        { id: 'conn-ai-1', triggerMode: 'ai-decide', sourcePodId, targetPodId },
        { id: 'conn-auto-1', triggerMode: 'auto', sourcePodId: 'other-source', targetPodId },
      ]);

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection]
      );

      expect(connectionStore.updateDecideStatus).toHaveBeenCalledWith(canvasId, 'conn-ai-1', 'rejected', '不相關');
    });
  });

  describe('mode 屬性', () => {
    it('mode 應為 "ai-decide"', () => {
      expect(workflowAiDecideTriggerService.mode).toBe('ai-decide');
    });
  });

  describe('run 模式 - AI-Decide 拒絕/出錯時下游 pod instance 狀態更新', () => {
    it('run 模式下 AI-Decide 拒絕時呼叫 settleAndSkipPath', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關任務' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(runExecutionService.settleAndSkipPath).toHaveBeenCalledWith(mockRunContext, targetPodId, 'auto');
      expect(runExecutionService.errorPodInstance).not.toHaveBeenCalled();
    });

    it('run 模式下 AI-Decide 拒絕時不更新 connectionStore 狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: false, reason: '不相關任務' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(connectionStore.updateDecideStatus).not.toHaveBeenCalled();
      expect(connectionStore.updateConnectionStatus).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitAiDecideResult).not.toHaveBeenCalled();
    });

    it('run 模式下 AI-Decide 出錯時呼叫 errorPodInstance', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [],
        errors: [
          { connectionId: 'conn-ai-1', error: 'AI 決策失敗' },
        ],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(runExecutionService.errorPodInstance).toHaveBeenCalledWith(
        mockRunContext,
        targetPodId,
        'AI 判斷服務發生錯誤'
      );
      expect(runExecutionService.settleAndSkipPath).not.toHaveBeenCalled();
    });

    it('run 模式下 AI-Decide 出錯時不更新 connectionStore 狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [],
        errors: [
          { connectionId: 'conn-ai-1', error: 'AI 決策失敗' },
        ],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(connectionStore.updateDecideStatus).not.toHaveBeenCalled();
      expect(connectionStore.updateConnectionStatus).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitAiDecideError).not.toHaveBeenCalled();
    });

    it('run 模式下 AI-Decide 出錯使用 decideResult.reason 作為錯誤訊息', async () => {
      (aiDecideService.decideConnections as any).mockRejectedValue(new Error('網路錯誤'));

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(runExecutionService.errorPodInstance).toHaveBeenCalledWith(
        mockRunContext,
        targetPodId,
        '錯誤：網路錯誤'
      );
    });

    it('run 模式下 AI-Decide 核准時不呼叫 settleAndSkipPath 或 errorPodInstance', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [
          { connectionId: 'conn-ai-1', shouldTrigger: true, reason: '相關任務' },
        ],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext
      );

      expect(runExecutionService.settleAndSkipPath).not.toHaveBeenCalled();
      expect(runExecutionService.errorPodInstance).not.toHaveBeenCalled();
    });
  });

  describe('run 模式 - deciding 狀態', () => {
    it('processAiDecideConnections 在呼叫 decide 前設定目標 pod 為 deciding', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [{ connectionId: 'conn-ai-1', shouldTrigger: true, reason: '' }],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext,
      );

      expect(runExecutionService.decidingPodInstance).toHaveBeenCalledWith(mockRunContext, targetPodId);
    });

    it('AI-Decide 出錯後呼叫 errorPodInstance，不呼叫 settleAndSkipPath', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [],
        errors: [{ connectionId: 'conn-ai-1', error: 'AI 失敗' }],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext,
      );

      expect(runExecutionService.errorPodInstance).toHaveBeenCalledWith(mockRunContext, targetPodId, 'AI 判斷服務發生錯誤');
      expect(runExecutionService.settleAndSkipPath).not.toHaveBeenCalled();
    });

    it('run 模式下 AI-Decide 核准時不呼叫 settleAndSkipPath', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [{ connectionId: 'conn-ai-1', shouldTrigger: true, reason: '核准' }],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext,
      );

      expect(runExecutionService.settleAndSkipPath).not.toHaveBeenCalled();
    });

    it('run 模式下 approved 的連線不更新 connectionStore 狀態', async () => {
      (aiDecideService.decideConnections as any).mockResolvedValue({
        results: [{ connectionId: 'conn-ai-1', shouldTrigger: true, reason: '核准' }],
        errors: [],
      });

      await workflowAiDecideTriggerService.processAiDecideConnections(
        canvasId,
        sourcePodId,
        [mockConnection],
        mockRunContext,
      );

      expect(connectionStore.updateDecideStatus).not.toHaveBeenCalled();
      expect(connectionStore.updateConnectionStatus).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitAiDecideResult).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitAiDecidePending).not.toHaveBeenCalled();
    });

  });
});
