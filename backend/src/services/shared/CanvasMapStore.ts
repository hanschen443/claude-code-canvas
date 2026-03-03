export abstract class CanvasMapStore<T extends { id: string }> {
    protected dataByCanvas: Map<string, Map<string, T>> = new Map();

    protected getOrCreateCanvasMap(canvasId: string): Map<string, T> {
        let map = this.dataByCanvas.get(canvasId);
        if (!map) {
            map = new Map();
            this.dataByCanvas.set(canvasId, map);
        }
        return map;
    }

    protected findByPredicate(canvasId: string, predicate: (item: T) => boolean): T[] {
        return Array.from(this.getOrCreateCanvasMap(canvasId).values()).filter(predicate);
    }

    getById(canvasId: string, id: string): T | undefined {
        return this.getOrCreateCanvasMap(canvasId).get(id);
    }

    list(canvasId: string): T[] {
        return Array.from(this.getOrCreateCanvasMap(canvasId).values());
    }

    deleteCanvas(canvasId: string): void {
        this.dataByCanvas.delete(canvasId);
    }
}
