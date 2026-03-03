import { CanvasMapStore } from '../../src/services/shared/CanvasMapStore.js';

interface TestItem {
    id: string;
    value: string;
}

class TestStore extends CanvasMapStore<TestItem> {
    add(canvasId: string, item: TestItem): void {
        this.getOrCreateCanvasMap(canvasId).set(item.id, item);
    }

    findByValue(canvasId: string, value: string): TestItem[] {
        return this.findByPredicate(canvasId, (item) => item.value === value);
    }
}

describe('CanvasMapStore', () => {
    let store: TestStore;
    const canvasId = 'canvas-1';
    const canvasId2 = 'canvas-2';

    beforeEach(() => {
        store = new TestStore();
    });

    describe('getOrCreateCanvasMap', () => {
        it('首次存取時自動建立空 Map', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });

            const result = store.list(canvasId);
            expect(result).toHaveLength(1);
        });

        it('重複存取同一 canvasId 回傳同一個 Map', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId, { id: 'item-2', value: 'b' });

            const result = store.list(canvasId);
            expect(result).toHaveLength(2);
        });
    });

    describe('getById', () => {
        it('根據 id 取得正確項目', () => {
            const item = { id: 'item-1', value: 'hello' };
            store.add(canvasId, item);

            const found = store.getById(canvasId, 'item-1');
            expect(found).toEqual(item);
        });

        it('不存在的 id 回傳 undefined', () => {
            const found = store.getById(canvasId, 'non-exist');
            expect(found).toBeUndefined();
        });

        it('不同 canvas 的項目不互相干擾', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId2, { id: 'item-1', value: 'b' });

            expect(store.getById(canvasId, 'item-1')?.value).toBe('a');
            expect(store.getById(canvasId2, 'item-1')?.value).toBe('b');
        });
    });

    describe('list', () => {
        it('回傳指定 canvas 的所有項目', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId, { id: 'item-2', value: 'b' });

            const result = store.list(canvasId);
            expect(result).toHaveLength(2);
        });

        it('canvas 不存在時回傳空陣列', () => {
            const result = store.list('non-exist-canvas');
            expect(result).toEqual([]);
        });

        it('不同 canvas 的項目各自獨立', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId2, { id: 'item-2', value: 'b' });

            expect(store.list(canvasId)).toHaveLength(1);
            expect(store.list(canvasId2)).toHaveLength(1);
        });
    });

    describe('findByPredicate', () => {
        it('依條件過濾並回傳符合的項目', () => {
            store.add(canvasId, { id: 'item-1', value: 'match' });
            store.add(canvasId, { id: 'item-2', value: 'no-match' });
            store.add(canvasId, { id: 'item-3', value: 'match' });

            const result = store.findByValue(canvasId, 'match');
            expect(result).toHaveLength(2);
            expect(result.map((i) => i.id)).toEqual(expect.arrayContaining(['item-1', 'item-3']));
        });

        it('沒有符合條件時回傳空陣列', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });

            const result = store.findByValue(canvasId, 'z');
            expect(result).toEqual([]);
        });

        it('canvas 不存在時回傳空陣列', () => {
            const result = store.findByValue('non-exist-canvas', 'match');
            expect(result).toEqual([]);
        });
    });

    describe('deleteCanvas', () => {
        it('刪除指定 canvas 的所有資料', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId, { id: 'item-2', value: 'b' });

            store.deleteCanvas(canvasId);

            expect(store.list(canvasId)).toEqual([]);
        });

        it('刪除後不影響其他 canvas', () => {
            store.add(canvasId, { id: 'item-1', value: 'a' });
            store.add(canvasId2, { id: 'item-2', value: 'b' });

            store.deleteCanvas(canvasId);

            expect(store.list(canvasId2)).toHaveLength(1);
        });

        it('刪除不存在的 canvas 不拋出錯誤', () => {
            expect(() => store.deleteCanvas('non-exist-canvas')).not.toThrow();
        });
    });
});
