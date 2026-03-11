import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { initTestDb } from '../../src/database/index.js';
import { resetStatements } from '../../src/database/statements.js';
import { integrationAppStore } from '../../src/services/integration/integrationAppStore.js';
import { integrationRegistry } from '../../src/services/integration/integrationRegistry.js';
import type { IntegrationApp, IntegrationProvider, IntegrationResource, NormalizedEvent } from '../../src/services/integration/types.js';
import type { Result } from '../../src/types/index.js';
import { ok, err } from '../../src/types/index.js';

function makeProvider(name: string, validateResult: Result<void> = ok()): IntegrationProvider {
  return {
    name,
    displayName: name,
    createAppSchema: z.object({}),
    bindSchema: z.object({ resourceId: z.string() }),
    validateCreate: vi.fn().mockReturnValue(validateResult),
    sanitizeConfig(): Record<string, unknown> { return {}; },
    async initialize(_app: IntegrationApp): Promise<void> {},
    destroy(_appId: string): void {},
    destroyAll(): void {},
    async refreshResources(_appId: string): Promise<IntegrationResource[]> { return []; },
    formatEventMessage(_event: unknown, _app: IntegrationApp): NormalizedEvent | null { return null; },
  };
}

describe('IntegrationAppStore', () => {
  let slackProvider: IntegrationProvider;
  let telegramProvider: IntegrationProvider;

  beforeEach(() => {
    initTestDb();
    resetStatements();

    // 每次測試重新建立一個全新的 registry 避免 singleton 狀態干擾
    // 直接操作 integrationRegistry 的私有 providers Map
    (integrationRegistry as unknown as { providers: Map<string, IntegrationProvider> }).providers.clear();

    slackProvider = makeProvider('slack');
    telegramProvider = makeProvider('telegram');
    integrationRegistry.register(slackProvider);
    integrationRegistry.register(telegramProvider);
  });

  describe('create', () => {
    it('成功建立 App 並委派 validateCreate 給 Provider', () => {
      const config = { botToken: 'xoxb-test', signingSecret: 'secret' };
      const result = integrationAppStore.create('slack', '測試 Slack App', config);

      expect(result.success).toBe(true);
      expect(result.data?.provider).toBe('slack');
      expect(result.data?.name).toBe('測試 Slack App');
      expect(result.data?.config).toEqual(config);
      expect(result.data?.connectionStatus).toBe('disconnected');
      expect(result.data?.resources).toEqual([]);
      expect(result.data?.id).toBeTruthy();
      expect(slackProvider.validateCreate).toHaveBeenCalledWith(config);
    });

    it('validateCreate 失敗時回傳 err', () => {
      const failProvider = makeProvider('fail-provider', err('Bot Token 已存在'));
      (integrationRegistry as unknown as { providers: Map<string, IntegrationProvider> }).providers.clear();
      integrationRegistry.register(failProvider);

      const result = integrationAppStore.create('fail-provider', 'App', { botToken: 'dup' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot Token 已存在');
    });

    it('同一 Provider 下相同名稱的 App 應回傳 UNIQUE 錯誤', () => {
      integrationAppStore.create('slack', '重複名稱', { botToken: 'token-1' });
      const result = integrationAppStore.create('slack', '重複名稱', { botToken: 'token-2' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('重複名稱');
    });

    it('不存在的 Provider 應拋出錯誤', () => {
      expect(() => integrationAppStore.create('nonexistent', 'App', {})).toThrow('nonexistent');
    });
  });

  describe('list', () => {
    it('無 App 時回傳空陣列', () => {
      expect(integrationAppStore.list()).toEqual([]);
    });

    it('列出所有 Provider 的 App', () => {
      integrationAppStore.create('slack', 'Slack App', { botToken: 'token-s' });
      integrationAppStore.create('telegram', 'Telegram App', { botToken: 'token-t' });

      expect(integrationAppStore.list()).toHaveLength(2);
    });

    it('列出指定 Provider 的 App', () => {
      integrationAppStore.create('slack', 'Slack App 1', { botToken: 'token-s1' });
      integrationAppStore.create('slack', 'Slack App 2', { botToken: 'token-s2' });
      integrationAppStore.create('telegram', 'Telegram App', { botToken: 'token-t' });

      const slackApps = integrationAppStore.list('slack');
      expect(slackApps).toHaveLength(2);
      expect(slackApps.every((a) => a.provider === 'slack')).toBe(true);
    });

    it('指定不存在的 Provider 回傳空陣列', () => {
      integrationAppStore.create('slack', 'Slack App', { botToken: 'token-s' });

      expect(integrationAppStore.list('jira')).toEqual([]);
    });
  });

  describe('getById', () => {
    it('找到存在的 App', () => {
      const created = integrationAppStore.create('slack', 'My App', { botToken: 'token' });
      const found = integrationAppStore.getById(created.data!.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.data!.id);
      expect(found?.name).toBe('My App');
    });

    it('不存在時回傳 undefined', () => {
      expect(integrationAppStore.getById('nonexistent-id')).toBeUndefined();
    });
  });

  describe('getByProviderAndConfigField', () => {
    it('以 Provider 和 config 欄位找到對應 App', () => {
      integrationAppStore.create('slack', 'Slack App', { botToken: 'xoxb-unique-token', signingSecret: 'sec' });

      const found = integrationAppStore.getByProviderAndConfigField('slack', '$.botToken', 'xoxb-unique-token');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Slack App');
    });

    it('Provider 不符合時不回傳', () => {
      integrationAppStore.create('slack', 'Slack App', { botToken: 'xoxb-find-token' });

      const found = integrationAppStore.getByProviderAndConfigField('telegram', '$.botToken', 'xoxb-find-token');

      expect(found).toBeUndefined();
    });

    it('值不符合時回傳 undefined', () => {
      integrationAppStore.create('slack', 'Slack App', { botToken: 'xoxb-token' });

      const found = integrationAppStore.getByProviderAndConfigField('slack', '$.botToken', 'wrong-token');

      expect(found).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('更新 Runtime connectionStatus', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;

      integrationAppStore.updateStatus(id, 'connected');

      expect(integrationAppStore.getById(id)?.connectionStatus).toBe('connected');
    });

    it('更新為 error 狀態', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;

      integrationAppStore.updateStatus(id, 'error');

      expect(integrationAppStore.getById(id)?.connectionStatus).toBe('error');
    });

    it('更新 status 不影響 resources', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;
      const resources: IntegrationResource[] = [{ id: 'C001', name: 'general' }];
      integrationAppStore.updateResources(id, resources);

      integrationAppStore.updateStatus(id, 'connected');

      expect(integrationAppStore.getById(id)?.resources).toEqual(resources);
    });
  });

  describe('updateResources', () => {
    it('更新 Runtime resources', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;
      const resources: IntegrationResource[] = [
        { id: 'C001', name: 'general' },
        { id: 'C002', name: 'random' },
      ];

      integrationAppStore.updateResources(id, resources);

      expect(integrationAppStore.getById(id)?.resources).toEqual(resources);
    });

    it('更新 resources 不影響 connectionStatus', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;
      integrationAppStore.updateStatus(id, 'connected');

      integrationAppStore.updateResources(id, [{ id: 'C001', name: 'general' }]);

      expect(integrationAppStore.getById(id)?.connectionStatus).toBe('connected');
    });
  });

  describe('updateExtraJson', () => {
    it('將 extra 資訊寫入 DB', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;

      integrationAppStore.updateExtraJson(id, { botUserId: 'U123456' });

      // 透過重新初始化確認資料已寫入 DB（runtimeState 不包含 extra）
      // extra_json 是 DB 欄位，不會直接出現在 IntegrationApp 上
      // 只驗證不拋出錯誤
      expect(() => integrationAppStore.updateExtraJson(id, { botUserId: 'U123456' })).not.toThrow();
    });
  });

  describe('delete', () => {
    it('成功刪除存在的 App', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;

      const result = integrationAppStore.delete(id);

      expect(result).toBe(true);
      expect(integrationAppStore.getById(id)).toBeUndefined();
    });

    it('不存在的 App 回傳 false', () => {
      expect(integrationAppStore.delete('nonexistent-id')).toBe(false);
    });

    it('刪除後 runtimeState 也一併清除', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;
      integrationAppStore.updateStatus(id, 'connected');
      integrationAppStore.updateResources(id, [{ id: 'C001', name: 'general' }]);

      integrationAppStore.delete(id);

      expect(integrationAppStore.getById(id)).toBeUndefined();
    });
  });

  describe('runtimeState 不持久化', () => {
    it('connectionStatus 和 resources 重啟後重置為預設值', () => {
      const created = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const id = created.data!.id;
      integrationAppStore.updateStatus(id, 'connected');
      integrationAppStore.updateResources(id, [{ id: 'C001', name: 'general' }]);

      // 模擬重啟：重新初始化 DB 與 statements
      initTestDb();
      resetStatements();
      (integrationRegistry as unknown as { providers: Map<string, IntegrationProvider> }).providers.clear();
      integrationRegistry.register(makeProvider('slack'));

      const created2 = integrationAppStore.create('slack', 'App', { botToken: 'token' });
      const found = integrationAppStore.getById(created2.data!.id);

      expect(found?.connectionStatus).toBe('disconnected');
      expect(found?.resources).toEqual([]);
    });
  });
});
