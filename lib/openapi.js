"use strict";

// Extract self-contained input/output JSON schemas for one endpoint from the
// OpenAPI document fal publishes at
//   https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>

function resolveRef(doc, ref) {
  if (!ref.startsWith("#/")) return {};
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => (node ? node[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), doc) || {};
}

// Inline every $ref and merge allOf, so the browser gets a plain tree.
function deref(doc, schema, seen = new Set(), depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 30) return schema;
  if (Array.isArray(schema)) return schema.map((s) => deref(doc, s, seen, depth + 1));

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: "object", description: "(recursive)" };
    const { $ref, ...siblings } = schema;
    const next = new Set(seen).add($ref);
    return deref(doc, { ...resolveRef(doc, $ref), ...siblings }, next, depth + 1);
  }

  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "properties" && v && typeof v === "object") {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = deref(doc, pv, seen, depth + 1);
    } else if (["items", "additionalProperties", "anyOf", "oneOf", "allOf"].includes(k)) {
      out[k] = deref(doc, v, seen, depth + 1);
    } else {
      out[k] = v;
    }
  }

  if (Array.isArray(out.allOf)) {
    const parts = out.allOf;
    delete out.allOf;
    if (parts.length === 1 && !out.properties) return { ...parts[0], ...out };
    for (const part of parts) {
      if (part.properties) out.properties = { ...(out.properties || {}), ...part.properties };
      if (part.required) out.required = [...new Set([...(out.required || []), ...part.required])];
      for (const [k, v] of Object.entries(part)) if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

function extractEndpointSchemas(doc, endpointId) {
  const paths = doc && doc.paths ? doc.paths : {};
  const keys = Object.keys(paths);

  const submitKey =
    keys.find((k) => k === `/${endpointId}` && paths[k].post) ||
    keys.find((k) => paths[k].post && !k.includes("/requests/"));
  let input = null;
  if (submitKey) {
    const op = paths[submitKey].post;
    const content = op.requestBody && op.requestBody.content;
    const media = content && (content["application/json"] || Object.values(content)[0]);
    if (media && media.schema) input = deref(doc, media.schema);
  }

  const resultKey = keys.find(
    (k) => /\/requests\/\{[^}]+\}$/.test(k) && paths[k].get
  );
  let output = null;
  if (resultKey) {
    const ok = paths[resultKey].get.responses && paths[resultKey].get.responses["200"];
    const media = ok && ok.content && (ok.content["application/json"] || Object.values(ok.content)[0]);
    if (media && media.schema) output = deref(doc, media.schema);
  }

  const info = doc.info || {};
  const meta = info["x-fal-metadata"] || {};
  return {
    input,
    output,
    info: {
      title: info.title,
      description: info.description,
      playgroundUrl: meta.playgroundUrl,
      documentationUrl: meta.documentationUrl,
      category: meta.category,
    },
  };
}

module.exports = { extractEndpointSchemas, deref };
