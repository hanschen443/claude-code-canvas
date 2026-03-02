import { v4 as uuidv4 } from 'uuid';
import type { ServerWebSocket } from 'bun';
import type { ClientConnection } from '../types/websocket.js';

class ConnectionManager {
	private connections: Map<string, ClientConnection> = new Map();

	add(webSocket: ServerWebSocket<{ connectionId: string }>): string {
		const id = uuidv4();
		const connection: ClientConnection = {
			id,
			webSocket,
			canvasId: null,
			lastHeartbeat: Date.now(),
			missedHeartbeats: 0,
		};
		this.connections.set(id, connection);
		return id;
	}

	remove(id: string): void {
		this.connections.delete(id);
	}

	get(id: string): ClientConnection | undefined {
		return this.connections.get(id);
	}
	getAll(): ClientConnection[] {
		return Array.from(this.connections.values());
	}

	setCanvasId(id: string, canvasId: string): void {
		const connection = this.connections.get(id);
		if (connection) {
			connection.canvasId = canvasId;
		}
	}

	getCanvasId(id: string): string | null {
		const connection = this.connections.get(id);
		return connection?.canvasId ?? null;
	}

	updateHeartbeat(id: string): void {
		const connection = this.connections.get(id);
		if (connection) {
			connection.lastHeartbeat = Date.now();
			connection.missedHeartbeats = 0;
		}
	}

	incrementMissedHeartbeats(id: string): void {
		const connection = this.connections.get(id);
		if (connection) {
			connection.missedHeartbeats++;
		}
	}
}

export const connectionManager = new ConnectionManager();
