/**
 * wMix Camera LAN bridge — experimental transport for integration smoke tests.
 * JPEG snapshots only, NOT production video transport, WebRTC or 1080p/60.
 * Run with WMIX_CAMERA_TOKEN=<random-long-secret> node tools/wmix-camera-bridge.mjs
 * HTTP traffic is unencrypted: use only on a trusted isolated LAN.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.WMIX_CAMERA_PORT || 8787);
const token = process.env.WMIX_CAMERA_TOKEN || "";
if (token.length < 20) {
  console.error("Set WMIX_CAMERA_TOKEN to a random value of at least 20 characters.");
  process.exit(1);
}
const cameras = new Map();
const originAllowed = origin => !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === "tauri://localhost" || origin === "http://tauri.localhost";

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(data);
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin)) return false;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}
function authorized(req) {
  const actual = req.headers.authorization || "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function identity(url) {
  const id = url.searchParams.get("id") || "cam-01";
  return /^[a-zA-Z0-9_-]{1,40}$/.test(id) ? id : null;
}
function state(id) {
  if (!cameras.has(id)) cameras.set(id, { jpg: null, frames: 0, lastAt: 0, tally: "STANDBY" });
  return cameras.get(id);
}
const server = createServer(async (req, res) => {
  if (!cors(req, res)) return send(res, 403, "Forbidden");
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (!authorized(req)) return send(res, 401, "Unauthorized");
  const url = new URL(req.url || "/", "http://localhost");
  const id = identity(url);
  if (!id) return send(res, 400, "Invalid camera ID");
  const camera = state(id);
  if (req.method === "POST" && url.pathname === "/api/frame") {
    if (req.headers["content-type"]?.split(";")[0] !== "image/jpeg") return send(res, 415, "JPEG required");
    let length = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1_000_000) return send(res, 413, "Frame too large");
        chunks.push(chunk);
      }
      const jpg = Buffer.concat(chunks);
      if (jpg.length < 4 || jpg[0] !== 0xff || jpg[1] !== 0xd8 || jpg.at(-2) !== 0xff || jpg.at(-1) !== 0xd9)
        return send(res, 400, "Malformed JPEG");
      camera.jpg = jpg;
      camera.frames++;
      camera.lastAt = Date.now();
      return send(res, 204, "");
    } catch { return send(res, 400, "Invalid request"); }
  }
  if (req.method === "GET" && url.pathname === "/api/frame") {
    if (!camera.jpg || Date.now() - camera.lastAt > 4000) return send(res, 404, "Camera offline");
    return send(res, 200, camera.jpg, { "Content-Type": "image/jpeg" });
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    return send(res, 200, JSON.stringify({
      cameraId: id, online: camera.lastAt > 0 && Date.now() - camera.lastAt < 4000,
      frames: camera.frames, tally: camera.tally, lastFrameAgeMs: camera.lastAt ? Date.now() - camera.lastAt : null
    }), { "Content-Type": "application/json" });
  }
  if (req.method === "POST" && url.pathname === "/api/tally") {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 256) return send(res, 413, "Too large");
    }
    let tally;
    try { tally = JSON.parse(body).state; } catch { return send(res, 400, "Invalid JSON"); }
    if (!["PROGRAM", "PREVIEW", "STANDBY"].includes(tally)) return send(res, 400, "Invalid state");
    camera.tally = tally;
    return send(res, 204, "");
  }
  return send(res, 404, "Not found");
});
server.requestTimeout = 8000;
server.listen(port, "0.0.0.0", () => console.log(`wMix Camera LAN bridge listening on port ${port}. Protect this port on your firewall.`));
