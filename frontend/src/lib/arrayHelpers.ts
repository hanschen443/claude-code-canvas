/**
 * 根據 id 從陣列中移除元素，回傳新陣列。
 */
export function removeById<T extends { id: string }>(items: T[], id: string): T[] {
    return items.filter(item => item.id !== id)
}
