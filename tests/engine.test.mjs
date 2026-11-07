import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness() {
  let clock = 0;
  let serial = 0;
  const tracks = [];
  const streams = [];
  const ctx = {
    fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    set fillStyle(_) {}, set globalAlpha(_) {},
  };
  const canvas = () => ({ width: 1280, height: 720, getContext: () => ctx });
  const context = {
    exports: {},
    document: {
      createElement(type) {
        if (type === "canvas") return canvas();
        if (type === "video") return {
          readyState: 3, videoWidth: 1280, videoHeight: 720,
          play: () => Promise.resolve(), pause() {}, set srcObject(_) {},
        };
        throw new Error(type);
      },
    },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    performance: { now: () => clock },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    crypto: { randomUUID: () => String(++serial) },
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          const track = { label: "Camera " + (serial + 1), stop() {}, addEventListener() {} };
          tracks.push(track);
          const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
          streams.push(stream);
          return stream;
        },
      },
    },
  };
  const source = readFileSync(new URL("../src/engine/WmixEngine.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, context, { filename: "WmixEngine.js" });
  return { engine: new context.exports.WmixEngine(), canvas, advance(ms) { clock += ms; } };
}

test("CUT replaces Program and cancels an active FADE", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  const second = await engine.addCamera();
  assert.equal(engine.currentProgram(), first);
  engine.transitionTo(second, 500);
  assert.equal(engine.isTransitioning(), true);
  engine.setProgram(first);
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.isTransitioning(), false);
  engine.dispose();
});

test("Preview does not change Program and is cleared independently", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  const second = await engine.addCamera();
  engine.prepareScene(second, null, { x: 0.5, y: 0.5, width: 0.3 });
  engine.attachPreview(canvas());
  assert.equal(engine.currentPreviewScene().base, second);
  assert.equal(engine.currentProgram(), first);
  engine.clearPreview();
  assert.equal(engine.currentPreviewScene(), null);
  engine.dispose();
});

test("Disconnected Preview source is cleared without disturbing Program", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  const second = await engine.addCamera();
  engine.prepareScene(second, second, { x: 0.5, y: 0.5, width: 0.3 });
  engine.remove(second);
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.currentPreviewScene().base, null);
  assert.equal(engine.currentPreviewScene().overlay, null);
  engine.dispose();
});

test("Removing Program selects a remaining source", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  const second = await engine.addCamera();
  engine.remove(first);
  assert.equal(engine.currentProgram(), second);
  engine.remove(second);
  assert.equal(engine.currentProgram(), null);
  engine.dispose();
});
