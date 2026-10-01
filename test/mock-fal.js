"use strict";
// Minimal stand-in for fal's queue, storage and OpenAPI endpoints, shaped like
// the real responses, so the app can be tested without network access or credits.
const http = require("http");

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function openapiFor(endpointId) {
  return {
    openapi: "3.0.4",
    info: { title: "Queue OpenAPI for " + endpointId, version: "1.0.0", "x-fal-metadata": { endpointId, category: "text-to-image", playgroundUrl: "https://fal.ai/models/" + endpointId, documentationUrl: "https://fal.ai/models/" + endpointId + "/api" } },
    components: {
      securitySchemes: { apiKeyAuth: { type: "apiKey", in: "header", name: "Authorization" } },
      schemas: {
        QueueStatus: { type: "object", properties: { status: { type: "string", enum: ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"] } } },
        ImageSize: { type: "object", properties: { width: { type: "integer", default: 512, maximum: 14142, exclusiveMinimum: 0 }, height: { type: "integer", default: 512, maximum: 14142, exclusiveMinimum: 0 } }, title: "ImageSize" },
        LoraWeight: { type: "object", title: "LoraWeight", properties: { path: { type: "string", title: "Path" }, scale: { type: "number", title: "Scale", default: 1, minimum: 0, maximum: 4 } }, required: ["path"] },
        TestInput: {
          title: "TestInput",
          type: "object",
          "x-fal-order-properties": ["prompt", "image_urls", "image_size", "duration", "num_images", "seed", "loras", "guidance_scale", "enable_safety_checker", "tags"],
          properties: {
            seed: { anyOf: [{ type: "integer" }, { type: "null" }], title: "Seed", description: "Random seed" },
            prompt: { type: "string", title: "Prompt", examples: ["a cat"] },
            image_urls: { type: "array", items: { type: "string" }, title: "Image Urls", description: "Reference images", maxItems: 4 },
            image_size: { anyOf: [{ $ref: "#/components/schemas/ImageSize" }, { type: "string", enum: ["square_hd", "square", "landscape_16_9"] }], title: "Image Size", default: "landscape_16_9" },
            duration: { type: "string", enum: ["5", "10"], title: "Duration", default: "5" },
            num_images: { type: "integer", minimum: 1, maximum: 4, default: 1, title: "Num Images" },
            loras: { type: "array", items: { $ref: "#/components/schemas/LoraWeight" }, title: "Loras", default: [] },
            guidance_scale: { type: "number", minimum: 1, maximum: 20, default: 3.5, title: "Guidance scale (CFG)" },
            enable_safety_checker: { type: "boolean", default: true, title: "Enable Safety Checker" },
            tags: { type: "array", items: { type: "string" }, title: "Tags" },
          },
          required: ["prompt"],
        },
        TestOutput: { type: "object", properties: { images: { type: "array", items: { type: "object" } }, seed: { type: "integer" } } },
      },
    },
    paths: {
      [`/${endpointId}/requests/{request_id}/status`]: { get: { responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/QueueStatus" } } } } } } },
      [`/${endpointId}/requests/{request_id}/cancel`]: { put: { responses: { 200: {} } } },
      [`/${endpointId}`]: { post: { requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TestInput" } } } }, responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/QueueStatus" } } } } } } },
      [`/${endpointId}/requests/{request_id}`]: { get: { responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/TestOutput" } } } } } } },
    },
  };
}

function start(port = 0) {
  const requests = new Map();
  const files = new Map();
  const log = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, "http://x");
      const base = `http://127.0.0.1:${server.address().port}`;
      const json = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      log.push({ method: req.method, path: url.pathname, auth: req.headers.authorization, body: body.toString() });
      const authed = req.headers.authorization === "Key test-id:test-secret";

      if (url.pathname === "/openapi") return json(200, openapiFor(url.searchParams.get("endpoint_id")));
      if (url.pathname.startsWith("/storage/upload/initiate")) {
        if (!authed) return json(401, { detail: "Invalid API key" });
        const { file_name } = JSON.parse(body);
        const id = `${++n}-${file_name}`;
        return json(200, { upload_url: `${base}/put/${id}`, file_url: `${base}/files/${id}` });
      }
      if (req.method === "PUT" && url.pathname.startsWith("/put/")) {
        files.set(url.pathname.slice(5), { body, type: req.headers["content-type"] });
        res.writeHead(200);
        return res.end();
      }
      if (url.pathname.startsWith("/files/")) {
        const f = url.pathname === "/files/out.png" ? { body: PNG, type: "image/png" } : files.get(url.pathname.slice(7));
        if (!f) return json(404, { detail: "nope" });
        res.writeHead(200, { "Content-Type": f.type });
        return res.end(f.body);
      }
      if (url.pathname.startsWith("/queue/")) {
        if (!authed) return json(401, { detail: "Unauthorized" });
        const rest = url.pathname.slice(7);
        const m = /^(.+?)\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(rest);
        if (req.method === "POST" && !m) {
          const input = JSON.parse(body);
          if (!input.prompt) return json(422, { detail: [{ loc: ["body", "prompt"], msg: "field required", type: "value_error.missing" }] });
          const id = `req-${++n}`;
          const app = rest.split("/").slice(0, 2).join("/");
          requests.set(id, { polls: 0, input });
          return json(200, { request_id: id, status: "IN_QUEUE", queue_position: 0, status_url: `${base}/queue/${app}/requests/${id}/status`, response_url: `${base}/queue/${app}/requests/${id}`, cancel_url: `${base}/queue/${app}/requests/${id}/cancel` });
        }
        const r = m && requests.get(m[2]);
        if (!r) return json(404, { detail: "Request not found" });
        if (m[3] === "/status") {
          r.polls++;
          if (r.polls === 1) return json(202, { status: "IN_QUEUE", queue_position: 0 });
          if (r.polls === 2) return json(202, { status: "IN_PROGRESS", logs: [{ message: "step 1/4", timestamp: "" }] });
          return json(200, { status: "COMPLETED", logs: [{ message: "done", timestamp: "" }], metrics: { inference_time: 1.2 } });
        }
        if (m[3] === "/cancel") return json(400, { status: "ALREADY_COMPLETED" });
        const count = r.input.num_images || 1;
        return json(200, { images: Array.from({ length: count }, () => ({ url: `${base}/files/out.png`, content_type: "image/png", width: 1, height: 1 })), seed: r.input.seed ?? 42, prompt: r.input.prompt });
      }
      json(404, { detail: "unknown mock route " + url.pathname });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, log, files })));
}

module.exports = { start, openapiFor };
if (require.main === module) start(Number(process.argv[2]) || 4555).then(({ port }) => console.log(`mock fal on ${port}`));
