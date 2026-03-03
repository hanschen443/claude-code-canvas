import path from 'path';
import {v4 as uuidv4} from 'uuid';
import {z} from 'zod';
import type {McpServer, McpServerConfig} from '../types/mcpServer.js';
import type {Result} from '../types/result.js';
import {ok, err} from '../types/result.js';
import {persistenceService} from './persistence/index.js';
import {logger} from '../utils/logger.js';
import {PersistenceHelper} from './shared/PersistenceHelper.js';

const MCP_SERVERS_FILE = 'mcp-servers.json';

const NetworkConfigSchema = z.object({
    type: z.enum(['http', 'sse']),
    url: z.string().min(1),
});

const CommandConfigSchema = z.object({
    command: z.string().min(1),
});

const McpServerSchema = z.object({
    id: z.string().min(1),
    name: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    config: z.union([NetworkConfigSchema, CommandConfigSchema]),
});

export class McpServerStore {
    private servers: Map<string, McpServer> = new Map();
    private readonly persistence = new PersistenceHelper('McpServer', 'McpServerStore', 'global');

    create(name: string, config: McpServerConfig): McpServer {
        const id = uuidv4();
        const server: McpServer = {id, name, config};
        this.servers.set(id, server);
        this.saveToDiskAsync();
        return server;
    }

    list(): McpServer[] {
        return Array.from(this.servers.values());
    }

    getById(id: string): McpServer | undefined {
        return this.servers.get(id);
    }

    async exists(id: string): Promise<boolean> {
        return this.servers.has(id);
    }

    update(id: string, name: string, config: McpServerConfig): McpServer | undefined {
        const server = this.servers.get(id);
        if (!server) {
            return undefined;
        }

        const updated: McpServer = {...server, name, config};
        this.servers.set(id, updated);
        this.saveToDiskAsync();
        return updated;
    }

    delete(id: string): boolean {
        const deleted = this.servers.delete(id);
        if (deleted) {
            this.saveToDiskAsync();
        }
        return deleted;
    }

    getByIds(ids: string[]): McpServer[] {
        return ids.flatMap((id) => {
            const server = this.servers.get(id);
            return server ? [server] : [];
        });
    }

    private validateServerData(server: unknown): server is McpServer {
        return McpServerSchema.safeParse(server).success;
    }

    async loadFromDisk(dataDir: string): Promise<Result<void>> {
        this.persistence.initDataDir(dataDir);
        const filePath = path.join(dataDir, MCP_SERVERS_FILE);
        const result = await persistenceService.readJson<McpServer[]>(filePath);

        if (!result.success) {
            return err(`載入 MCP Server 資料失敗: ${result.error}`);
        }

        const servers = result.data ?? [];
        this.servers.clear();

        for (const server of servers) {
            if (!this.validateServerData(server)) {
                logger.warn('McpServer', 'Load', `[McpServerStore] 跳過結構不合格的 MCP Server: ${JSON.stringify(server)}`);
                continue;
            }
            this.servers.set(server.id, server);
        }

        logger.log('McpServer', 'Load', `[McpServerStore] 成功載入 ${this.servers.size} 個 MCP Server`);
        return ok(undefined);
    }

    async saveToDisk(dataDir: string): Promise<Result<void>> {
        const filePath = path.join(dataDir, MCP_SERVERS_FILE);
        const servers = Array.from(this.servers.values());
        return persistenceService.writeJson(filePath, servers);
    }

    saveToDiskAsync(): void {
        const dataDir = this.persistence.currentDataDir;
        if (!dataDir) return;
        this.persistence.scheduleSave(() => this.saveToDisk(dataDir));
    }
}

export const mcpServerStore = new McpServerStore();
