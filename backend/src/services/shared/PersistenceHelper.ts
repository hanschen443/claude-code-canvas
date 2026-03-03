import {createPersistentWriter} from '../../utils/persistentWriteHelper.js';
import type {LogCategory} from '../../utils/logger.js';
import type {Result} from '../../types/result.js';

/**
 * 封裝 dataDir + writer + 排程寫入的重複模式，
 * 供不需要多重繼承的全域 Store 使用（組合而非繼承）。
 */
export class PersistenceHelper {
    private dataDir: string | null = null;
    private readonly writer: ReturnType<typeof createPersistentWriter>;
    private readonly defaultWriteKey: string;

    constructor(category: LogCategory, storeName: string, defaultWriteKey: string) {
        this.writer = createPersistentWriter(category, storeName);
        this.defaultWriteKey = defaultWriteKey;
    }

    get currentDataDir(): string | null {
        return this.dataDir;
    }

    initDataDir(dataDir: string): void {
        this.dataDir = dataDir;
    }

    scheduleSave(saveFn: () => Promise<Result<void>>, writeKey?: string): void {
        if (!this.dataDir) return;
        this.writer.enqueueWrite(writeKey ?? this.defaultWriteKey, saveFn);
    }

    flush(writeKey?: string): Promise<void> {
        return this.writer.flush(writeKey ?? this.defaultWriteKey);
    }
}

/**
 * 封裝 Canvas 範圍的 writer + 排程寫入的重複模式，
 * 供繼承 CanvasMapStore 的 Store 使用（組合而非繼承）。
 */
export class CanvasWriterHelper {
    private readonly writer: ReturnType<typeof createPersistentWriter>;

    constructor(category: LogCategory, storeName: string) {
        this.writer = createPersistentWriter(category, storeName);
    }

    scheduleSave(canvasId: string, saveFn: () => Promise<Result<void>>): void {
        this.writer.enqueueWrite(canvasId, saveFn);
    }

    flush(canvasId: string): Promise<void> {
        return this.writer.flush(canvasId);
    }
}
