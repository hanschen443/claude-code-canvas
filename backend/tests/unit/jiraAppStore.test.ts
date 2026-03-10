import {beforeEach, describe, expect, it} from 'vitest';
import {initTestDb} from '../../src/database/index.js';
import {resetStatements} from '../../src/database/statements.js';
import {jiraAppStore} from '../../src/services/jira/jiraAppStore.js';

describe('JiraAppStore', () => {
    beforeEach(() => {
        initTestDb();
        resetStatements();
    });

    describe('create', () => {
        it('建立 Jira App 並回傳完整資料', () => {
            const result = jiraAppStore.create('測試 App', 'https://test.atlassian.net', 'test@example.com', 'api-token', 'webhook-secret');

            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('測試 App');
            expect(result.data?.siteUrl).toBe('https://test.atlassian.net');
            expect(result.data?.email).toBe('test@example.com');
            expect(result.data?.apiToken).toBe('api-token');
            expect(result.data?.webhookSecret).toBe('webhook-secret');
            expect(result.data?.connectionStatus).toBe('disconnected');
            expect(result.data?.projects).toEqual([]);
            expect(result.data?.id).toBeTruthy();
        });

        it('重複 siteUrl+email 組合應失敗', () => {
            jiraAppStore.create('App 1', 'https://test.atlassian.net', 'same@example.com', 'token-1', 'secret-1');
            const result = jiraAppStore.create('App 2', 'https://test.atlassian.net', 'same@example.com', 'token-2', 'secret-2');

            expect(result.success).toBe(false);
            expect(result.error).toContain('已存在');
        });

        it('不同 siteUrl+email 組合可建立多個 App', () => {
            jiraAppStore.create('App 1', 'https://site1.atlassian.net', 'user@example.com', 'token-1', 'secret-1');
            jiraAppStore.create('App 2', 'https://site2.atlassian.net', 'user@example.com', 'token-2', 'secret-2');

            expect(jiraAppStore.list().length).toBe(2);
        });
    });

    describe('list', () => {
        it('回傳所有 Jira Apps', () => {
            jiraAppStore.create('App 1', 'https://site1.atlassian.net', 'user1@example.com', 'token-1', 'secret-1');
            jiraAppStore.create('App 2', 'https://site2.atlassian.net', 'user2@example.com', 'token-2', 'secret-2');

            expect(jiraAppStore.list().length).toBe(2);
        });
    });

    describe('getById', () => {
        it('找不到回傳 undefined', () => {
            expect(jiraAppStore.getById('nonexistent')).toBeUndefined();
        });

        it('找到存在的 App', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const found = jiraAppStore.getById(created.data!.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.data!.id);
        });
    });

    describe('delete', () => {
        it('成功回傳 true', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;

            const result = jiraAppStore.delete(id);

            expect(result).toBe(true);
            expect(jiraAppStore.getById(id)).toBeUndefined();
        });

        it('不存在的 id 回傳 false', () => {
            expect(jiraAppStore.delete('nonexistent')).toBe(false);
        });

        it('刪除後 runtimeState 也一併清除', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;
            jiraAppStore.updateStatus(id, 'connected');

            jiraAppStore.delete(id);

            expect(jiraAppStore.getById(id)).toBeUndefined();
        });
    });

    describe('updateStatus', () => {
        it('更新連線狀態', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;

            jiraAppStore.updateStatus(id, 'connected');

            expect(jiraAppStore.getById(id)?.connectionStatus).toBe('connected');
        });

        it('不影響 projects', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;
            jiraAppStore.updateProjects(id, [{key: 'PROJ', name: 'Test'}]);

            jiraAppStore.updateStatus(id, 'error');

            expect(jiraAppStore.getById(id)?.projects).toEqual([{key: 'PROJ', name: 'Test'}]);
            expect(jiraAppStore.getById(id)?.connectionStatus).toBe('error');
        });
    });

    describe('updateProjects', () => {
        it('更新 projects 清單', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;
            const projects = [{key: 'PROJ', name: 'Test Project'}];

            jiraAppStore.updateProjects(id, projects);

            expect(jiraAppStore.getById(id)?.projects).toEqual(projects);
        });

        it('不影響 connectionStatus', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;
            jiraAppStore.updateStatus(id, 'connected');

            jiraAppStore.updateProjects(id, [{key: 'PROJ', name: 'Test'}]);

            expect(jiraAppStore.getById(id)?.connectionStatus).toBe('connected');
        });
    });

    describe('getBySiteUrlAndEmail', () => {
        it('找到已存在的 App 應回傳正確資料', () => {
            jiraAppStore.create('App', 'https://find.atlassian.net', 'find@example.com', 'token', 'secret');

            const found = jiraAppStore.getBySiteUrlAndEmail('https://find.atlassian.net', 'find@example.com');

            expect(found).toBeDefined();
            expect(found?.siteUrl).toBe('https://find.atlassian.net');
            expect(found?.email).toBe('find@example.com');
        });

        it('找不到時應回傳 undefined', () => {
            const result = jiraAppStore.getBySiteUrlAndEmail('https://nonexistent.atlassian.net', 'no@example.com');

            expect(result).toBeUndefined();
        });
    });

    describe('runtime 狀態（connectionStatus、projects）', () => {
        it('connectionStatus 和 projects 不寫入 DB，重啟後重置為預設值', () => {
            const created = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id = created.data!.id;

            jiraAppStore.updateStatus(id, 'connected');
            jiraAppStore.updateProjects(id, [{key: 'PROJ', name: 'Test'}]);

            // 模擬重啟：重新初始化 DB 與 statements
            initTestDb();
            resetStatements();

            const created2 = jiraAppStore.create('App', 'https://test.atlassian.net', 'user@example.com', 'token', 'secret');
            const id2 = created2.data!.id;

            const found = jiraAppStore.getById(id2);
            expect(found?.connectionStatus).toBe('disconnected');
            expect(found?.projects).toEqual([]);
        });
    });
});
