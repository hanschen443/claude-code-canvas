import type {Mock} from 'vitest';

vi.mock('../../src/services/jira/jiraAppStore.js', () => ({
    jiraAppStore: {
        getById: vi.fn(),
        updateStatus: vi.fn(),
        updateProjects: vi.fn(),
    },
}));

vi.mock('../../src/services/socketService.js', () => ({
    socketService: {
        emitToAll: vi.fn(),
    },
}));

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {jiraClientManager} from '../../src/services/jira/jiraClientManager.js';
import {jiraAppStore} from '../../src/services/jira/jiraAppStore.js';
import {socketService} from '../../src/services/socketService.js';
import type {JiraApp} from '../../src/types/index.js';

function asMock(fn: unknown): Mock<any> {
    return fn as Mock<any>;
}

function makeJiraApp(overrides: Partial<JiraApp> = {}): JiraApp {
    return {
        id: 'app-1',
        name: 'Test App',
        siteUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
        webhookSecret: 'test-secret',
        connectionStatus: 'disconnected',
        projects: [],
        ...overrides,
    };
}

function mockFetchSuccess(): void {
    global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/rest/api/3/myself')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({emailAddress: 'test@example.com', displayName: 'Test User'}),
            });
        }
        if (url.includes('/rest/api/3/project')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([{key: 'PROJ', name: 'Test Project'}]),
            });
        }
        return Promise.resolve({ok: false, status: 404});
    }) as unknown as typeof fetch;
}

describe('JiraClientManager', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchSuccess();

        const app = makeJiraApp();
        asMock(jiraAppStore.getById).mockReturnValue(app);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jiraClientManager.destroyAll();
    });

    describe('initialize', () => {
        it('成功時 connectionStatus 應廣播為 connected', async () => {
            const app = makeJiraApp();
            asMock(jiraAppStore.getById).mockReturnValue({...app, connectionStatus: 'connected', projects: []});

            await jiraClientManager.initialize(app);

            expect(jiraAppStore.updateStatus).toHaveBeenCalledWith('app-1', 'connected');
            expect(socketService.emitToAll).toHaveBeenCalled();
        });

        it('API 驗證失敗（非 200 回應）時應廣播 error', async () => {
            const app = makeJiraApp();
            global.fetch = vi.fn().mockResolvedValue({ok: false, status: 401}) as unknown as typeof fetch;
            asMock(jiraAppStore.getById).mockReturnValue({...app, connectionStatus: 'error', projects: []});

            await jiraClientManager.initialize(app);

            expect(jiraAppStore.updateStatus).toHaveBeenCalledWith('app-1', 'error');
            expect(socketService.emitToAll).toHaveBeenCalled();
        });

        it('網路錯誤時應廣播 error', async () => {
            const app = makeJiraApp();
            global.fetch = vi.fn().mockRejectedValue(new Error('網路錯誤')) as unknown as typeof fetch;
            asMock(jiraAppStore.getById).mockReturnValue({...app, connectionStatus: 'error', projects: []});

            await jiraClientManager.initialize(app);

            expect(jiraAppStore.updateStatus).toHaveBeenCalledWith('app-1', 'error');
            expect(socketService.emitToAll).toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('應更新 connectionStatus 為 disconnected 並廣播', async () => {
            const app = makeJiraApp();
            asMock(jiraAppStore.getById).mockReturnValue({...app, connectionStatus: 'disconnected', projects: []});
            await jiraClientManager.initialize(app);

            jiraClientManager.remove('app-1');

            expect(jiraAppStore.updateStatus).toHaveBeenCalledWith('app-1', 'disconnected');
            expect(socketService.emitToAll).toHaveBeenCalled();
        });
    });

    describe('refreshProjects', () => {
        it('成功時應更新 projects 清單', async () => {
            const app = makeJiraApp();
            asMock(jiraAppStore.getById).mockReturnValue({...app, connectionStatus: 'connected', projects: []});
            await jiraClientManager.initialize(app);

            const projects = await jiraClientManager.refreshProjects('app-1');

            expect(projects).toEqual([{key: 'PROJ', name: 'Test Project'}]);
            expect(jiraAppStore.updateProjects).toHaveBeenCalledWith('app-1', [{key: 'PROJ', name: 'Test Project'}]);
        });

        it('在 client 未初始化時應拋出錯誤', async () => {
            await expect(jiraClientManager.refreshProjects('nonexistent')).rejects.toThrow('尚未初始化');
        });
    });

    describe('destroyAll', () => {
        it('應清除所有 clients', async () => {
            const app1 = makeJiraApp({id: 'app-destroy-1'});
            const app2 = makeJiraApp({id: 'app-destroy-2'});
            asMock(jiraAppStore.getById).mockImplementation((id: string) => ({
                ...makeJiraApp({id}),
                connectionStatus: 'connected' as const,
                projects: [],
            }));

            await jiraClientManager.initialize(app1);
            await jiraClientManager.initialize(app2);

            jiraClientManager.destroyAll();

            await expect(jiraClientManager.refreshProjects('app-destroy-1')).rejects.toThrow('尚未初始化');
            await expect(jiraClientManager.refreshProjects('app-destroy-2')).rejects.toThrow('尚未初始化');
        });
    });
});
