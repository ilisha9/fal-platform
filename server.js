#!/usr/bin/env node
// fal Studio — local web app for running fal.ai models.
// Zero dependencies: requires Node.js 18+ (built-in fetch).
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { MODELS, CATEGORIES, fallbackSchemaFor } = require("./lib/models");
const { extractEndpointSchemas } = require("./lib/openapi");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.resolve(ROOT, process.env.FAL_STUDIO_DATA || "data");
const CACHE_DIR = path.join(DATA_DIR, "schema-cache");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const UPLOADS_FILE = path.join(DATA_DIR, "uploads.json");

loadDotEnv(path.join(ROOT, ".env"));

// Overridable only so the test suite can point at a mock fal server.
const QUEUE_BASE = process.env.FAL_QUEUE_URL || "https://queue.fal.run";
const REST_BASE = process.env.FAL_REST_URL || "https://rest.fal.ai";
const OPENAPI_URL = process.env.FAL_OPENAPI_URL || "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=";
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB
const MULTIPART_THRESHOLD = 90 * 1024 * 1024; // same threshold as the official client
const MULTIPART_CHUNK = 10 * 1024 * 1024;
const SCHEMA_TTL_MS = 24 * 60 * 60 * 1000;

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------------------------------------------------- config

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let value = m[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

let config = Object.assign(
  { apiKey: "", autoDownload: true, outputDir: "outputs", customModels: [] },
  readJson(CONFIG_FILE, {})
);

function apiKey() {
  return config.apiKey || process.env.FAL_KEY || process.env.FAL_API_KEY || "";
}

function outputDir() {
  return path.resolve(ROOT, config.outputDir || "outputs");
}

function maskKey(key) {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

// ---------------------------------------------------------------- history

let history = readJson(HISTORY_FILE, []);
let uploads = readJson(UPLOADS_FILE, []);
let historySaveTimer = null;

function saveHistory() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    writeJson(HISTORY_FILE, history.slice(0, 2000)).catch((e) =>
      console.error("Failed to save history:", e.message)
    );
  }, 200);
}

function findJob(id) {
  return history.find((j) => j.id === id);
}

// ---------------------------------------------------------------- fal API

class FalError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function describeFalError(status, body) {
  if (body && typeof body === "object") {
    const detail = body.detail ?? body.error ?? body.message;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
          return loc ? `${loc}: ${d.msg}` : d.msg || JSON.stringify(d);
        })
        .join("; ");
    }
    if (detail) return typeof detail === "string" ? detail : JSON.stringify(detail);
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 500);
  return `HTTP ${status}`;
}

async function falFetch(url, { method = "GET", body, headers = {}, auth = true } = {}) {
  const key = apiKey();
  if (auth && !key) throw new FalError("No fal API key configured. Open Settings and add your key.", 401);
  const res = await fetch(url, {
    method,
    headers: {
      ...(auth ? { Authorization: `Key ${key}` } : {}),
      ...(body !== undefined && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  if (!res.ok) throw new FalError(describeFalError(res.status, data), res.status, data);
  return data;
}

// Split "owner/alias/sub/path" into the app part used for queue status URLs.
function queueAppPath(endpointId) {
  const parts = endpointId.split("/");
  const n = ["workflows", "comfy"].includes(parts[0]) ? 3 : 2;
  return parts.slice(0, n).join("/");
}

function validEndpointId(id) {
  return typeof id === "string" && /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(id);
}

// ---------------------------------------------------------------- schemas

async function getSchema(endpointId) {
  const cacheFile = path.join(CACHE_DIR, `${endpointId.replace(/[^A-Za-z0-9._-]/g, "__")}.json`);
  const cached = readJson(cacheFile, null);
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL_MS) {
    return { ...cached.schemas, source: "cache" };
  }
  try {
    const res = await fetch(OPENAPI_URL + encodeURIComponent(endpointId), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    const schemas = extractEndpointSchemas(doc, endpointId);
    if (!schemas.input) throw new Error("input schema not found in OpenAPI document");
    await writeJson(cacheFile, { fetchedAt: Date.now(), schemas });
    return { ...schemas, source: "live" };
  } catch (err) {
    if (cached) return { ...cached.schemas, source: "cache", warning: `Using cached schema (${err.message})` };
    const model = allModels().find((m) => m.id === endpointId);
    return {
      input: fallbackSchemaFor(model ? model.category : guessCategory(endpointId)),
      output: null,
      source: "fallback",
      warning: `Could not load the live schema for ${endpointId} (${err.message}). Showing a generic form — use "Extra JSON" for model-specific fields.`,
    };
  }
}

function guessCategory(id) {
  if (/image-to-video|i2v/.test(id)) return "image-to-video";
  if (/video/.test(id)) return "text-to-video";
  if (/edit|kontext|image-to-image/.test(id)) return "image-to-image";
  return "text-to-image";
}

function allModels() {
  return [...MODELS, ...(config.customModels || []).map((m) => ({ ...m, custom: true }))];
}

// ---------------------------------------------------------------- uploads

async function uploadToFal(buffer, fileName, contentType) {
  const initiate = async (kind) =>
    falFetch(`${REST_BASE}/storage/upload/${kind}?storage_type=fal-cdn-v3`, {
      method: "POST",
      body: { content_type: contentType, file_name: fileName },
    });

  if (buffer.length <= MULTIPART_THRESHOLD) {
    const { upload_url, file_url } = await initiate("initiate");
    const res = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: buffer,
    });
    if (!res.ok) throw new FalError(`Upload failed: HTTP ${res.status} ${await res.text()}`, res.status);
    return file_url;
  }

  const { upload_url, file_url } = await initiate("initiate-multipart");
  const u = new URL(upload_url);
  const parts = [];
  for (let i = 0, part = 1; i < buffer.length; i += MULTIPART_CHUNK, part++) {
    const chunk = buffer.subarray(i, i + MULTIPART_CHUNK);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${u.origin}${u.pathname}/${part}${u.search}`, { method: "PUT", body: chunk });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        parts.push({ partNumber: data.partNumber, etag: data.etag });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw new FalError(`Multipart upload failed on part ${part}: ${lastErr.message}`, 502);
  }
  const res = await fetch(`${u.origin}${u.pathname}/complete${u.search}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
  });
  if (!res.ok) throw new FalError(`Completing multipart upload failed: HTTP ${res.status}`, res.status);
  return file_url;
}

// ---------------------------------------------------------------- jobs

const MEDIA_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "model/gltf-binary": "glb",
};

// Find every downloadable file object ({url, content_type?, file_name?}) in a result.
function collectFiles(value, out = [], trail = "") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectFiles(v, out, `${trail}[${i}]`));
  } else if (value && typeof value === "object") {
    if (typeof value.url === "string" && /^https?:\/\//.test(value.url)) {
      out.push({ ...value, field: trail.replace(/^\./, "") });
    } else {
      for (const [k, v] of Object.entries(value)) collectFiles(v, out, `${trail}.${k}`);
    }
  }
  return out;
}

function mediaKind(file) {
  const ct = file.content_type || "";
  const ext = (file.file_name || new URL(file.url).pathname).split(".").pop().toLowerCase();
  if (ct.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (ct.startsWith("video/") || ["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
  if (ct.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  if (["glb", "gltf", "obj", "ply"].includes(ext)) return "3d";
  return "file";
}

async function downloadOutputs(job) {
  const files = collectFiles(job.result);
  const day = new Date(job.createdAt).toISOString().slice(0, 10);
  const dir = path.join(outputDir(), day);
  await fsp.mkdir(dir, { recursive: true });
  const slug = job.endpointId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const saved = [];
  for (const [i, f] of files.entries()) {
    const entry = { url: f.url, field: f.field, kind: mediaKind(f), content_type: f.content_type, width: f.width, height: f.height };
    if (config.autoDownload) {
      try {
        let ext = MEDIA_EXT[f.content_type] || path.extname(f.file_name || new URL(f.url).pathname).slice(1) || "bin";
        const name = `${slug}_${job.id.slice(0, 8)}_${i + 1}.${ext}`;
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fsp.writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
        entry.local = `/outputs/${day}/${name}`;
        entry.localPath = path.join(dir, name);
      } catch (e) {
        entry.downloadError = e.message;
      }
    }
    saved.push(entry);
  }
  return saved;
}

const finishing = new Map();

async function refreshJob(job) {
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
  if (finishing.has(job.id)) return finishing.get(job.id).then(() => job);

  let status;
  try {
    status = await falFetch(`${job.statusUrl}${job.statusUrl.includes("?") ? "&" : "?"}logs=1`);
  } catch (e) {
    if (e.status === 404 || e.status === 410) {
      job.status = "FAILED";
      job.error = `Request no longer available on fal (${e.message})`;
      saveHistory();
    } else {
      job.lastPollError = e.message;
    }
    return job;
  }
  job.lastPollError = undefined;
  job.queuePosition = status.queue_position;
  if (Array.isArray(status.logs)) job.logs = status.logs.slice(-200).map((l) => l.message);
  if (status.metrics) job.metrics = status.metrics;

  if (status.status !== "COMPLETED") {
    job.status = status.status || job.status;
    return job;
  }

  const work = (async () => {
    try {
      job.result = await falFetch(job.responseUrl);
      job.status = "DOWNLOADING";
      job.outputs = await downloadOutputs(job);
      job.status = "COMPLETED";
    } catch (e) {
      job.status = "FAILED";
      job.error = e.message;
      job.errorBody = e.body;
    }
    job.completedAt = Date.now();
    saveHistory();
  })();
  finishing.set(job.id, work);
  try {
    await work;
  } finally {
    finishing.delete(job.id);
  }
  return job;
}

// Keep in-flight jobs moving even when no browser tab is polling.
setInterval(() => {
  for (const job of history) {
    if (["IN_QUEUE", "IN_PROGRESS", "SUBMITTED"].includes(job.status)) {
      refreshJob(job).catch(() => {});
    }
  }
}, 5000).unref();

async function submitJob({ endpointId, input, batchIndex, batchId }) {
  const sub = await falFetch(`${QUEUE_BASE}/${endpointId}`, { method: "POST", body: input });
  const app = queueAppPath(endpointId);
  const job = {
    id: crypto.randomUUID(),
    requestId: sub.request_id,
    endpointId,
    input,
    batchId,
    batchIndex,
    status: "IN_QUEUE",
    queuePosition: sub.queue_position,
    statusUrl: sub.status_url || `${QUEUE_BASE}/${app}/requests/${sub.request_id}/status`,
    responseUrl: sub.response_url || `${QUEUE_BASE}/${app}/requests/${sub.request_id}`,
    cancelUrl: sub.cancel_url || `${QUEUE_BASE}/${app}/requests/${sub.request_id}/cancel`,
    createdAt: Date.now(),
    logs: [],
  };
  history.unshift(job);
  saveHistory();
  return job;
}

function publicJob(job) {
  const { errorBody, statusUrl, responseUrl, cancelUrl, ...rest } = job;
  return { ...rest, outputs: (job.outputs || []).map(({ localPath, ...o }) => o), errorDetail: errorBody };
}

// ---------------------------------------------------------------- HTTP

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new FalError(`Request too large (max ${Math.round(limit / 1048576)} MB)`, 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req, 20 * 1024 * 1024);
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    throw new FalError("Invalid JSON body", 400);
  }
}

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};

async function serveFile(req, res, baseDir, relPath) {
  const filePath = path.resolve(baseDir, "." + path.posix.normalize("/" + decodeURIComponent(relPath)));
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) return send(res, 403, { error: "Forbidden" });
  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (stat.isDirectory()) return serveFile(req, res, baseDir, path.posix.join(relPath, "index.html"));
  } catch {
    return send(res, 404, { error: "Not found" });
  }
  const type = STATIC_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && stat.size > 0) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": baseDir === PUBLIC_DIR ? "no-cache" : "max-age=3600",
  });
  fs.createReadStream(filePath).pipe(res);
}

const routes = {
  "GET /api/config": async () => ({
    hasKey: Boolean(apiKey()),
    keySource: config.apiKey ? "settings" : process.env.FAL_KEY || process.env.FAL_API_KEY ? "environment" : null,
    keyPreview: maskKey(apiKey()),
    autoDownload: config.autoDownload,
    outputDir: outputDir(),
  }),

  "POST /api/config": async (req) => {
    const body = await readJsonBody(req);
    if (typeof body.apiKey === "string") config.apiKey = body.apiKey.trim();
    if (typeof body.autoDownload === "boolean") config.autoDownload = body.autoDownload;
    if (typeof body.outputDir === "string" && body.outputDir.trim()) config.outputDir = body.outputDir.trim();
    await writeJson(CONFIG_FILE, config);
    return routes["GET /api/config"]();
  },

  "POST /api/config/test": async () => {
    // Uploading needs a valid key but costs nothing; initiate an upload of a tiny file.
    await falFetch(`${REST_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      method: "POST",
      body: { content_type: "text/plain", file_name: "key-check.txt" },
    });
    return { ok: true };
  },

  "GET /api/models": async () => ({ categories: CATEGORIES, models: allModels() }),

  "POST /api/models": async (req) => {
    const body = await readJsonBody(req);
    if (!validEndpointId(body.id)) throw new FalError("Invalid endpoint id (expected e.g. fal-ai/flux/dev)", 400);
    config.customModels = (config.customModels || []).filter((m) => m.id !== body.id);
    config.customModels.push({
      id: body.id,
      name: String(body.name || body.id).slice(0, 80),
      category: CATEGORIES.some((c) => c.id === body.category) ? body.category : guessCategory(body.id),
      description: String(body.description || "Custom endpoint").slice(0, 200),
    });
    await writeJson(CONFIG_FILE, config);
    return { models: allModels() };
  },

  "DELETE /api/models": async (req, url) => {
    const id = url.searchParams.get("id");
    config.customModels = (config.customModels || []).filter((m) => m.id !== id);
    await writeJson(CONFIG_FILE, config);
    return { models: allModels() };
  },

  "GET /api/schema": async (req, url) => {
    const id = url.searchParams.get("id");
    if (!validEndpointId(id)) throw new FalError("Invalid endpoint id", 400);
    if (url.searchParams.get("refresh")) {
      await fsp.rm(path.join(CACHE_DIR, `${id.replace(/[^A-Za-z0-9._-]/g, "__")}.json`), { force: true });
    }
    return getSchema(id);
  },

  "POST /api/upload": async (req) => {
    const fileName = decodeURIComponent(req.headers["x-file-name"] || `upload-${Date.now()}`).replace(/[\\/]/g, "_");
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const buffer = await readBody(req, MAX_UPLOAD_BYTES);
    if (!buffer.length) throw new FalError("Empty file", 400);
    const url = await uploadToFal(buffer, fileName, contentType);
    const entry = { url, fileName, contentType, size: buffer.length, uploadedAt: Date.now() };
    uploads = [entry, ...uploads.filter((u) => u.url !== url)].slice(0, 200);
    writeJson(UPLOADS_FILE, uploads).catch(() => {});
    return entry;
  },

  "GET /api/uploads": async () => uploads,

  "DELETE /api/uploads": async (req, url) => {
    const target = url.searchParams.get("url");
    uploads = target ? uploads.filter((u) => u.url !== target) : [];
    await writeJson(UPLOADS_FILE, uploads);
    return uploads;
  },

  "POST /api/generate": async (req) => {
    const { endpointId, inputs } = await readJsonBody(req);
    if (!validEndpointId(endpointId)) throw new FalError("Invalid endpoint id", 400);
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 50) {
      throw new FalError("Provide between 1 and 50 inputs", 400);
    }
    const batchId = inputs.length > 1 ? crypto.randomUUID() : undefined;
    const jobs = [];
    const errors = [];
    // Submit sequentially so a bad key/input fails fast instead of N times.
    for (const [i, input] of inputs.entries()) {
      try {
        jobs.push(await submitJob({ endpointId, input, batchIndex: inputs.length > 1 ? i + 1 : undefined, batchId }));
      } catch (e) {
        errors.push(e);
        if (e.status && e.status < 500) break;
      }
    }
    if (!jobs.length) throw errors[0] || new FalError("Submission failed", 502);
    return { jobs: jobs.map(publicJob), errors: errors.map((e) => e.message) };
  },

  "GET /api/jobs": async (req, url) => {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 2000);
    return history.slice(0, limit).map(publicJob);
  },

  "GET /api/job": async (req, url) => {
    const job = findJob(url.searchParams.get("id"));
    if (!job) throw new FalError("Job not found", 404);
    await refreshJob(job);
    return publicJob(job);
  },

  "POST /api/job/cancel": async (req, url) => {
    const job = findJob(url.searchParams.get("id"));
    if (!job) throw new FalError("Job not found", 404);
    if (["IN_QUEUE", "IN_PROGRESS"].includes(job.status)) {
      try {
        await falFetch(job.cancelUrl, { method: "PUT" });
        job.status = "CANCELLED";
      } catch (e) {
        // 400 means it already started/finished; refresh to pick up the real state.
        await refreshJob(job);
        if (job.status === "IN_PROGRESS") throw new FalError(`Could not cancel: ${e.message}`, 409);
      }
      saveHistory();
    }
    return publicJob(job);
  },

  "DELETE /api/job": async (req, url) => {
    const id = url.searchParams.get("id");
    const job = findJob(id);
    if (job && url.searchParams.get("files") === "1") {
      for (const o of job.outputs || []) if (o.localPath) await fsp.rm(o.localPath, { force: true });
    }
    history = history.filter((j) => j.id !== id);
    saveHistory();
    return { ok: true };
  },

  "DELETE /api/jobs": async () => {
    history = history.filter((j) => ["IN_QUEUE", "IN_PROGRESS"].includes(j.status));
    saveHistory();
    return { ok: true };
  },

  "POST /api/open-folder": async () => {
    const dir = outputDir();
    await fsp.mkdir(dir, { recursive: true });
    const { spawn } = require("child_process");
    const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [dir], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    return { ok: true, dir };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    // Mutating requests must come from this app's own page (basic CSRF guard).
    if (req.method !== "GET" && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (origin.host !== req.headers.host) return send(res, 403, { error: "Cross-origin request blocked" });
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return send(res, 200, await handler(req, url));
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Unknown API route" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
    if (url.pathname.startsWith("/outputs/")) {
      return serveFile(req, res, outputDir(), url.pathname.slice("/outputs/".length));
    }
    return serveFile(req, res, PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  } catch (e) {
    if (!(e instanceof FalError)) console.error(e);
    if (!res.headersSent) send(res, e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message, detail: e.body });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use. Close the other app or set PORT in .env (e.g. PORT=3001).\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  const link = `http://${shown}:${PORT}`;
  console.log(`\n  fal Studio is running at ${link}`);
  console.log(`  Outputs are saved to ${outputDir()}`);
  console.log(apiKey() ? `  API key loaded (${maskKey(apiKey())})` : "  No API key yet — add it in Settings in the web app.");
  console.log("  Press Ctrl+C to stop.\n");
  if (process.argv.includes("--open")) {
    const { spawn } = require("child_process");
    const [cmd, args] =
      process.platform === "win32" ? ["cmd", ["/c", "start", "", link]] : process.platform === "darwin" ? ["open", [link]] : ["xdg-open", [link]];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  }
});
