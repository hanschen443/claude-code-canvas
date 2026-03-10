import {v4 as uuidv4} from 'uuid';
import type {JiraApp, JiraAppConnectionStatus, JiraProject} from '../../types/index.js';
import {Result, ok, err} from '../../types/index.js';
import {getDb} from '../../database/index.js';
import {getStatements} from '../../database/statements.js';

interface JiraAppRow {
    id: string;
    name: string;
    site_url: string;
    email: string;
    api_token: string;
    webhook_secret: string;
}

class JiraAppStore {
    private runtimeState: Map<string, {connectionStatus: JiraAppConnectionStatus; projects: JiraProject[]}> =
        new Map();

    private get stmts(): ReturnType<typeof getStatements>['jiraApp'] {
        return getStatements(getDb()).jiraApp;
    }

    private rowToJiraApp(row: JiraAppRow): JiraApp {
        const runtime = this.runtimeState.get(row.id);
        return {
            id: row.id,
            name: row.name,
            siteUrl: row.site_url,
            email: row.email,
            apiToken: row.api_token,
            webhookSecret: row.webhook_secret,
            connectionStatus: runtime?.connectionStatus ?? 'disconnected',
            projects: runtime?.projects ?? [],
        };
    }

    create(name: string, siteUrl: string, email: string, apiToken: string, webhookSecret: string): Result<JiraApp> {
        const id = uuidv4();

        try {
            this.stmts.insert.run({$id: id, $name: name, $siteUrl: siteUrl, $email: email, $apiToken: apiToken, $webhookSecret: webhookSecret});
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('UNIQUE constraint failed')) {
                return err('此 Site URL 與 Email 組合已存在');
            }
            throw error;
        }

        return ok({
            id,
            name,
            siteUrl,
            email,
            apiToken,
            webhookSecret,
            connectionStatus: 'disconnected',
            projects: [],
        });
    }

    list(): JiraApp[] {
        const rows = this.stmts.selectAll.all() as JiraAppRow[];
        return rows.map((row) => this.rowToJiraApp(row));
    }

    getById(id: string): JiraApp | undefined {
        const row = this.stmts.selectById.get(id) as JiraAppRow | undefined;
        if (!row) return undefined;
        return this.rowToJiraApp(row);
    }

    getBySiteUrlAndEmail(siteUrl: string, email: string): JiraApp | undefined {
        const row = this.stmts.selectBySiteUrlAndEmail.get(siteUrl, email) as JiraAppRow | undefined;
        if (!row) return undefined;
        return this.rowToJiraApp(row);
    }

    updateStatus(id: string, status: JiraAppConnectionStatus): void {
        const current = this.runtimeState.get(id) ?? {connectionStatus: 'disconnected', projects: []};
        this.runtimeState.set(id, {...current, connectionStatus: status});
    }

    updateProjects(id: string, projects: JiraProject[]): void {
        const current = this.runtimeState.get(id) ?? {connectionStatus: 'disconnected', projects: []};
        this.runtimeState.set(id, {...current, projects});
    }

    delete(id: string): boolean {
        const result = this.stmts.deleteById.run(id);
        this.runtimeState.delete(id);
        return result.changes > 0;
    }
}

export const jiraAppStore = new JiraAppStore();
