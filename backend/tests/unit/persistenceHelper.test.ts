import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('../../src/utils/persistentWriteHelper.js', () => ({
    createPersistentWriter: vi.fn(() => ({
        writeQueue: {},
        enqueueWrite: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined),
    })),
}));

import {createPersistentWriter} from '../../src/utils/persistentWriteHelper.js';
import {PersistenceHelper, CanvasWriterHelper} from '../../src/services/shared/PersistenceHelper.js';

const mockEnqueueWrite = vi.fn();
const mockFlush = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
    vi.clearAllMocks();
    (createPersistentWriter as ReturnType<typeof vi.fn>).mockReturnValue({
        writeQueue: {},
        enqueueWrite: mockEnqueueWrite,
        flush: mockFlush,
    });
});

describe('PersistenceHelper', () => {
    describe('currentDataDir', () => {
        it('初始狀態為 null', () => {
            const helper = new PersistenceHelper('McpServer', 'TestStore', 'global');
            expect(helper.currentDataDir).toBeNull();
        });

        it('initDataDir 後回傳設定的路徑', () => {
            const helper = new PersistenceHelper('McpServer', 'TestStore', 'global');
            helper.initDataDir('/data/test');
            expect(helper.currentDataDir).toBe('/data/test');
        });
    });

    describe('scheduleSave', () => {
        it('dataDir 為 null 時不呼叫 enqueueWrite', () => {
            const helper = new PersistenceHelper('McpServer', 'TestStore', 'global');
            const saveFn = vi.fn().mockResolvedValue({success: true});

            helper.scheduleSave(saveFn);

            expect(mockEnqueueWrite).not.toHaveBeenCalled();
        });

        it('dataDir 設定後使用預設 writeKey 排程寫入', () => {
            const helper = new PersistenceHelper('McpServer', 'TestStore', 'global');
            helper.initDataDir('/data/test');

            const saveFn = vi.fn().mockResolvedValue({success: true});
            helper.scheduleSave(saveFn);

            expect(mockEnqueueWrite).toHaveBeenCalledWith('global', saveFn);
        });

        it('傳入自訂 writeKey 時使用自訂 key', () => {
            const helper = new PersistenceHelper('McpServer', 'TestStore', 'global');
            helper.initDataDir('/data/test');

            const saveFn = vi.fn().mockResolvedValue({success: true});
            helper.scheduleSave(saveFn, 'custom-key');

            expect(mockEnqueueWrite).toHaveBeenCalledWith('custom-key', saveFn);
        });
    });

    describe('flush', () => {
        it('使用預設 writeKey 等待寫入完成', async () => {
            const helper = new PersistenceHelper('Slack', 'TestStore', 'slack-apps');
            await helper.flush();

            expect(mockFlush).toHaveBeenCalledWith('slack-apps');
        });

        it('傳入自訂 writeKey 時使用自訂 key', async () => {
            const helper = new PersistenceHelper('Slack', 'TestStore', 'slack-apps');
            await helper.flush('custom-key');

            expect(mockFlush).toHaveBeenCalledWith('custom-key');
        });
    });
});

describe('CanvasWriterHelper', () => {
    describe('scheduleSave', () => {
        it('以 canvasId 作為 writeKey 排程寫入', () => {
            const helper = new CanvasWriterHelper('Connection', 'ConnectionStore');
            const saveFn = vi.fn().mockResolvedValue({success: true});

            helper.scheduleSave('canvas-1', saveFn);

            expect(mockEnqueueWrite).toHaveBeenCalledWith('canvas-1', saveFn);
        });

        it('不同 canvasId 分別排程各自的寫入', () => {
            const helper = new CanvasWriterHelper('Note', 'TestNoteStore');
            const saveFn1 = vi.fn().mockResolvedValue({success: true});
            const saveFn2 = vi.fn().mockResolvedValue({success: true});

            helper.scheduleSave('canvas-1', saveFn1);
            helper.scheduleSave('canvas-2', saveFn2);

            expect(mockEnqueueWrite).toHaveBeenCalledWith('canvas-1', saveFn1);
            expect(mockEnqueueWrite).toHaveBeenCalledWith('canvas-2', saveFn2);
        });
    });

    describe('flush', () => {
        it('以 canvasId 等待寫入完成', async () => {
            const helper = new CanvasWriterHelper('Connection', 'ConnectionStore');
            await helper.flush('canvas-1');

            expect(mockFlush).toHaveBeenCalledWith('canvas-1');
        });
    });
});
