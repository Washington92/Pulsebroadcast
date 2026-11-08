import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness() {
  const sockets = [];
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    emit(op, d) { return this.onmessage?.({ data: JSON.stringify({ op, d }) }); }
  }
  const source = readFileSync(new URL("../src/integrations/obs/ObsWebSocketClient.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, WebSocket: FakeWebSocket, URL, TextEncoder, setTimeout, clearTimeout, crypto: globalThis.crypto, btoa };
  vm.runInNewContext(compiled, context, { filename: "ObsWebSocketClient.js" });
  return { client: new context.exports.ObsWebSocketClient(), sockets };
}

test("OBS handshake and Preview/Program snapshot", async () => {
  const { client, sockets } = harness();
  const connection = client.connect("ws://127.0.0.1:4455");
  const socket = sockets[0];
  await socket.emit(0, { rpcVersion: 1 });
  assert.equal(socket.sent[0].op, 1);
  assert.ok(socket.sent[0].d.eventSubscriptions & (1 << 2));
  assert.ok(socket.sent[0].d.eventSubscriptions & (1 << 10));
  await socket.emit(2, { negotiatedRpcVersion: 1 });
  await connection;
  const refreshing = client.refresh();
  const first = socket.sent.find(x => x.d?.requestType === "GetStudioModeEnabled");
  const second = socket.sent.find(x => x.d?.requestType === "GetCurrentProgramScene");
  await socket.emit(7, { requestId: first.d.requestId, requestStatus: { result: true }, responseData: { studioModeEnabled: true } });
  await socket.emit(7, { requestId: second.d.requestId, requestStatus: { result: true }, responseData: { currentProgramSceneName: "Live" } });
  await Promise.resolve();
  const preview = socket.sent.find(x => x.d?.requestType === "GetCurrentPreviewScene");
  assert.ok(preview);
  await socket.emit(7, { requestId: preview.d.requestId, requestStatus: { result: true }, responseData: { currentPreviewSceneName: "Next" } });
  assert.equal((await refreshing).programScene, "Live");
  assert.equal(client.snapshot().previewScene, "Next");
  await socket.emit(5, { eventType: "CurrentProgramSceneChanged", eventData: { sceneName: "New Live" } });
  assert.equal(client.snapshot().programScene, "New Live");
  client.disconnect();
  assert.equal(client.snapshot().connected, false);
});

test("OBS rejects URL credentials and rejects outstanding requests on disconnect", async () => {
  const { client, sockets } = harness();
  await assert.rejects(client.connect("ws://user:password@127.0.0.1:4455"));
  const connection = client.connect("ws://127.0.0.1:4455");
  const socket = sockets.at(-1);
  await socket.emit(0, { rpcVersion: 1 });
  await socket.emit(2, { negotiatedRpcVersion: 1 });
  await connection;
  const request = client.request("GetCurrentProgramScene");
  client.disconnect();
  await assert.rejects(request, /disconnected/);
});
