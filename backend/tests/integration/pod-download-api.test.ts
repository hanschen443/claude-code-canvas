import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { unzipSync } from "fflate";
import { setupIntegrationTest } from "../setup";
import {
  createPod,
  createRepository,
  getCanvasId,
  FAKE_UUID,
} from "../helpers";
import { emitAndWaitResponse } from "../setup";
import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
  type PodBindRepositoryPayload,
} from "../../src/schemas";
import { type PodRepositoryBoundPayload } from "../../src/types";

async function downloadPod(
  baseUrl: string,
  canvasId: string,
  podId: string,
): Promise<Response> {
  return fetch(
    `${baseUrl}/api/canvas/${canvasId}/pods/${encodeURIComponent(podId)}/download`,
  );
}

describe("GET /api/canvas/:id/pods/:podId/download", () => {
  const { getServer, getClient } = setupIntegrationTest();

  it("成功下載 Pod 的工作目錄 zip 檔案", async () => {
    const server = getServer();
    const client = getClient();
    const pod = await createPod(client, { name: `download-pod-${uuidv4()}` });

    // workspacePath 已從 WebSocket broadcast（PodPublicView）中移除，透過 podStore 取得完整 Pod
    const { podStore } = await import("../../src/services/podStore.js");
    const fullPod = podStore.getById(server.canvasId, pod.id)!;

    // 在 pod workspace 建立測試檔案
    const testFileName = "test-file.txt";
    const testFileContent = "Hello from pod workspace!";
    fs.writeFileSync(
      path.join(fullPod.workspacePath, testFileName),
      testFileContent,
    );

    const response = await downloadPod(server.baseUrl, server.canvasId, pod.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");

    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(".zip");

    const buffer = await response.arrayBuffer();
    const zipData = unzipSync(new Uint8Array(buffer));

    expect(zipData[testFileName]).toBeDefined();
    expect(new TextDecoder().decode(zipData[testFileName])).toBe(
      testFileContent,
    );
  });

  it("成功下載綁定 Repository 的 Pod 工作目錄", async () => {
    const server = getServer();
    const client = getClient();
    const canvasId = await getCanvasId(client);

    const pod = await createPod(client, { name: `repo-pod-${uuidv4()}` });
    const repo = await createRepository(client, `repo-${uuidv4()}`);

    // 綁定 Repository 到 Pod
    await emitAndWaitResponse<
      PodBindRepositoryPayload,
      PodRepositoryBoundPayload
    >(
      client,
      WebSocketRequestEvents.POD_BIND_REPOSITORY,
      WebSocketResponseEvents.POD_REPOSITORY_BOUND,
      { requestId: uuidv4(), canvasId, podId: pod.id, repositoryId: repo.id },
    );

    // 透過 repositoryService 取得 repository 路徑
    const { repositoryService } =
      await import("../../src/services/repositoryService.js");
    const repoPath = repositoryService.getRepositoryPath(repo.id);

    // 確保 repository 目錄存在
    fs.mkdirSync(repoPath, { recursive: true });

    // 在 Repository 路徑下建立測試檔案
    const testFileName = "repo-file.ts";
    const testFileContent = 'export const hello = "world";';
    fs.writeFileSync(path.join(repoPath, testFileName), testFileContent);

    const response = await downloadPod(server.baseUrl, server.canvasId, pod.id);

    expect(response.status).toBe(200);

    const buffer = await response.arrayBuffer();
    const zipData = unzipSync(new Uint8Array(buffer));

    expect(zipData[testFileName]).toBeDefined();
    expect(new TextDecoder().decode(zipData[testFileName])).toBe(
      testFileContent,
    );
  });

  it("zip 內容依照 .gitignore 排除檔案但保留 .git 目錄", async () => {
    const server = getServer();
    const client = getClient();
    const pod = await createPod(client, { name: `gitignore-pod-${uuidv4()}` });

    // workspacePath 已從 WebSocket broadcast（PodPublicView）中移除，透過 podStore 取得完整 Pod
    const { podStore } = await import("../../src/services/podStore.js");
    const fullPod = podStore.getById(server.canvasId, pod.id)!;
    const workspacePath = fullPod.workspacePath;

    // 建立 .gitignore
    fs.writeFileSync(
      path.join(workspacePath, ".gitignore"),
      "node_modules/\n*.log\n",
    );

    // 建立各種測試檔案
    fs.mkdirSync(path.join(workspacePath, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, "node_modules", "test.js"),
      "module.exports = {};",
    );
    fs.writeFileSync(path.join(workspacePath, "app.log"), "some log content");
    fs.writeFileSync(
      path.join(workspacePath, "main.ts"),
      'console.log("hello");',
    );

    // 建立 .git 目錄（應被保留）
    fs.mkdirSync(path.join(workspacePath, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, ".git", "config"),
      "[core]\n\trepositoryformatversion = 0",
    );

    const response = await downloadPod(server.baseUrl, server.canvasId, pod.id);
    expect(response.status).toBe(200);

    const buffer = await response.arrayBuffer();
    const zipData = unzipSync(new Uint8Array(buffer));

    // main.ts 應存在
    expect(zipData["main.ts"]).toBeDefined();

    // .git/config 應存在（.git 目錄跳過 ignore 規則）
    expect(zipData[".git/config"]).toBeDefined();

    // node_modules/test.js 應被排除
    expect(zipData["node_modules/test.js"]).toBeUndefined();

    // app.log 應被排除
    expect(zipData["app.log"]).toBeUndefined();
  });

  it("Pod 不存在時回傳 404", async () => {
    const server = getServer();

    const response = await downloadPod(
      server.baseUrl,
      server.canvasId,
      FAKE_UUID,
    );

    expect(response.status).toBe(404);
  });

  it("Canvas 不存在時回傳 404", async () => {
    const server = getServer();

    const response = await downloadPod(server.baseUrl, FAKE_UUID, FAKE_UUID);

    expect(response.status).toBe(404);
  });

  it("工作目錄不存在時回傳 404", async () => {
    const server = getServer();
    const client = getClient();
    const pod = await createPod(client, {
      name: `missing-workspace-pod-${uuidv4()}`,
    });

    // workspacePath 已從 WebSocket broadcast（PodPublicView）中移除，透過 podStore 取得完整 Pod
    const { podStore } = await import("../../src/services/podStore.js");
    const fullPod = podStore.getById(server.canvasId, pod.id)!;

    // 手動刪除 workspace 目錄
    fs.rmSync(fullPod.workspacePath, { recursive: true, force: true });

    const response = await downloadPod(server.baseUrl, server.canvasId, pod.id);

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("目標目錄不存在");
  });
});
