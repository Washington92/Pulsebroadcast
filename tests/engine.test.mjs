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
  const calls = { draw: 0 };
  const ctx = {
    fillRect() {}, drawImage() { calls.draw++; }, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    set fillStyle(_) {}, set globalAlpha(_) {},
  };
  const canvas = () => ({ width: 1280, height: 720, getContext: () => ctx });
  const context = {
    exports: {},
    MediaStream: class {
      constructor() { this.tracks = []; }
      addTrack(track) { this.tracks.push(track); }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks.filter(track => track.kind === "video"); }
      getAudioTracks() { return this.tracks.filter(track => track.kind === "audio"); }
    },
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
    setTimeout: () => 1,
    clearTimeout() {},
    crypto: { randomUUID: () => String(++serial) },
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          const track = { label: "Camera " + (serial + 1), stop() {}, addEventListener(type, callback) { if (type === "ended") this.onEnded = callback; } };
          tracks.push(track);
          const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
          streams.push(stream);
          return stream;
        },
      },
    },
  };
  // The production engine imports the DOM-free SceneGraph; resolve it in the VM harness.
  const sceneSource = readFileSync(new URL("../src/engine/SceneGraph.ts", import.meta.url), "utf8");
  const sceneCompiled = ts.transpileModule(sceneSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sceneContext = { exports: {} };
  vm.runInNewContext(sceneCompiled, sceneContext, { filename: "SceneGraph.js" });
  context.require = (name) => {
    if (name === "./SceneGraph") return sceneContext.exports;
    throw new Error("Unexpected import: " + name);
  };
  const source = readFileSync(new URL("../src/engine/WmixEngine.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, context, { filename: "WmixEngine.js" });
  return { engine: new context.exports.WmixEngine(), canvas, calls, tracks, advance(ms) { clock += ms; } };
}

test("CUT replaces Program and cancels an active FADE", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  const second = await engine.addCamera();
  engine.setProgram(first);

  engine.transitionTo(second, 500);
  assert.equal(engine.isTransitioning(), true);
  engine.setProgram(first);
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.isTransitioning(), false);
  engine.dispose();
});

test("Adding a camera leaves Program empty until a take", async () => {
  const { engine } = harness();
  const camera = await engine.addCamera();
  assert.equal(engine.currentProgram(), null);
  engine.setProgram(camera);
  assert.equal(engine.currentProgram(), camera);
  engine.dispose();
});

test("Preview does not change Program and is cleared independently", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
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
  engine.setProgram(first);
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
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.remove(first);
  assert.equal(engine.currentProgram(), second);
  engine.remove(second);
  assert.equal(engine.currentProgram(), null);
  engine.dispose();
});

test("FADE keeps previous full scene available and completes after 500 ms", async () => {
  const { engine, canvas, advance } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.setOverlay(second);
  engine.setPipLayout({ x: 0.6, y: 0.6, width: 0.25 });
  engine.transitionTo(second, 500);
  assert.equal(engine.currentProgram(), second);
  assert.equal(engine.isTransitioning(), true);
  advance(250);
  engine.draw();
  assert.equal(engine.isTransitioning(), true);
  advance(251);
  engine.draw();
  assert.equal(engine.isTransitioning(), false);
  engine.dispose();
});

test("FADE remains safe when previous camera is disconnected", async () => {
  const { engine, canvas, advance } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.transitionTo(second, 500);
  engine.remove(first);
  advance(300);
  assert.doesNotThrow(() => engine.draw());
  assert.equal(engine.currentProgram(), second);
  advance(300);
  engine.draw();
  assert.equal(engine.isTransitioning(), false);
  engine.dispose();
});

test("Preview and Program can render distinct camera feeds simultaneously", async () => {
  const { engine, canvas, calls } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  const third = await engine.addCamera();
  engine.setOverlay(second);
  engine.prepareScene(third, first, { x: 0.6, y: 0.6, width: 0.3 });
  engine.attachPreview(canvas());
  const before = calls.draw;
  engine.draw();
  assert.ok(calls.draw - before >= 4, "Both monitors should render base and PiP");
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.currentPreviewScene().base, third);
  engine.dispose();
});

test("Camera disconnect keeps Program and source available for recovery", async () => {
  const { engine, canvas, tracks } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  await engine.addCamera();
  tracks[0].onEnded();
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.list().length, 2);
  assert.equal(engine.list().find(source => source.id === first).offline, true);
  assert.doesNotThrow(() => tracks[0].onEnded());
  engine.dispose();
});

test("Disconnected overlay remains assigned for automatic recovery", async () => {
  const { engine, canvas, tracks } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.setOverlay(second);
  tracks[1].onEnded();
  assert.equal(engine.currentOverlay(), second);
  assert.equal(engine.currentProgram(), first);
  assert.equal(engine.list().find(source => source.id === second).offline, true);
  assert.doesNotThrow(() => engine.draw());
  engine.dispose();
});

test("SceneGraph returns isolated snapshots and preserves Program on Preview updates", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.prepareScene(second, first, { x: 0.4, y: 0.4, width: 0.2 });
  const snapshot = engine.currentPreviewScene();
  snapshot.layout.x = 0.99;
  assert.equal(engine.currentPreviewScene().layout.x, 0.4);
  assert.equal(engine.currentProgram(), first);
  engine.dispose();
});

test("SceneGraph clears removed overlay but preserves other scene references", async () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  const first = await engine.addCamera();
  engine.setProgram(first);
  const second = await engine.addCamera();
  engine.setOverlay(second);
  engine.prepareScene(first, second, { x: 0.3, y: 0.3, width: 0.2 });
  engine.remove(second);
  assert.equal(engine.currentOverlay(), null);
  assert.equal(engine.currentPreviewScene().base, first);
  assert.equal(engine.currentPreviewScene().overlay, null);
  engine.dispose();
});

test("Program capture uses the composited Canvas at configured FPS", async () => {
  const { engine } = harness();
  assert.throws(() => engine.captureProgramVideo(), /Program indisponível/);
  const captureCalls = [];
  const videoTrack = { kind: "video", stop() {} };
  const canvas = {
    width: 1280, height: 720,
    getContext: () => ({ fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, set fillStyle(_) {}, set globalAlpha(_) {} }),
    captureStream(fps) {
      captureCalls.push(fps);
      return { getVideoTracks: () => [videoTrack], getTracks: () => [videoTrack] };
    },
  };
  engine.attach(canvas);
  engine.setTargetFps(25);
  const stream = engine.captureProgramVideo();
  assert.equal(stream.getVideoTracks()[0], videoTrack);
  assert.deepEqual(captureCalls, [25]);
  engine.dispose();
});

test("Program capture rejects unsupported Canvas capture without starting output", () => {
  const { engine, canvas } = harness();
  engine.attach(canvas());
  assert.throws(() => engine.captureProgramVideo(), /não suportada/);
  engine.dispose();
});

test("Program A/V capture clones master audio without owning the mixer track", () => {
  const { engine } = harness();
  let videoStopped = 0;
  let mixerStopped = 0;
  let clonedStopped = 0;
  const videoTrack = { kind: "video", stop() { videoStopped++; } };
  const mixerTrack = {
    kind: "audio", readyState: "live", stop() { mixerStopped++; },
    clone() { return { kind: "audio", stop() { clonedStopped++; } }; },
  };
  const canvas = {
    width: 1280, height: 720,
    getContext: () => ({ fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, set fillStyle(_) {}, set globalAlpha(_) {} }),
    captureStream: () => ({ getVideoTracks: () => [videoTrack], getTracks: () => [videoTrack] }),
  };
  engine.attach(canvas);
  const media = engine.captureProgramMedia({ getAudioTracks: () => [mixerTrack] });
  assert.equal(media.getVideoTracks()[0], videoTrack);
  assert.equal(media.getAudioTracks().length, 1);
  assert.notEqual(media.getAudioTracks()[0], mixerTrack);
  media.getTracks().forEach(track => track.stop());
  assert.equal(videoStopped, 1);
  assert.equal(clonedStopped, 1);
  assert.equal(mixerStopped, 0, "Capture cleanup must never stop the mixer's shared master track");
  engine.dispose();
});
