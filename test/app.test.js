"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mock = require("./mock-fal");
const { extractEndpointSchemas } = require("../lib/openapi");
const pricing = require("../public/pricing");
const { MODELS } = require("../lib/models");

let fal, app, base, dataDir;

before(async () => {
  fal = await mock.start();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fal-studio-"));
  const port = 3900 + Math.floor(Math.random() * 90);
  const m = `http://127.0.0.1:${fal.port}`;
  app = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), FAL_KEY: "", FAL_STUDIO_DATA: dataDir, FAL_QUEUE_URL: `${m}/queue`, FAL_REST_URL: m, FAL_OPENAPI_URL: `${m}/openapi?endpoint_id=`, FAL_PLATFORM_URL: `${m}/platform` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => app.stdout.on("data", (d) => /running at/.test(d) && resolve()));
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  app && app.kill();
  fal && fal.server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const call = async (p, opts = {}) => {
  const res = await fetch(base + p, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  return { status: res.status, body: await res.json() };
};

test("openapi extraction resolves refs, nullable seed and ordering", () => {
  const s = extractEndpointSchemas(mock.openapiFor("fal-ai/test/model"), "fal-ai/test/model");
  assert.deepStrictEqual(s.input.required, ["prompt"]);
  assert.strictEqual(s.input.properties.image_size.anyOf[0].properties.width.type, "integer");
  assert.strictEqual(s.input.properties.loras.items.properties.scale.maximum, 4);
  assert.ok(s.output.properties.images);
  assert.strictEqual(s.info.playgroundUrl, "https://fal.ai/models/fal-ai/test/model");
});

test("requires an API key before submitting", async () => {
  const r = await call("/api/generate", { method: "POST", body: JSON.stringify({ endpointId: "fal-ai/test/model", inputs: [{ prompt: "x" }] }) });
  assert.strictEqual(r.status, 401);
  assert.match(r.body.error, /API key/);
});

test("saves settings without exposing the key", async () => {
  const r = await call("/api/config", { method: "POST", body: JSON.stringify({ apiKey: "test-id:test-secret" }) });
  assert.strictEqual(r.body.hasKey, true);
  assert.ok(!JSON.stringify(r.body).includes("test-secret"));
  assert.strictEqual((await call("/api/config/test", { method: "POST" })).status, 200);
});

test("blocks cross-origin writes", async () => {
  const r = await call("/api/config", { method: "POST", headers: { Origin: "http://evil.example" }, body: "{}" });
  assert.strictEqual(r.status, 403);
});

test("loads live schema", async () => {
  const r = await call("/api/schema?id=fal-ai/test/model");
  assert.strictEqual(r.body.source, "live");
  assert.ok(r.body.input.properties.prompt);
});

test("uploads a reference file to storage", async () => {
  const res = await fetch(base + "/api/upload", { method: "POST", headers: { "Content-Type": "image/png", "X-File-Name": "ref.png" }, body: Buffer.from("hello") });
  const body = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(body));
  assert.match(body.url, /\/files\/\d+-ref\.png$/);
  assert.strictEqual(fal.files.get(body.url.split("/files/")[1]).body.toString(), "hello");
  assert.strictEqual((await call("/api/uploads")).body[0].fileName, "ref.png");
});

test("surfaces fal validation errors", async () => {
  const r = await call("/api/generate", { method: "POST", body: JSON.stringify({ endpointId: "fal-ai/test/model", inputs: [{ seed: 1 }] }) });
  assert.strictEqual(r.status, 422);
  assert.match(r.body.error, /prompt: field required/);
});

test("batch generation runs to completion and saves outputs", async () => {
  const inputs = [{ prompt: "a", seed: 1, num_images: 2 }, { prompt: "a", seed: 2 }];
  const r = await call("/api/generate", { method: "POST", body: JSON.stringify({ endpointId: "fal-ai/test/model/sub", inputs }) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.jobs.length, 2);
  const submit = fal.log.find((l) => l.method === "POST" && l.path === "/queue/fal-ai/test/model/sub");
  assert.strictEqual(submit.auth, "Key test-id:test-secret");
  for (const job of r.body.jobs) {
    let j;
    for (let i = 0; i < 10; i++) {
      j = (await call(`/api/job?id=${job.id}`)).body;
      if (j.status === "COMPLETED" || j.status === "FAILED") break;
    }
    assert.strictEqual(j.status, "COMPLETED", JSON.stringify(j));
    assert.ok(j.outputs.length >= 1);
    assert.strictEqual(j.outputs[0].kind, "image");
    const file = await fetch(base + j.outputs[0].local);
    assert.strictEqual(file.headers.get("content-type"), "image/png");
    assert.ok(!("statusUrl" in j));
  }
  // status polled at the app-level path (owner/alias), not the full sub path
  assert.ok(fal.log.some((l) => /^\/queue\/fal-ai\/test\/requests\/req-\d+\/status$/.test(l.path)));
});

test("rejects path traversal", async () => {
  const res = await fetch(base + "/outputs/..%2F..%2Fserver.js");
  assert.notStrictEqual(res.status, 200);
});

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("pricing: per-second by resolution and audio", () => {
  near(pricing.estimate("minimax/h3-max/text-to-video", { duration: 10, resolution: "1080p" }).perRequest, 1.6);
  near(pricing.estimate("google/gemini-omni-flash/v1.1/text-to-video", { duration: "8" }, { defaults: { resolution: "720p" } }).perRequest, 0.8);
  near(pricing.estimate("fal-ai/veo3.1", { duration: "8s", generate_audio: false }).perRequest, 1.6);
  near(pricing.estimate("fal-ai/veo3.1", { duration: "8s", resolution: "4k" }).perRequest, 4.8);
  near(pricing.estimate("fal-ai/kling-video/v3/pro/text-to-video", { duration: "5", generate_audio: true }).perRequest, 0.84);
});

test("pricing: Seedance token formula and video-reference discount", () => {
  // 1280x720 x 5s x 24 / 1024 = 108,000 tokens x $0.0214/1k
  near(pricing.estimate("bytedance/seedance-2.5/text-to-video", { duration: 5, resolution: "720p", aspect_ratio: "16:9" }).perRequest, 2.3112);
  near(pricing.estimate("bytedance/seedance-2.5/reference-to-video", { duration: 5, resolution: "720p", reference_video_urls: ["x"] }).perRequest, 2.3112 * 0.6);
  // Seedance 2.0 at 720p matches the published $0.3034/s
  assert.ok(Math.abs(pricing.estimate("bytedance/seedance-2.0/text-to-video", { duration: 1, resolution: "720p" }).perRequest - 0.3034) < 0.001);
});

test("pricing: MiniMax H3 family", () => {
  near(pricing.estimate("minimax/h3-max-turbo/text-to-video", { duration: 15, resolution: "768p" }).perRequest, 0.6);
  near(pricing.estimate("minimax/h3/text-to-video", { duration: 10 }).perRequest, 1.3);
  const refs = Array.from({ length: 8 }, (_, i) => `img${i}`);
  near(pricing.estimate("minimax/h3/reference-to-video", { duration: 5, reference_image_urls: refs }).perRequest, 0.65 + 3 * 0.08);
});

test("pricing: images", () => {
  near(pricing.estimate("fal-ai/nano-banana-2", { num_images: 2, resolution: "4K" }).perRequest, 0.32);
  near(pricing.estimate("fal-ai/nano-banana-pro", { resolution: "1K", enable_web_search: true }).perRequest, 0.165);
  near(pricing.estimate("fal-ai/flux-2-pro", { image_size: { width: 1920, height: 1080 } }).perRequest, 0.045);
  near(pricing.estimate("openai/gpt-image-2.5/flare/text-to-image", { quality: "max", image_size: "1024x1024" }).perRequest, 0.21072);
});

test("pricing: falls back to live unit price, null when unknown", () => {
  near(pricing.estimate("some/new/model", { num_images: 3 }, { live: { unit_price: 0.02, unit: "image" } }).perRequest, 0.06);
  near(pricing.estimate("some/video", { duration: 6 }, { live: { unit_price: 0.1, unit: "second" } }).perRequest, 0.6);
  assert.strictEqual(pricing.estimate("some/new/model", {}), null);
});

test("every built-in video/image model has a price rule or is flagged for live pricing", () => {
  const missing = MODELS.filter((m) => !pricing.hasRule(m.id)).map((m) => m.id);
  assert.deepStrictEqual(missing, [
    "minimax/h3/text-to-video/lora",
    "minimax/h3-max/multi-angle/image-to-video",
    "minimax/h3-max/lip-sync/image-to-video",
    "minimax/h3-max/3d-to-video",
    "xai/grok-imagine-image",
  ]);
});

test("live pricing route proxies fal's pricing API", async () => {
  const r = await call("/api/pricing?id=fal-ai/test/model");
  assert.deepStrictEqual(r.body.live, { unit_price: 0.025, unit: "image", currency: "USD" });
});
