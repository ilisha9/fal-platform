#!/usr/bin/env node
// Regenerates lib/model-meta.json: per-model facts used by the sidebar's sort
// and filter controls (typical price, max resolution, audio, end frame, LoRA,
// max duration, release date). Reads each model's OpenAPI schema and fal's
// model catalog, and prices the model's default settings with public/pricing.js.
//
//   npm run update-meta
"use strict";

const fs = require("fs");
const path = require("path");
const { MODELS } = require("../lib/models");
const { extractEndpointSchemas } = require("../lib/openapi");
const pricing = require("../public/pricing");

const OPENAPI_URL = process.env.FAL_OPENAPI_URL || "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=";
const CATALOG_URL = "https://api.fal.ai/v1/models";
const OUT = path.join(__dirname, "..", "lib", "model-meta.json");

// Families whose fal pages say audio is generated natively, though their
// schemas have no audio switch ("synchronized audio" / "native audio included").
const NATIVE_AUDIO = [
  /^minimax\/h3(-max(-turbo)?)?\/(text|image|reference)-to-video/,
  /^minimax\/h3-max\/lip-sync\//,
  /^google\/gemini-omni-flash\/v1\.2\/(text|image|reference)-to-video$/,
];

const RES_ORDER = ["360p", "480p", "540p", "720p", "768p", "1k", "1080p", "1.5k", "2k", "1440p", "4k", "2160p", "8k"];
const RES_LABEL = { "1440p": "2K", "2160p": "4K", "2k": "2K", "4k": "4K", "8k": "8K", "1k": "1K", "1.5k": "1.5K" };

async function getJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

function enumOf(prop) {
  if (!prop) return [];
  if (Array.isArray(prop.enum)) return prop.enum;
  for (const v of prop.anyOf || []) if (Array.isArray(v.enum)) return v.enum;
  return [];
}

function maxResolution(props) {
  const values = enumOf(props.resolution).map((v) => String(v).toLowerCase());
  const known = values.filter((v) => RES_ORDER.includes(v));
  if (!known.length) return null;
  const top = known.sort((a, b) => RES_ORDER.indexOf(a) - RES_ORDER.indexOf(b)).pop();
  return RES_LABEL[top] || top;
}

function maxDuration(props) {
  const d = props.duration;
  if (!d) return null;
  const nums = enumOf(d).map((v) => parseFloat(v)).filter(Number.isFinite);
  if (nums.length) return Math.max(...nums);
  return Number.isFinite(d.maximum) ? d.maximum : null;
}

function defaultsOf(props) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const d = v.default !== undefined ? v.default : (v.anyOf || []).map((x) => x.default).find((x) => x !== undefined);
    if (d !== undefined && d !== null) out[k] = d;
  }
  return out;
}

(async () => {
  const ids = MODELS.map((m) => m.id);

  // Release dates from fal's catalog, 20 ids per request.
  const dates = {};
  const falDescriptions = {};
  for (let i = 0; i < ids.length; i += 20) {
    const qs = ids.slice(i, i + 20).map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&");
    try {
      const data = await getJson(`${CATALOG_URL}?${qs}`);
      for (const m of data.models || []) {
        dates[m.endpoint_id] = ((m.metadata && m.metadata.date) || "").slice(0, 10);
        falDescriptions[m.endpoint_id] = (m.metadata && m.metadata.description) || "";
      }
    } catch (e) {
      console.warn("catalog lookup failed:", e.message);
    }
  }

  const meta = {};
  for (const model of MODELS) {
    const isVideo = /video/.test(model.category);
    let props = {};
    try {
      const doc = await getJson(OPENAPI_URL + encodeURIComponent(model.id));
      props = (extractEndpointSchemas(doc, model.id).input || {}).properties || {};
    } catch (e) {
      console.warn(`schema failed for ${model.id}: ${e.message}`);
    }
    const defaults = defaultsOf(props);
    // Video: average per second over a 10s clip (so minimums and fixed fees are
    // spread out). Images: per image. "price" uses the model's default settings,
    // "priceFrom" its cheapest resolution.
    const unitPrice = (extra) => {
      const input = isVideo ? { duration: 10, ...extra } : { num_images: 1, ...extra };
      const est = pricing.estimate(model.id, input, { defaults });
      if (!est || est.perRequest == null) return null;
      return +(isVideo ? est.perRequest / 10 : est.perRequest).toFixed(5);
    };
    const price = unitPrice({});
    const candidates = enumOf(props.resolution).map((res) => unitPrice({ resolution: res })).filter((x) => x != null);
    const priceFrom = candidates.length ? Math.min(...candidates) : price;
    const text = `${model.description} ${falDescriptions[model.id] || ""} ${JSON.stringify(props)}`;
    meta[model.id] = {
      price,
      priceFrom,
      priceUnit: isVideo ? "s" : "image",
      maxRes: maxResolution(props),
      maxDuration: isVideo ? maxDuration(props) : null,
      audio: isVideo
        ? Boolean(props.generate_audio || props.audio || NATIVE_AUDIO.some((re) => re.test(model.id)) || /native audio|with audio|synchronized audio/i.test(text))
        : false,
      endFrame: Boolean(props.end_image_url),
      lora: Boolean(props.loras),
      released: dates[model.id] || null,
    };
    process.stdout.write(".");
  }
  fs.writeFileSync(OUT, JSON.stringify(meta, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(meta).length} entries to ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
