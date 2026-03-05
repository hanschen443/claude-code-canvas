import {
  createTestServer,
  closeTestServer,
  type TestServerInstance,
} from './testServer.js';
import { createSocketClient, disconnectSocket, type TestWebSocketClient } from './socketClient.js';

export function setupIntegrationTest() {
  let server: TestServerInstance;
  let client: TestWebSocketClient;

  beforeAll(async () => {
    server = await createTestServer();
    client = await createSocketClient(server.baseUrl, server.canvasId);
  });

  afterAll(async () => {
    if (client?.connected) await disconnectSocket(client);
    if (server) await closeTestServer(server);
  });

  return {
    getServer: () => server,
    getClient: () => client,
  };
}
