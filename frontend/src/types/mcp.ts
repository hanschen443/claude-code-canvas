/**
 * MCP 清單項目：
 * - name：MCP server 名稱
 * - type：連線類型（stdio 或 http），與後端 mcpListItemSchema 對齊
 *   - Claude：不帶 type（前端僅顯示 name + Switch）
 *   - Codex：必帶 type（前端顯示 name + 類型標籤 + ✓）
 */
export interface McpListItem {
  name: string;
  type?: "stdio" | "http";
}
