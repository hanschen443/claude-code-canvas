import type { TestWebSocketClient } from "../setup";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs/promises";
import * as path from "path";
import { emitAndWaitResponse } from "../setup";
import { testConfig } from "../setup";
import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
  type RepositoryCreatePayload,
  type CommandCreatePayload,
} from "../../src/schemas";
import {
  type RepositoryCreatedPayload,
  type CommandCreatedPayload,
} from "../../src/types";

export async function createSkillFile(
  name: string,
  content: string,
): Promise<string> {
  const skillDir = path.join(testConfig.skillsPath, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content);
  return name;
}

export async function createRepository(
  client: TestWebSocketClient,
  name: string,
  overrides?: Partial<RepositoryCreatePayload>,
): Promise<{ id: string; name: string }> {
  if (!client.id) {
    throw new Error("Socket not connected");
  }

  const canvasModule = await import("../../src/services/canvasStore.js");
  const canvasId = canvasModule.canvasStore.getActiveCanvas(client.id);

  if (!canvasId) {
    throw new Error("No active canvas for socket");
  }

  const response = await emitAndWaitResponse<
    RepositoryCreatePayload,
    RepositoryCreatedPayload
  >(
    client,
    WebSocketRequestEvents.REPOSITORY_CREATE,
    WebSocketResponseEvents.REPOSITORY_CREATED,
    { requestId: uuidv4(), canvasId, name, ...overrides },
  );

  return response.repository!;
}

export async function createCommand(
  client: TestWebSocketClient,
  name: string,
  content: string,
  overrides?: Partial<CommandCreatePayload>,
): Promise<{ id: string; name: string }> {
  if (!client.id) {
    throw new Error("Socket not connected");
  }

  const canvasModule = await import("../../src/services/canvasStore.js");
  const canvasId = canvasModule.canvasStore.getActiveCanvas(client.id);

  if (!canvasId) {
    throw new Error("No active canvas for socket");
  }

  const response = await emitAndWaitResponse<
    CommandCreatePayload,
    CommandCreatedPayload
  >(
    client,
    WebSocketRequestEvents.COMMAND_CREATE,
    WebSocketResponseEvents.COMMAND_CREATED,
    { requestId: uuidv4(), canvasId, name, content, ...overrides },
  );

  return response.command!;
}
