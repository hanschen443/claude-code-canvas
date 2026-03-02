import { WriteQueue } from './writeQueue.js';
import { logger, type LogCategory } from './logger.js';
import type { Result } from '../types/result.js';

export function createPersistentWriter(category: LogCategory, storeName: string): {
    writeQueue: WriteQueue;
    enqueueWrite(key: string, writeFn: () => Promise<Result<void>>): void;
    flush(key: string): Promise<void>;
} {
    const writeQueue = new WriteQueue(category, storeName);

    return {
        writeQueue,
        enqueueWrite(key: string, writeFn: () => Promise<Result<void>>): void {
            writeQueue.enqueue(key, async () => {
                const result = await writeFn();
                if (!result.success) {
                    logger.error(category, 'Save', `[${storeName}] 儲存失敗: ${result.error}`);
                }
            });
        },
        flush(key: string): Promise<void> {
            return writeQueue.flush(key);
        },
    };
}
