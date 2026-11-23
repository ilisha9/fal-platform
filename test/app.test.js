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
  // fal: with any video reference the whole request bills at $0.0128/1k (480p/720p)
  near(pricing.estimate("bytedance/seedance-2.5/reference-to-video", { duration: 5, resolution: "720p", video_urls: ["x"] }).perRequest, 108 * 0.0128);
  // Seedance 2.0 at 720p ≈ the published $0.30/s (21,600 tokens/s × $0.014/1k)
  assert.ok(Math.abs(pricing.estimate("bytedance/seedance-2.0/text-to-video", { duration: 1, resolution: "720p" }).perRequest - 0.3024) < 0.0001);
});

test("pricing: MiniMax H3 family", () => {
  near(pricing.estimate("minimax/h3-max-turbo/text-to-video", { duration: 15, resolution: "768p" }).perRequest, 0.6);
  near(pricing.estimate("minimax/h3/text-to-video", { duration: 10 }).perRequest, 1.3);
  const refs = Array.from({ length: 8 }, (_, i) => `img${i}`);
  near(pricing.estimate("minimax/h3/reference-to-video", { duration: 5, reference_image_urls: refs }).perRequest, 0.65 + 3 * 0.08);
});

test("pricing: matches fal's worked examples", () => {
  // fal: 5s 768p H3 Max Reference = $0.40 with 4 square images, $0.42048 with 5
  near(pricing.estimate("minimax/h3-max/reference-to-video", { duration: 5, resolution: "768P", reference_image_urls: ["a", "b", "c", "d"] }).perRequest, 0.4);
  near(pricing.estimate("minimax/h3-max/reference-to-video", { duration: 5, resolution: "768P", reference_image_urls: ["a", "b", "c", "d", "e"] }).perRequest, 0.42048);
  // fal: 30s lip sync at 768p = $2.88 (1.2x over 15s)
  near(pricing.estimate("minimax/h3-max/lip-sync/image-to-video", { duration: 30, resolution: "768P" }).perRequest, 2.88);
  // fal: 5s Veo 3.1 1080p with audio = $2.00; Wan 3.0 Prime 5s 720p = $0.70
  near(pricing.estimate("fal-ai/veo3.1", { duration: "5s", resolution: "1080p" }).perRequest, 2.0);
  near(pricing.estimate("alibaba/wan-3.0-prime/text-to-video", { duration: 5, resolution: "720p" }).perRequest, 0.7);
  // Seedance 2.0 at 1080p = $0.68/s; GPT Image 2.5 table
  assert.ok(Math.abs(pricing.estimate("bytedance/seedance-2.0/text-to-video", { duration: "1", resolution: "1080p" }).perRequest - 0.682) < 0.002);
  near(pricing.estimate("openai/gpt-image-2.5/sunburst/text-to-image", { quality: "medium", image_size: "landscape_4_3" }).perRequest, 0.00903);
  near(pricing.estimate("openai/gpt-image-2.5/sunburst/text-to-image", { quality: "max", image_size: { width: 1440, height: 2560 } }).perRequest, 0.2211);
  near(pricing.estimate("minimax/h3/text-to-video", { duration: 5, resolution: "768P" }).perRequest, 0.3);
  near(pricing.estimate("minimax/h3-max/3d-to-video", { duration: 5, resolution: "768P" }).perRequest, 0.9);
});

test("pricing: Gemini Omni Flash 1.2 matches fal's examples", () => {
  // fal: a 10-second 720p clip costs about $0.82, the same at 1080p about $1.23
  near(pricing.estimate("google/gemini-omni-flash/v1.2/text-to-video", { duration: 10, resolution: "720p" }).perRequest, 0.819);
  near(pricing.estimate("google/gemini-omni-flash/v1.2/reference-to-video", { duration: 10, resolution: "1080p" }).perRequest, 1.229);
  near(pricing.estimate("google/gemini-omni-flash/v1.2/image-to-video", { duration: 8 }, { defaults: { resolution: "720p" } }).perRequest, 0.6552);
  const edit = pricing.estimate("google/gemini-omni-flash/v1.2/edit", { resolution: "4k" });
  near(edit.perRequest, 0.2457 * 5);
  assert.ok(edit.assumptions.some((a) => /assumed 5s/.test(a)));
});

test("pricing: models added in November match fal's examples", () => {
  // Kling 4.0: 5s 4K = $2.745 SDR, $3.135 HDR
  near(pricing.estimate("kling/v4/text-to-video", { duration: 5, resolution: "4k" }).perRequest, 2.745);
  near(pricing.estimate("kling/v4/text-to-video", { duration: 5, resolution: "4k", hdr: true }).perRequest, 3.135);
  // FLUX 3: "1440p" uses the 2K rate ($0.32/s)
  near(pricing.estimate("blackforestlabs/flux-3/text-to-video", { duration: 10, resolution: "1440p" }).perRequest, 3.2);
  // FLUX 3 Max: 10s 720p = $1.105 during the promo, $1.70 after Dec 7
  const promo = Date.now() < Date.parse("2026-12-08T00:00:00Z");
  near(pricing.estimate("blackforestlabs/flux-3-max/text-to-video", { duration: 10, resolution: "720p" }).perRequest, promo ? 1.105 : 1.7);
  near(pricing.estimate("heygen/heygen-video/text-to-video", { duration: 10, resolution: "1080p" }).perRequest, 0.6);
  // Seedance 2.5 Flash 720p ≈ $0.3024/s
  near(pricing.estimate("bytedance/seedance-2.5/flash/text-to-video", { duration: 1, resolution: "720p" }).perRequest, 0.3024);
  // H3 Max Recast: 10s single shot ≈ $2.25 at 768p, ≈ $3.10 at 1080p
  assert.ok(Math.abs(pricing.estimate("minimax/h3-max/recast", { duration: 10, resolution: "768p" }).perRequest - 2.25) < 0.01);
  assert.ok(Math.abs(pricing.estimate("minimax/h3-max/recast", { duration: 10, resolution: "1080p" }).perRequest - 3.1) < 0.01);
  // Omni 1.2 upscale: 10s to 1080p ≈ $0.41, to 4K ≈ $1.64
  near(pricing.estimate("google/gemini-omni-flash/v1.2/upscale", { duration: 10, resolution: "1080p" }).perRequest, 0.41);
  near(pricing.estimate("google/gemini-omni-flash/v1.2/upscale", { duration: 10, resolution: "4k" }).perRequest, 1.638);
  // Images
  near(pricing.estimate("microsoft/mai-image-2.7/text-to-image", { resolution: "1K" }).perRequest, 0.034816);
  near(pricing.estimate("microsoft/mai-image-2.7/edit", { resolution: "1K", image_urls: ["a"] }).perRequest, 0.043008);
  near(pricing.estimate("kling/v4/image-to-image", { resolution: "2K", num_images: 4, image_urls: ["a"] }).perRequest, 0.255);
  near(pricing.estimate("bytedance/seedream/v5.5/edit", { image_size: "auto_2K", image_urls: ["a", "b"] }).perRequest, 0.0645);
  near(pricing.estimate("bytedance/seedream/v5.5/edit", { image_size: "square_hd", image_urls: ["a", "b"], num_images: 2 }).perRequest, 0.108);
  near(pricing.estimate("google/nano-banana-2.1", { resolution: "4K" }).perRequest, 0.134);
  near(pricing.estimate("google/nano-banana-2.1/edit", { resolution: "1K", image_urls: ["a", "b"] }).perRequest, 0.044);
  near(pricing.estimate("xai/grok-imagine-image/v2.0/edit", { resolution: "2k", quality: "low", image_urls: ["a"] }).perRequest, 0.07);
  near(pricing.estimate("krea/v3/edit", { image_size: "square_hd", image_urls: ["a"] }).perRequest, 0.05);
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
  assert.deepStrictEqual(missing, []);
});

test("live pricing route proxies fal's pricing API", async () => {
  const r = await call("/api/pricing?id=fal-ai/test/model");
  assert.deepStrictEqual(r.body.live, { unit_price: 0.025, unit: "image", currency: "USD" });
});

test("every built-in model has sidebar metadata (npm run update-meta)", () => {
  const meta = require("../lib/model-meta.json");
  const missing = MODELS.filter((m) => !meta[m.id]).map((m) => m.id);
  assert.deepStrictEqual(missing, []);
  for (const m of MODELS) assert.ok(typeof meta[m.id].priceFrom === "number", `${m.id} has no price`);
});

test("models API includes metadata for filters", async () => {
  const r = await call("/api/models");
  const wan = r.body.models.find((m) => m.id === "alibaba/wan-3.0/text-to-video");
  assert.strictEqual(wan.priceUnit, "s");
  assert.strictEqual(wan.priceFrom, 0.05);
  assert.strictEqual(wan.audio, true);
});

test("prompt guides: every model has a guide; examples use the model's tag style and limits", () => {
  const guides = require("../public/guides");
  const meta = require("../lib/model-meta.json");
  for (const m of MODELS) {
    const g = guides.guideFor(m.id);
    assert.ok(g, `${m.id} has no guide`);
    const ex = guides.exampleFor(m.id, m.category);
    if (!ex) continue;
    if (/^bytedance\/seedance|^kling\/v4\/reference/.test(m.id)) assert.ok(!/\b(Image|Video) \d/.test(ex.prompt), `${m.id} should use @Image1 tags`);
    if (/^(minimax\/h3|alibaba\/wan).*reference/.test(m.id)) assert.ok(!/@Image/.test(ex.prompt), `${m.id} should use "Image 1" tags`);
    if (/^heygen\/.*reference/.test(m.id)) assert.ok(/<Picture 1>/.test(ex.prompt));
    const d = ex.settings && ex.settings.duration;
    if (d && meta[m.id].maxDuration) assert.ok(d <= meta[m.id].maxDuration, `${m.id} example duration ${d} > ${meta[m.id].maxDuration}`);
  }
});
