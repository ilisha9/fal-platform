"use strict";

// ------------------------------------------------------------------ helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && typeof opts.body === "string" ? { "Content-Type": "application/json", ...opts.headers } : opts.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.detail = data.detail;
    throw err;
  }
  return data;
}

function toast(msg, type = "info", ms = 5000) {
  const el = h("div", { class: `toast ${type}` }, msg);
  $("#toasts").append(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

const humanize = (key) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUrls?\b/g, (m) => m.toUpperCase());
const fmtTime = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDur = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function mediaKindFromUrl(url, contentType = "") {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  return "file";
}

// ------------------------------------------------------------------ state

const state = {
  models: [],
  categories: [],
  model: null,
  schema: null,
  root: null, // root field controller
  jobs: [],
  filter: store.get("filter", "all"),
  polling: new Set(),
  lightbox: { items: [], index: 0 },
};

// ------------------------------------------------------------------ schema → form

const PRIMARY = /^(prompt|negative_prompt|text|image_size|aspect_ratio|resolution|duration|num_images|num_frames|frames_per_second|fps|seed|style|voice|lyrics|.*_urls?|.*_image|image|video|audio|mask)$/;
const LONG_TEXT = /(^|_)(prompt|text|lyrics|instructions?|script|caption|description)$/;
const URL_FIELD = /(_urls?$|^url$|_uri$|^image$|^video$|^audio$)/;

function unwrapNullable(schema) {
  const variants = schema.anyOf || schema.oneOf;
  if (!variants) return { schema, nullable: false };
  const nonNull = variants.filter((v) => v.type !== "null");
  const { anyOf, oneOf, ...rest } = schema;
  if (nonNull.length === 1) return { schema: { ...nonNull[0], ...rest, type: nonNull[0].type }, nullable: true };
  return { schema: { ...rest, variants: nonNull }, nullable: nonNull.length !== variants.length };
}

function acceptFor(name, schema) {
  const s = `${name} ${schema.title || ""} ${schema.description || ""}`.toLowerCase();
  if (/video/.test(name)) return "video/*";
  if (/audio|voice|music|speech|song/.test(name)) return "audio/*";
  if (/image|mask|frame|photo|face|style_ref|reference/.test(name)) return "image/*";
  if (/video/.test(s)) return "video/*";
  if (/audio/.test(s)) return "audio/*";
  if (/image/.test(s)) return "image/*";
  return "";
}

function isUrlString(name, s) {
  return s.type === "string" && (URL_FIELD.test(name) || s.format === "uri" || s.format === "binary");
}

function fieldLabel(name, schema, required) {
  return h("span", { class: "label-text" }, schema.title || humanize(name), required ? h("span", { class: "req", title: "Required" }, " *") : null);
}

function describe(schema) {
  const bits = [];
  if (schema.description) bits.push(schema.description);
  return bits.length ? h("p", { class: "hint" }, bits.join(" ")) : null;
}

/**
 * Every builder returns a controller: { el, get(), set(value), onChange? }.
 * get() returns undefined when the field should be omitted from the request.
 */
function buildField(name, rawSchema, { required = false, onChange } = {}) {
  const { schema } = unwrapNullable(rawSchema);
  const ctx = { name, schema, required, onChange };

  if (schema.variants) return buildVariantField(ctx);
  if (Array.isArray(schema.enum)) return buildEnumField(ctx);
  switch (schema.type) {
    case "boolean":
      return buildBoolField(ctx);
    case "integer":
    case "number":
      return buildNumberField(ctx);
    case "array":
      return buildArrayField(ctx);
    case "object":
      return schema.properties ? buildObjectField(ctx) : buildJsonField(ctx);
    case "string":
      if (isUrlString(name, schema)) return buildMediaField({ ...ctx, multiple: false });
      return buildStringField(ctx);
    default:
      if (schema.properties) return buildObjectField(ctx);
      return buildJsonField(ctx);
  }
}

function wrap(ctx, control, extraClass = "") {
  return h(
    "div",
    { class: `field ${extraClass}`, dataset: { name: ctx.name } },
    h("label", { class: "field-label" }, fieldLabel(ctx.name, ctx.schema, ctx.required), defaultBadge(ctx.schema)),
    control,
    describe(ctx.schema)
  );
}

function defaultBadge(schema) {
  if (schema.default === undefined || schema.default === null || typeof schema.default === "object") return null;
  if (schema.type === "string" && !schema.enum && String(schema.default).length > 24) return null;
  return h("span", { class: "default-badge", title: "Default value" }, `default: ${schema.default}`);
}

function buildStringField(ctx) {
  const { schema, name } = ctx;
  const long = LONG_TEXT.test(name) || (schema.maxLength || 0) > 300;
  const input = long
    ? h("textarea", { class: "input", rows: name === "prompt" ? 5 : 3, maxlength: schema.maxLength, placeholder: (schema.examples || [])[0] || "" })
    : h("input", { class: "input", type: "text", maxlength: schema.maxLength, placeholder: (schema.examples || [])[0] || "" });
  if (schema.default !== undefined && schema.default !== null) input.value = schema.default;
  const counter = schema.maxLength ? h("span", { class: "counter" }) : null;
  const update = () => {
    if (counter) counter.textContent = `${input.value.length}/${schema.maxLength}`;
  };
  input.addEventListener("input", () => {
    update();
    ctx.onChange && ctx.onChange();
  });
  update();
  if (long && name === "prompt") input.classList.add("prompt");
  return {
    el: wrap(ctx, h("div", { class: "with-counter" }, input, counter), long ? "full" : ""),
    get: () => (input.value === "" && !ctx.required ? undefined : input.value),
    set: (v) => {
      input.value = v ?? "";
      update();
    },
    focus: () => input.focus(),
  };
}

function buildEnumField(ctx) {
  const { schema } = ctx;
  const hasDefault = schema.default !== undefined && schema.default !== null;
  const select = h(
    "select",
    { class: "input" },
    !hasDefault && !ctx.required ? h("option", { value: "" }, "— model default —") : null,
    schema.enum.map((v) => h("option", { value: JSON.stringify(v) }, prettyEnum(ctx.name, v)))
  );
  if (hasDefault) select.value = JSON.stringify(schema.default);
  select.addEventListener("change", () => ctx.onChange && ctx.onChange());
  return {
    el: wrap(ctx, select),
    get: () => (select.value === "" ? undefined : JSON.parse(select.value)),
    set: (v) => {
      select.value = v === undefined || v === null ? (hasDefault ? JSON.stringify(schema.default) : "") : JSON.stringify(v);
    },
  };
}

function prettyEnum(name, v) {
  if (/duration/.test(name) && /^\d+s?$/.test(String(v))) return `${String(v).replace(/s$/, "")} seconds`;
  return String(v).replace(/_/g, " ");
}

function buildBoolField(ctx) {
  const { schema } = ctx;
  const input = h("input", { type: "checkbox" });
  input.checked = Boolean(schema.default);
  let touched = false;
  input.addEventListener("change", () => {
    touched = true;
    ctx.onChange && ctx.onChange();
  });
  const el = h(
    "div",
    { class: "field bool", dataset: { name: ctx.name } },
    h("label", { class: "switch" }, input, h("span", { class: "slider" }), fieldLabel(ctx.name, schema, ctx.required)),
    describe(schema)
  );
  return {
    el,
    get: () => (touched || schema.default !== undefined || ctx.required ? input.checked : undefined),
    set: (v) => {
      touched = v !== undefined;
      input.checked = v === undefined ? Boolean(schema.default) : Boolean(v);
    },
  };
}

function buildNumberField(ctx) {
  const { schema, name } = ctx;
  const isInt = schema.type === "integer";
  const min = schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum : undefined);
  const max = schema.maximum ?? (schema.exclusiveMaximum !== undefined ? schema.exclusiveMaximum : undefined);
  const step = schema.multipleOf || (isInt ? 1 : max !== undefined && min !== undefined && max - min <= 2 ? 0.01 : 0.1);
  const num = h("input", { class: "input num", type: "number", min, max, step, placeholder: schema.default ?? (name === "seed" ? "random" : "") });
  if (schema.default !== undefined && schema.default !== null) num.value = schema.default;
  const parts = [];
  let range = null;
  if (min !== undefined && max !== undefined && max - min <= 1000 && name !== "seed") {
    range = h("input", { type: "range", min, max, step, class: "range" });
    range.value = num.value !== "" ? num.value : schema.default ?? min;
    range.addEventListener("input", () => {
      num.value = range.value;
      ctx.onChange && ctx.onChange();
    });
    num.addEventListener("input", () => {
      if (num.value !== "") range.value = num.value;
    });
    parts.push(range);
  }
  num.addEventListener("input", () => ctx.onChange && ctx.onChange());
  parts.push(num);
  if (name === "seed") {
    parts.push(
      h("button", { type: "button", class: "btn ghost small", title: "Random seed", onclick: () => { num.value = Math.floor(Math.random() * 2 ** 31); ctx.onChange && ctx.onChange(); } }, "🎲"),
      h("button", { type: "button", class: "btn ghost small", title: "Clear (random each time)", onclick: () => { num.value = ""; ctx.onChange && ctx.onChange(); } }, "✕")
    );
  }
  const control = h("div", { class: "num-row" }, parts);
  if (min !== undefined || max !== undefined) {
    control.append(h("span", { class: "range-hint" }, `${min ?? "…"}–${max ?? "…"}`));
  }
  return {
    el: wrap(ctx, control),
    get: () => {
      if (num.value === "") return undefined;
      const v = Number(num.value);
      return Number.isFinite(v) ? (isInt ? Math.round(v) : v) : undefined;
    },
    set: (v) => {
      num.value = v ?? "";
      if (range && v !== undefined && v !== null) range.value = v;
    },
  };
}

// e.g. image_size: "landscape_4_3" | { width, height }
function buildVariantField(ctx) {
  const { schema } = ctx;
  const variants = schema.variants;
  const enumVariant = variants.find((v) => Array.isArray(v.enum));
  const objectVariant = variants.find((v) => v.type === "object" && v.properties);

  if (enumVariant && objectVariant) {
    const select = h(
      "select",
      { class: "input" },
      !ctx.required && schema.default === undefined ? h("option", { value: "" }, "— model default —") : null,
      enumVariant.enum.map((v) => h("option", { value: JSON.stringify(v) }, prettyEnum(ctx.name, v))),
      h("option", { value: "__custom" }, "Custom…")
    );
    const sub = buildObjectField({ name: ctx.name, schema: { ...objectVariant, title: "" }, onChange: ctx.onChange }, true);
    sub.el.classList.add("hidden");
    const sync = () => sub.el.classList.toggle("hidden", select.value !== "__custom");
    select.addEventListener("change", () => {
      sync();
      ctx.onChange && ctx.onChange();
    });
    const setVal = (v) => {
      if (v && typeof v === "object") {
        select.value = "__custom";
        sub.set(v);
      } else if (v !== undefined && v !== null) {
        select.value = JSON.stringify(v);
      } else {
        select.value = schema.default !== undefined && typeof schema.default !== "object" ? JSON.stringify(schema.default) : select.options[0].value;
        if (schema.default && typeof schema.default === "object") setVal(schema.default);
      }
      sync();
    };
    setVal(undefined);
    return {
      el: wrap(ctx, h("div", {}, select, sub.el), "full"),
      get: () => (select.value === "__custom" ? sub.get() : select.value === "" ? undefined : JSON.parse(select.value)),
      set: setVal,
    };
  }

  // Mixed primitive types (e.g. number | string): free text, parsed as JSON when possible.
  if (variants.every((v) => ["string", "number", "integer", "boolean"].includes(v.type))) {
    const allEnum = variants.flatMap((v) => v.enum || []);
    const input = h("input", { class: "input", type: "text", list: allEnum.length ? `dl-${ctx.name}` : undefined });
    if (schema.default !== undefined && schema.default !== null) input.value = schema.default;
    input.addEventListener("input", () => ctx.onChange && ctx.onChange());
    const dl = allEnum.length ? h("datalist", { id: `dl-${ctx.name}` }, allEnum.map((v) => h("option", { value: v }))) : null;
    return {
      el: wrap(ctx, h("div", {}, input, dl)),
      get: () => {
        if (input.value === "") return undefined;
        const allowsString = variants.some((v) => v.type === "string");
        const n = Number(input.value);
        if (input.value.trim() !== "" && Number.isFinite(n) && (!allowsString || variants.some((v) => v.type !== "string"))) return n;
        return input.value;
      },
      set: (v) => (input.value = v ?? ""),
    };
  }

  // Array of urls | single url
  const urlVariant = variants.find((v) => isUrlString(ctx.name, v) || (v.type === "array" && v.items && v.items.type === "string"));
  if (urlVariant && URL_FIELD.test(ctx.name)) {
    return buildMediaField({ ...ctx, multiple: variants.some((v) => v.type === "array") });
  }
  return buildField(ctx.name, { ...variants[0], title: schema.title, description: schema.description, default: schema.default }, ctx);
}

function buildObjectField(ctx, bare = false) {
  const { schema } = ctx;
  const required = new Set(schema.required || []);
  const children = orderedProps(schema).map(([key, s]) => [key, buildField(key, s, { required: required.has(key), onChange: ctx.onChange })]);
  const body = h("div", { class: "grid" }, children.map(([, c]) => c.el));
  const get = () => {
    const out = {};
    for (const [key, c] of children) {
      const v = c.get();
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const set = (v) => {
    for (const [key, c] of children) c.set(v ? v[key] : undefined);
  };
  if (bare) return { el: body, get, set, children };
  const el = h(
    "fieldset",
    { class: "field full object", dataset: { name: ctx.name } },
    h("legend", {}, fieldLabel(ctx.name, schema, ctx.required)),
    describe(schema),
    body
  );
  return { el, get, set, children };
}

function buildJsonField(ctx) {
  const { schema } = ctx;
  const ta = h("textarea", { class: "input mono", rows: 3, placeholder: "JSON" });
  if (schema.default !== undefined && schema.default !== null) ta.value = JSON.stringify(schema.default, null, 2);
  ta.addEventListener("input", () => {
    ta.classList.remove("invalid");
    ctx.onChange && ctx.onChange();
  });
  return {
    el: wrap(ctx, ta, "full"),
    get: () => {
      if (!ta.value.trim()) return undefined;
      try {
        return JSON.parse(ta.value);
      } catch {
        ta.classList.add("invalid");
        throw new Error(`"${humanize(ctx.name)}" is not valid JSON`);
      }
    },
    set: (v) => (ta.value = v === undefined || v === null ? "" : JSON.stringify(v, null, 2)),
  };
}

function buildArrayField(ctx) {
  const { schema, name } = ctx;
  const items = unwrapNullable(schema.items || {}).schema;
  if (items.type === "string" && (URL_FIELD.test(name) || items.format === "uri" || /url/i.test(schema.title || ""))) {
    return buildMediaField({ ...ctx, multiple: true });
  }
  if (["string", "number", "integer"].includes(items.type) && !items.enum) {
    const ta = h("textarea", { class: "input", rows: 2, placeholder: items.type === "string" ? "One value per line" : "Comma-separated numbers" });
    const fmt = (v) => (Array.isArray(v) ? v.join(items.type === "string" ? "\n" : ", ") : "");
    ta.value = fmt(schema.default);
    ta.addEventListener("input", () => ctx.onChange && ctx.onChange());
    return {
      el: wrap(ctx, ta, "full"),
      get: () => {
        const parts = items.type === "string" ? ta.value.split("\n").map((s) => s.trim()).filter(Boolean) : ta.value.split(/[,\s]+/).filter(Boolean).map(Number);
        return parts.length ? parts : undefined;
      },
      set: (v) => (ta.value = fmt(v ?? schema.default)),
    };
  }
  if (items.type === "object" && items.properties) return buildObjectListField(ctx, items);
  return buildJsonField(ctx);
}

// e.g. loras: [{ path, scale }]
function buildObjectListField(ctx, itemSchema) {
  const { schema } = ctx;
  const list = h("div", { class: "obj-list" });
  let rows = [];
  const max = schema.maxItems ?? 20;
  const addBtn = h("button", { type: "button", class: "btn ghost small" }, `＋ Add ${humanize(ctx.name).replace(/s$/, "").toLowerCase()}`);
  const addRow = (value) => {
    if (rows.length >= max) return;
    const ctl = buildObjectField({ name: ctx.name, schema: itemSchema, onChange: ctx.onChange }, true);
    const row = h(
      "div",
      { class: "obj-row" },
      ctl.el,
      h("button", { type: "button", class: "icon-btn", title: "Remove", onclick: () => { rows = rows.filter((r) => r.ctl !== ctl); row.remove(); refresh(); ctx.onChange && ctx.onChange(); } }, "✕")
    );
    if (value) ctl.set(value);
    rows.push({ ctl, row });
    list.append(row);
    refresh();
  };
  const refresh = () => (addBtn.disabled = rows.length >= max);
  addBtn.addEventListener("click", () => {
    addRow();
    ctx.onChange && ctx.onChange();
  });
  const set = (v) => {
    rows.forEach((r) => r.row.remove());
    rows = [];
    (Array.isArray(v) ? v : Array.isArray(schema.default) ? schema.default : []).forEach(addRow);
  };
  set(undefined);
  return {
    el: wrap(ctx, h("div", {}, list, addBtn), "full"),
    get: () => {
      const vals = rows.map((r) => r.ctl.get()).filter(Boolean);
      return vals.length ? vals : undefined;
    },
    set,
  };
}

// ------------------------------------------------------------------ reference uploads

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "file"));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      xhr.status < 300 ? resolve(data) : reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

function previewFor(url, kind) {
  kind = kind || mediaKindFromUrl(url);
  if (kind === "image") return h("img", { src: url, alt: "", loading: "lazy" });
  if (kind === "video") return h("video", { src: url, muted: true, loop: true, playsinline: true, onmouseenter: (e) => e.target.play().catch(() => {}), onmouseleave: (e) => e.target.pause() });
  if (kind === "audio") return h("div", { class: "file-chip" }, "🎵");
  return h("div", { class: "file-chip" }, "📄");
}

function buildMediaField(ctx) {
  const { schema, multiple } = ctx;
  const accept = acceptFor(ctx.name, schema);
  const max = multiple ? schema.maxItems ?? 50 : 1;
  let urls = [];
  const thumbs = h("div", { class: "thumbs" });
  const fileInput = h("input", { type: "file", accept, multiple: multiple || undefined, class: "hidden" });
  const urlInput = h("input", { class: "input", type: "url", placeholder: multiple ? "…or paste a URL and press Enter" : "…or paste a URL" });
  const drop = h(
    "div",
    { class: "dropzone", tabindex: 0, role: "button" },
    h("div", { class: "dz-icon" }, accept.startsWith("video") ? "🎬" : accept.startsWith("audio") ? "🎵" : "🖼"),
    h("div", {}, h("strong", {}, multiple ? "Drop reference files" : "Drop a reference file"), " or click to browse"),
    h("div", { class: "muted small" }, `${accept ? accept.replace("/*", "") : "any file"}${multiple ? ` · up to ${max}` : ""} · paste with Ctrl+V`)
  );

  const render = () => {
    thumbs.replaceChildren(
      ...urls.map((u, i) =>
        h(
          "div",
          { class: `thumb ${u.uploading ? "uploading" : ""}`, title: u.name || u.url },
          u.url ? previewFor(u.url, u.kind) : h("div", { class: "file-chip" }, "⏳"),
          u.uploading ? h("div", { class: "progress" }, h("span", { style: `width:${Math.round((u.progress || 0) * 100)}%` })) : null,
          multiple && urls.length > 1 ? h("span", { class: "thumb-index" }, i + 1) : null,
          h("button", { type: "button", class: "thumb-x", title: "Remove", onclick: (e) => { e.stopPropagation(); urls.splice(i, 1); render(); ctx.onChange && ctx.onChange(); } }, "✕")
        )
      )
    );
    drop.classList.toggle("compact", urls.length > 0);
    drop.classList.toggle("hidden", urls.length >= max);
    if (!multiple) urlInput.value = urls[0] && !urls[0].uploading ? urls[0].url : "";
  };

  const addFiles = async (files) => {
    files = [...files].slice(0, Math.max(0, max - urls.length));
    await Promise.all(
      files.map(async (file) => {
        const entry = { name: file.name, uploading: true, progress: 0, kind: mediaKindFromUrl(file.name, file.type) };
        if (!multiple) urls = [];
        urls.push(entry);
        render();
        try {
          const res = await uploadFile(file, (p) => {
            entry.progress = p;
            render();
          });
          entry.url = res.url;
          entry.uploading = false;
          toast(`Uploaded ${file.name}`, "success", 2500);
        } catch (e) {
          urls = urls.filter((u) => u !== entry);
          toast(e.message, "error");
        }
        render();
        ctx.onChange && ctx.onChange();
      })
    );
  };

  const addUrl = (url) => {
    url = url.trim();
    if (!url) return;
    if (!multiple) urls = [];
    if (urls.length < max) urls.push({ url, kind: mediaKindFromUrl(url) });
    render();
    ctx.onChange && ctx.onChange();
  };

  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && fileInput.click());
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  for (const target of [drop, thumbs]) {
    target.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    target.addEventListener("dragleave", () => drop.classList.remove("over"));
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      else {
        const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
        if (/^https?:\/\//.test(text)) addUrl(text.split("\n")[0]);
      }
    });
  }
  const wrapper = h(
    "div",
    { class: "media-input", tabindex: -1 },
    thumbs,
    drop,
    fileInput,
    h(
      "div",
      { class: "url-row" },
      urlInput,
      h("button", { type: "button", class: "btn ghost small", title: "Pick from recent uploads", onclick: () => openUploadsPicker((u) => addUrl(u)) }, "Recent")
    )
  );
  wrapper.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUrl(urlInput.value);
      if (multiple) urlInput.value = "";
    }
  });
  urlInput.addEventListener("change", () => {
    if (!multiple) addUrl(urlInput.value);
  });
  render();
  const ctl = {
    el: wrap(ctx, wrapper, "full media"),
    get: () => {
      if (urls.some((u) => u.uploading)) throw new Error(`Still uploading "${humanize(ctx.name)}" — wait a moment.`);
      const list = urls.map((u) => u.url).filter(Boolean);
      if (!multiple) return list[0];
      return list.length ? list : undefined;
    },
    set: (v) => {
      urls = (Array.isArray(v) ? v : v ? [v] : []).filter((u) => typeof u === "string").map((url) => ({ url, kind: mediaKindFromUrl(url) }));
      if (!multiple) urlInput.value = urls[0] ? urls[0].url : "";
      render();
    },
    addFiles,
    accept,
    multiple,
    isMedia: true,
  };
  return ctl;
}

async function openUploadsPicker(onPick) {
  const dlg = $("#uploadsDialog");
  const grid = $("#uploadsGrid");
  grid.replaceChildren(h("p", { class: "muted" }, "Loading…"));
  dlg.showModal();
  const list = await api("/api/uploads").catch(() => []);
  const draw = (items) =>
    grid.replaceChildren(
      ...(items.length
        ? items.map((u) =>
            h(
              "button",
              { type: "button", class: "upload-item", title: u.fileName, onclick: () => { onPick(u.url); dlg.close(); } },
              previewFor(u.url, mediaKindFromUrl(u.fileName, u.contentType)),
              h("span", {}, u.fileName),
              h("span", { class: "muted small" }, fmtBytes(u.size))
            )
          )
        : [h("p", { class: "muted" }, "No uploads yet.")])
    );
  draw(list);
  $("#clearUploads").onclick = async () => draw(await api("/api/uploads", { method: "DELETE" }));
}

// ------------------------------------------------------------------ form assembly

function orderedProps(schema) {
  const props = Object.entries(schema.properties || {});
  const order = schema["x-fal-order-properties"];
  if (!Array.isArray(order)) return props;
  const idx = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  return props.sort((a, b) => idx(a[0]) - idx(b[0]));
}

function renderForm(schema) {
  const fields = $("#fields");
  fields.replaceChildren();
  const required = new Set(schema.required || []);
  const save = debounce(saveDraft, 400);
  const onChange = () => {
    save();
    updateRunsHint();
  };
  const entries = orderedProps(schema).map(([key, s]) => [key, buildField(key, s, { required: required.has(key), onChange })]);
  const isPrimary = (key, ctl) => required.has(key) || PRIMARY.test(key) || ctl.isMedia;
  const main = entries.filter(([k, c]) => isPrimary(k, c));
  const advanced = entries.filter(([k, c]) => !isPrimary(k, c));

  fields.append(h("div", { class: "grid" }, main.map(([, c]) => c.el)));
  if (advanced.length) {
    const det = h(
      "details",
      { class: "section", open: store.get("advancedOpen", true) || undefined },
      h("summary", {}, `Advanced settings `, h("span", { class: "muted" }, `(${advanced.length})`)),
      h("div", { class: "grid" }, advanced.map(([, c]) => c.el))
    );
    det.addEventListener("toggle", () => store.set("advancedOpen", det.open));
    fields.append(det);
  }
  if (!entries.length) fields.append(h("p", { class: "muted" }, "This model has no input parameters."));

  state.root = {
    entries,
    get() {
      const out = {};
      for (const [key, c] of entries) {
        const v = c.get();
        if (v !== undefined) out[key] = v;
      }
      return out;
    },
    set(values) {
      for (const [key, c] of entries) c.set(values ? values[key] : undefined);
    },
  };
  const prompt = entries.find(([k]) => k === "prompt");
  if (prompt && prompt[1].focus) setTimeout(() => prompt[1].focus(), 50);
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function draftKey() {
  return `draft:${state.model.id}`;
}

function saveDraft() {
  if (!state.root) return;
  try {
    store.set(draftKey(), { values: state.root.get(), extra: $("#extraJson").value });
  } catch {
    /* invalid JSON mid-typing is fine */
  }
}

function collectInputs() {
  const base = state.root.get();
  const extraText = $("#extraJson").value.trim();
  if (extraText) {
    let extra;
    try {
      extra = JSON.parse(extraText);
    } catch {
      throw new Error("Extra JSON is not valid JSON");
    }
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("Extra JSON must be an object");
    Object.assign(base, extra);
  }
  const missing = (state.schema.input.required || []).filter((k) => base[k] === undefined || base[k] === "" || (Array.isArray(base[k]) && !base[k].length));
  if (missing.length) throw new Error(`Required: ${missing.map(humanize).join(", ")}`);

  const runs = clampRuns();
  const inputs = [];
  for (let i = 0; i < runs; i++) {
    const input = structuredClone(base);
    if (i > 0 && $("#varySeed").checked && typeof input.seed === "number") input.seed = input.seed + i;
    inputs.push(input);
  }
  return inputs;
}

function clampRuns() {
  const el = $("#runs");
  const v = Math.min(50, Math.max(1, Math.round(Number(el.value) || 1)));
  if (String(v) !== el.value) el.value = v;
  return v;
}

function updateRunsHint() {
  if (!state.root) return;
  const runs = Math.min(50, Math.max(1, Math.round(Number($("#runs").value) || 1)));
  let perRun = 1;
  try {
    const v = state.root.get();
    perRun = v.num_images || v.num_outputs || v.num_samples || v.batch_size || 1;
  } catch {
    /* ignore */
  }
  const total = runs * perRun;
  $("#runsHint").textContent =
    runs > 1 || perRun > 1
      ? `${runs} request${runs > 1 ? "s" : ""}${perRun > 1 ? ` × ${perRun} outputs each` : ""} → about ${total} result${total > 1 ? "s" : ""}.`
      : "";
  $("#generate").firstChild.textContent = runs > 1 ? `Generate ×${runs} ` : "Generate ";
  updateEstimate(runs);
}

// ------------------------------------------------------------------ cost estimate

function schemaDefaults() {
  const props = (state.schema && state.schema.input && state.schema.input.properties) || {};
  const out = {};
  for (const [k, s] of Object.entries(props)) {
    const d = s.default !== undefined ? s.default : unwrapNullable(s).schema.default;
    if (d !== undefined && d !== null) out[k] = d;
  }
  return out;
}

function currentInputLoose() {
  let input = {};
  try {
    input = state.root.get();
  } catch {
    /* a field is mid-edit; estimate from defaults */
  }
  try {
    const extra = JSON.parse($("#extraJson").value || "{}");
    if (extra && typeof extra === "object" && !Array.isArray(extra)) Object.assign(input, extra);
  } catch {
    /* ignore invalid extra JSON here */
  }
  return input;
}

function updateEstimate(runs) {
  const box = $("#costBox");
  if (!state.model || !state.root || !window.FalPricing) return box.replaceChildren();
  runs = runs || clampRunsSilently();
  const est = FalPricing.estimate(state.model.id, currentInputLoose(), { defaults: schemaDefaults(), live: state.livePrice });
  state.lastEstimate = est;
  const money = FalPricing.money;
  if (!est) {
    box.replaceChildren(
      h("div", { class: "cost-main" }, h("span", { class: "muted" }, "Estimated cost: "), h("strong", {}, "unknown")),
      h("div", { class: "muted small" }, state.livePriceError || (state.livePriceLoading ? "Loading live price from fal…" : "No price data for this model. Check its page on fal.ai."))
    );
    return;
  }
  const total = est.perRequest === null ? null : est.perRequest * runs;
  const live = state.livePrice;
  box.replaceChildren(
    h(
      "div",
      { class: "cost-main" },
      h("span", { class: "muted" }, "Estimated cost: "),
      h("strong", { class: "cost-total" }, total === null ? "—" : money(total)),
      runs > 1 && est.perRequest !== null ? h("span", { class: "muted" }, ` (${money(est.perRequest)} × ${runs} runs)`) : null
    ),
    h("div", { class: "cost-detail muted small" }, est.lines.join(" · "), est.assumptions.length ? ` · ${est.assumptions.join(", ")}` : ""),
    h(
      "div",
      { class: "cost-detail muted small" },
      `Source: ${est.source}`,
      live && est.source !== "fal pricing API" ? ` · fal API lists ${money(Number(live.unit_price))}/${live.unit}` : "",
      " · estimate only, fal bills the actual usage"
    )
  );
}

function clampRunsSilently() {
  return Math.min(50, Math.max(1, Math.round(Number($("#runs").value) || 1)));
}

async function loadLivePrice(model) {
  state.livePrice = null;
  state.livePriceError = null;
  state.livePriceLoading = true;
  try {
    const r = await api(`/api/pricing?id=${encodeURIComponent(model.id)}`);
    if (state.model !== model) return;
    state.livePrice = r.live;
    state.livePriceError = r.error || (r.live ? null : "fal's pricing API has no price for this endpoint.");
  } catch (e) {
    state.livePriceError = e.message;
  } finally {
    state.livePriceLoading = false;
  }
  updateEstimate();
}

function updateSpent() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const total = state.jobs
    .filter((j) => j.status === "COMPLETED" && j.createdAt >= start.getTime() && typeof j.estimatedCost === "number")
    .reduce((n, j) => n + j.estimatedCost, 0);
  $("#spent").textContent = total ? `≈ ${FalPricing.money(total)} today` : "";
}

// ------------------------------------------------------------------ models

async function loadModels() {
  const data = await api("/api/models");
  state.models = data.models;
  state.categories = data.categories;
  $("#newModelCategory").replaceChildren(...data.categories.map((c) => h("option", { value: c.id }, c.name)));
  renderModelList();
}

function renderModelList() {
  const q = $("#modelSearch").value.trim().toLowerCase();
  const list = $("#modelList");
  list.replaceChildren();
  const match = (m) => !q || `${m.name} ${m.id} ${m.description}`.toLowerCase().includes(q);
  const collapsed = store.get("collapsedCats", []);
  for (const cat of state.categories) {
    const models = state.models.filter((m) => m.category === cat.id && match(m));
    if (!models.length) continue;
    const open = q || !collapsed.includes(cat.id);
    const det = h(
      "details",
      { class: "cat", open: open || undefined },
      h("summary", {}, cat.name, h("span", { class: "count" }, models.length)),
      models.map((m) =>
        h(
          "button",
          { class: `model-item ${state.model && state.model.id === m.id ? "active" : ""}`, title: m.id, onclick: () => selectModel(m) },
          h("span", { class: "model-name" }, m.name, m.rank ? h("span", { class: "tag rank" }, m.rank) : null, m.custom ? h("span", { class: "tag" }, "custom") : null),
          h("span", { class: "model-desc" }, m.description)
        )
      )
    );
    det.addEventListener("toggle", () => {
      if (q) return;
      const set = new Set(store.get("collapsedCats", []));
      det.open ? set.delete(cat.id) : set.add(cat.id);
      store.set("collapsedCats", [...set]);
    });
    list.append(det);
  }
  if (/^[\w.-]+(\/[\w.-]+)+$/.test(q) && !state.models.some((m) => m.id === q)) {
    list.prepend(
      h("button", { class: "model-item adhoc", onclick: () => selectModel({ id: $("#modelSearch").value.trim(), name: $("#modelSearch").value.trim(), category: "", description: "Ad-hoc endpoint", adhoc: true }) },
        h("span", { class: "model-name" }, "Use endpoint →"),
        h("span", { class: "model-desc mono" }, $("#modelSearch").value.trim()))
    );
  }
  if (!list.children.length) list.append(h("p", { class: "muted pad" }, "No matches. Paste a full endpoint id to use any fal model."));
}

async function selectModel(model, presetValues) {
  state.model = model;
  store.set("lastModel", model.id);
  renderModelList();
  document.body.classList.remove("sidebar-open");
  renderModelHeader(null);
  loadLivePrice(model);
  $("#schemaNotice").replaceChildren();
  $("#fields").replaceChildren(h("div", { class: "loading" }, h("span", { class: "spinner" }), " Loading model settings from fal…"));
  try {
    const schema = await api(`/api/schema?id=${encodeURIComponent(model.id)}`);
    if (state.model !== model) return;
    state.schema = schema;
    renderModelHeader(schema);
    if (schema.warning) $("#schemaNotice").replaceChildren(h("div", { class: `notice ${schema.source === "fallback" ? "warn" : ""}` }, schema.warning));
    renderForm(schema.input);
    const draft = presetValues ? { values: presetValues } : store.get(draftKey(), null);
    if (draft && draft.values) state.root.set(draft.values);
    $("#extraJson").value = presetValues ? "" : (draft && draft.extra) || "";
    if (presetValues) {
      // put any keys the form doesn't know about into Extra JSON
      const known = new Set(state.root.entries.map(([k]) => k));
      const extra = Object.fromEntries(Object.entries(presetValues).filter(([k]) => !known.has(k)));
      if (Object.keys(extra).length) {
        $("#extraJson").value = JSON.stringify(extra, null, 2);
        $("#extraSection").open = true;
      }
    }
    updateRunsHint();
    renderJobs();
  } catch (e) {
    $("#fields").replaceChildren(h("div", { class: "notice warn" }, `Could not load model: ${e.message}`));
  }
}

function renderModelHeader(schema) {
  const m = state.model;
  const info = (schema && schema.info) || {};
  const badge = schema ? h("span", { class: `badge ${schema.source}` }, { live: "live schema", cache: "cached schema", fallback: "generic form" }[schema.source] || schema.source) : null;
  $("#modelHeader").replaceChildren(
    h(
      "div",
      { class: "mh-top" },
      h("h1", {}, m.name),
      badge,
      h("span", { class: "topbar-spacer" }),
      schema ? h("button", { class: "icon-btn", title: "Reload settings from fal", onclick: () => reloadSchema() }, "⟳") : null,
      m.custom ? h("button", { class: "icon-btn", title: "Remove from my models", onclick: () => removeCustomModel(m.id) }, "🗑") : null,
      m.adhoc ? h("button", { class: "btn ghost small", onclick: () => saveAdhocModel(m) }, "Save to list") : null
    ),
    h(
      "div",
      { class: "mh-sub" },
      h("code", { class: "copy", title: "Copy endpoint id", onclick: () => { navigator.clipboard.writeText(m.id); toast("Endpoint id copied", "info", 1500); } }, m.id),
      h("a", { href: info.playgroundUrl || `https://fal.ai/models/${m.id}`, target: "_blank", rel: "noopener" }, "Model page ↗"),
      h("a", { href: info.documentationUrl || `https://fal.ai/models/${m.id}/api`, target: "_blank", rel: "noopener" }, "API docs ↗")
    ),
    m.description || info.description ? h("p", { class: "muted" }, m.description || info.description) : null
  );
}

async function reloadSchema() {
  await api(`/api/schema?id=${encodeURIComponent(state.model.id)}&refresh=1`).catch(() => {});
  saveDraft();
  selectModel(state.model);
}

async function saveAdhocModel(m) {
  const data = await api("/api/models", { method: "POST", body: JSON.stringify({ id: m.id, name: m.id.split("/").slice(1).join(" "), category: state.schema?.info?.category }) });
  state.models = data.models;
  const saved = state.models.find((x) => x.id === m.id);
  $("#modelSearch").value = "";
  selectModel(saved);
}

async function removeCustomModel(id) {
  if (!confirm(`Remove ${id} from your model list?`)) return;
  const data = await api(`/api/models?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  state.models = data.models;
  selectModel(state.models[0]);
}

// ------------------------------------------------------------------ generation

async function generate(e) {
  e && e.preventDefault();
  if (!state.root) return;
  let inputs;
  try {
    inputs = collectInputs();
  } catch (err) {
    toast(err.message, "error");
    return;
  }
  const btn = $("#generate");
  btn.disabled = true;
  try {
    const res = await api("/api/generate", { method: "POST", body: JSON.stringify({ endpointId: state.model.id, inputs, estimatedCost: state.lastEstimate ? state.lastEstimate.perRequest : undefined }) });
    state.jobs = dedupe([...res.jobs, ...state.jobs]);
    res.jobs.forEach((j) => state.polling.add(j.id));
    if (res.errors.length) toast(`${res.errors.length} request(s) failed to submit: ${res.errors[0]}`, "error", 8000);
    renderJobs();
    saveDraft();
  } catch (err) {
    toast(err.message, "error", 9000);
  } finally {
    btn.disabled = false;
  }
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter((j) => (seen.has(j.id) ? false : seen.add(j.id))).sort((a, b) => b.createdAt - a.createdAt || (a.batchIndex || 0) - (b.batchIndex || 0));
}

const ACTIVE = new Set(["IN_QUEUE", "IN_PROGRESS", "DOWNLOADING", "SUBMITTED"]);

async function pollLoop() {
  const ids = [...state.polling];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const job = await api(`/api/job?id=${encodeURIComponent(id)}`);
        const idx = state.jobs.findIndex((j) => j.id === id);
        if (idx >= 0) state.jobs[idx] = job;
        if (!ACTIVE.has(job.status)) {
          state.polling.delete(id);
          updateSpent();
          if (job.status === "FAILED") toast(`Generation failed: ${job.error || "unknown error"}`, "error", 8000);
        }
        updateJobCard(job);
      } catch (e) {
        if (/not found/i.test(e.message)) state.polling.delete(id);
      }
    })
  );
  setTimeout(pollLoop, state.polling.size ? 1500 : 3000);
}

async function cancelJob(job) {
  try {
    updateJobCard(await api(`/api/job/cancel?id=${job.id}`, { method: "POST" }));
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteJob(job) {
  const withFiles = (job.outputs || []).some((o) => o.local) && confirm("Also delete the saved files from disk?\n\nOK = delete files too, Cancel = keep files");
  await api(`/api/job?id=${job.id}${withFiles ? "&files=1" : ""}`, { method: "DELETE" });
  state.jobs = state.jobs.filter((j) => j.id !== job.id);
  state.polling.delete(job.id);
  renderJobs();
}

function reuseJob(job) {
  const model = state.models.find((m) => m.id === job.endpointId) || { id: job.endpointId, name: job.endpointId, category: "", description: "", adhoc: true };
  selectModel(model, job.input);
  $("#composer").scrollTo({ top: 0, behavior: "smooth" });
  toast("Settings loaded into the form", "info", 2000);
}

// ------------------------------------------------------------------ results rendering

function visibleJobs() {
  return state.filter === "model" && state.model ? state.jobs.filter((j) => j.endpointId === state.model.id) : state.jobs;
}

function renderJobs() {
  updateSpent();
  const container = $("#jobs");
  const jobs = visibleJobs();
  $$("#filter button").forEach((b) => b.classList.toggle("active", b.dataset.filter === state.filter));
  if (!jobs.length) {
    container.replaceChildren(
      h("div", { class: "empty" }, h("div", { class: "empty-icon" }, "✨"), h("p", {}, "Your generations will appear here."), h("p", { class: "muted small" }, "Pick a model, write a prompt, add references, and hit Generate."))
    );
    return;
  }
  container.replaceChildren(...jobs.slice(0, 300).map(jobCard));
}

function updateJobCard(job) {
  const old = document.getElementById(`job-${job.id}`);
  if (!old) return;
  const openLogs = old.querySelector("details.logs")?.open;
  const openJson = old.querySelector("details.json")?.open;
  const fresh = jobCard(job);
  if (openLogs) fresh.querySelector("details.logs") && (fresh.querySelector("details.logs").open = true);
  if (openJson) fresh.querySelector("details.json") && (fresh.querySelector("details.json").open = true);
  old.replaceWith(fresh);
}

const STATUS_LABEL = {
  IN_QUEUE: "In queue",
  IN_PROGRESS: "Generating",
  DOWNLOADING: "Saving",
  COMPLETED: "Done",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function jobCard(job) {
  const model = state.models.find((m) => m.id === job.endpointId);
  const active = ACTIVE.has(job.status);
  const elapsed = (job.completedAt || Date.now()) - job.createdAt;
  const media = (job.outputs || []).filter((o) => o.kind !== "file");
  const files = (job.outputs || []).filter((o) => o.kind === "file");
  const promptText = job.input && (job.input.prompt || job.input.text || "");
  const seed = job.result && job.result.seed;
  const settingsSummary = summarizeInput(job.input);

  return h(
    "article",
    { class: `job ${job.status.toLowerCase()}`, id: `job-${job.id}` },
    h(
      "header",
      {},
      h("span", { class: `status ${job.status.toLowerCase()}` }, active ? h("span", { class: "spinner small" }) : null, STATUS_LABEL[job.status] || job.status, job.status === "IN_QUEUE" && job.queuePosition != null ? ` · #${job.queuePosition + 1}` : ""),
      h("span", { class: "job-model", title: job.endpointId }, model ? model.name : job.endpointId),
      job.batchIndex ? h("span", { class: "tag" }, `run ${job.batchIndex}`) : null,
      typeof job.estimatedCost === "number" ? h("span", { class: "tag", title: "Estimated cost of this request" }, `≈ ${FalPricing.money(job.estimatedCost)}`) : null,
      h("span", { class: "topbar-spacer" }),
      h("span", { class: "muted small", title: new Date(job.createdAt).toLocaleString() }, `${fmtTime(job.createdAt)} · ${fmtDur(elapsed)}`)
    ),
    promptText ? h("p", { class: "job-prompt", title: promptText }, promptText) : null,
    settingsSummary ? h("p", { class: "job-settings muted small" }, settingsSummary) : null,
    active
      ? h("div", { class: "job-progress" }, h("div", { class: "bar indeterminate" }), job.logs && job.logs.length ? h("p", { class: "muted small mono last-log" }, job.logs[job.logs.length - 1]) : null)
      : null,
    job.error ? h("div", { class: "notice warn" }, job.error) : null,
    job.lastPollError && active ? h("p", { class: "muted small" }, `Retrying status check: ${job.lastPollError}`) : null,
    media.length
      ? h(
          "div",
          { class: `media-grid n${Math.min(media.length, 4)}` },
          media.map((o, i) => mediaTile(job, o, media, i))
        )
      : null,
    files.length ? h("div", { class: "files" }, files.map((o) => h("a", { href: o.local || o.url, target: "_blank", rel: "noopener", class: "btn ghost small" }, `⬇ ${o.field || "file"}`))) : null,
    job.status === "COMPLETED" && job.result && !(job.outputs || []).length ? h("pre", { class: "code" }, textResult(job.result)) : null,
    h(
      "footer",
      {},
      h("button", { class: "btn ghost small", onclick: () => reuseJob(job), title: "Load these settings into the form" }, "↺ Reuse"),
      active && job.status !== "DOWNLOADING" ? h("button", { class: "btn ghost small", onclick: () => cancelJob(job) }, "Cancel") : null,
      seed !== undefined ? h("button", { class: "btn ghost small", title: "Copy seed", onclick: () => { navigator.clipboard.writeText(String(seed)); toast(`Seed ${seed} copied`, "info", 1500); } }, `seed ${seed}`) : null,
      h("span", { class: "topbar-spacer" }),
      job.logs && job.logs.length ? h("details", { class: "logs" }, h("summary", {}, "Logs"), h("pre", { class: "code" }, job.logs.join("\n"))) : null,
      h("details", { class: "json" }, h("summary", {}, "JSON"), h("pre", { class: "code" }, JSON.stringify({ endpoint: job.endpointId, request_id: job.requestId, input: job.input, result: job.result, error: job.errorDetail }, null, 2))),
      !active ? h("button", { class: "icon-btn", title: "Delete", onclick: () => deleteJob(job) }, "🗑") : null
    )
  );
}

function summarizeInput(input) {
  if (!input) return "";
  const keys = ["duration", "aspect_ratio", "image_size", "resolution", "num_images", "num_frames", "num_inference_steps", "guidance_scale", "seed"];
  const parts = keys
    .filter((k) => input[k] !== undefined)
    .map((k) => {
      const v = input[k];
      if (k === "duration") return `${String(v).replace(/s$/, "")}s`;
      if (typeof v === "object") return `${v.width}×${v.height}`;
      if (k === "seed") return `seed ${v}`;
      if (k === "num_images") return `×${v}`;
      if (k === "num_inference_steps") return `${v} steps`;
      if (k === "guidance_scale") return `cfg ${v}`;
      if (k === "num_frames") return `${v} frames`;
      return String(v).replace(/_/g, " ");
    });
  const refs = Object.entries(input).filter(([k, v]) => URL_FIELD.test(k) && v).reduce((n, [, v]) => n + (Array.isArray(v) ? v.length : 1), 0);
  if (refs) parts.push(`${refs} reference${refs > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function textResult(result) {
  if (typeof result.text === "string") return result.text;
  if (typeof result.output === "string") return result.output;
  return JSON.stringify(result, null, 2);
}

function mediaTile(job, o, all, index) {
  const src = o.local || o.url;
  let el;
  if (o.kind === "image") el = h("img", { src, alt: "", loading: "lazy" });
  else if (o.kind === "video") el = h("video", { src, controls: true, loop: true, playsinline: true, preload: "metadata" });
  else if (o.kind === "audio") el = h("audio", { src, controls: true, preload: "metadata" });
  else el = h("div", { class: "file-chip big" }, o.kind === "3d" ? "🧊 3D model" : "📄");
  return h(
    "div",
    { class: `tile ${o.kind}` },
    el,
    h(
      "div",
      { class: "tile-actions" },
      o.kind === "image" || o.kind === "video" ? h("button", { class: "icon-btn", title: "View larger", onclick: () => openLightbox(all, index) }, "⤢") : null,
      h("a", { class: "icon-btn", href: src, download: "", title: o.local ? "Download (already saved to outputs folder)" : "Download" }, "⬇"),
      h("a", { class: "icon-btn", href: o.url, target: "_blank", rel: "noopener", title: "Open fal CDN URL" }, "↗"),
      o.kind === "image" ? h("button", { class: "icon-btn", title: "Use as reference in the current form", onclick: () => useAsReference(o.url) }, "＋ref") : null
    ),
    o.downloadError ? h("span", { class: "tile-warn", title: o.downloadError }, "not saved") : null
  );
}

function useAsReference(url) {
  if (!state.root) return;
  const target = state.root.entries.find(([, c]) => c.isMedia && (!c.accept || c.accept.startsWith("image")));
  if (!target) {
    toast("This model has no image reference input. Pick an image-to-image or image-to-video model first.", "error");
    return;
  }
  const [key, ctl] = target;
  const cur = ctl.get();
  ctl.set(ctl.multiple ? [...(cur || []), url] : url);
  saveDraft();
  toast(`Added to "${humanize(key)}"`, "success", 2000);
}

// ------------------------------------------------------------------ lightbox

function openLightbox(items, index) {
  state.lightbox = { items, index };
  $("#lightbox").classList.remove("hidden");
  drawLightbox();
}

function drawLightbox() {
  const { items, index } = state.lightbox;
  const o = items[index];
  const src = o.local || o.url;
  $(".lb-stage").replaceChildren(o.kind === "video" ? h("video", { src, controls: true, autoplay: true, loop: true }) : h("img", { src, alt: "" }));
  $(".lb-prev").classList.toggle("hidden", items.length < 2);
  $(".lb-next").classList.toggle("hidden", items.length < 2);
}

function closeLightbox() {
  $("#lightbox").classList.add("hidden");
  $(".lb-stage").replaceChildren();
}

function stepLightbox(d) {
  const lb = state.lightbox;
  lb.index = (lb.index + d + lb.items.length) % lb.items.length;
  drawLightbox();
}

// ------------------------------------------------------------------ settings

async function refreshConfig() {
  const cfg = await api("/api/config");
  const pill = $("#keyStatus");
  pill.textContent = cfg.hasKey ? `Key ${cfg.keyPreview}` : "No API key";
  pill.className = `pill ${cfg.hasKey ? "ok" : "bad"}`;
  pill.onclick = openSettings;
  state.config = cfg;
  return cfg;
}

async function openSettings() {
  const cfg = await refreshConfig();
  $("#apiKey").value = "";
  $("#apiKey").placeholder = cfg.hasKey ? `Current: ${cfg.keyPreview} — paste to replace` : "Paste key (id:secret)";
  $("#keyInfo").textContent = cfg.hasKey ? `Using key from ${cfg.keySource}.` : "";
  $("#autoDownload").checked = cfg.autoDownload;
  $("#outputDirInput").value = cfg.outputDir;
  $("#settingsDialog").showModal();
}

async function saveSettings() {
  const body = { autoDownload: $("#autoDownload").checked, outputDir: $("#outputDirInput").value };
  if ($("#apiKey").value.trim()) body.apiKey = $("#apiKey").value.trim();
  await api("/api/config", { method: "POST", body: JSON.stringify(body) });
  await refreshConfig();
  $("#settingsDialog").close();
  toast("Settings saved", "success", 2000);
}

// ------------------------------------------------------------------ boot

function bind() {
  $("#form").addEventListener("submit", generate);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate(e);
    if (!$("#lightbox").classList.contains("hidden")) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    }
  });
  $("#modelSearch").addEventListener("input", renderModelList);
  $("#modelSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#modelList .model-item")?.click();
  });
  $("#extraJson").addEventListener("input", debounce(() => {
    saveDraft();
    updateEstimate();
  }, 400));
  $("#runs").addEventListener("input", updateRunsHint);
  $$(".stepper button").forEach((b) =>
    b.addEventListener("click", () => {
      $("#runs").value = Math.min(50, Math.max(1, (Number($("#runs").value) || 1) + Number(b.dataset.step)));
      updateRunsHint();
    })
  );
  $("#previewJson").addEventListener("click", () => {
    const pre = $("#jsonPreview");
    if (!pre.classList.contains("hidden")) return pre.classList.add("hidden");
    try {
      const inputs = collectInputs();
      pre.textContent = `POST https://queue.fal.run/${state.model.id}\n\n${JSON.stringify(inputs[0], null, 2)}${inputs.length > 1 ? `\n\n(+${inputs.length - 1} more request${inputs.length > 2 ? "s" : ""})` : ""}`;
    } catch (e) {
      pre.textContent = e.message;
    }
    pre.classList.remove("hidden");
  });
  $("#resetForm").addEventListener("click", () => {
    if (!state.root) return;
    state.root.set(undefined);
    $("#extraJson").value = "";
    store.set(draftKey(), null);
    updateRunsHint();
  });
  $$("#filter button").forEach((b) =>
    b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      store.set("filter", state.filter);
      renderJobs();
    })
  );
  $("#clearHistory").addEventListener("click", async () => {
    if (!confirm("Clear finished jobs from the history list? Saved files in your outputs folder are kept.")) return;
    await api("/api/jobs", { method: "DELETE" });
    state.jobs = state.jobs.filter((j) => ACTIVE.has(j.status));
    renderJobs();
  });
  $("#openSettings").addEventListener("click", openSettings);
  $("#saveSettings").addEventListener("click", () => saveSettings().catch((e) => toast(e.message, "error")));
  $("#testKey").addEventListener("click", async () => {
    try {
      if ($("#apiKey").value.trim()) await api("/api/config", { method: "POST", body: JSON.stringify({ apiKey: $("#apiKey").value.trim() }) });
      await api("/api/config/test", { method: "POST" });
      await refreshConfig();
      toast("API key works ✔", "success");
    } catch (e) {
      toast(`Key test failed: ${e.message}`, "error", 8000);
    }
  });
  $("#openFolder").addEventListener("click", () => api("/api/open-folder", { method: "POST" }).then((r) => toast(`Outputs: ${r.dir}`, "info", 4000)).catch((e) => toast(e.message, "error")));
  $("#addModel").addEventListener("click", () => {
    $("#newModelId").value = /\//.test($("#modelSearch").value) ? $("#modelSearch").value.trim() : "";
    $("#newModelName").value = "";
    $("#addModelDialog").showModal();
  });
  $("#saveModel").addEventListener("click", async () => {
    const id = $("#newModelId").value.trim().replace(/^https?:\/\/fal\.ai\/models\//, "").replace(/\/(api|playground)$/, "");
    try {
      const data = await api("/api/models", { method: "POST", body: JSON.stringify({ id, name: $("#newModelName").value.trim() || undefined, category: $("#newModelCategory").value }) });
      state.models = data.models;
      $("#addModelDialog").close();
      $("#modelSearch").value = "";
      selectModel(state.models.find((m) => m.id === id));
    } catch (e) {
      toast(e.message, "error");
    }
  });
  $("#closeUploads").addEventListener("click", () => $("#uploadsDialog").close());
  $(".lb-close").addEventListener("click", closeLightbox);
  $(".lb-prev").addEventListener("click", () => stepLightbox(-1));
  $(".lb-next").addEventListener("click", () => stepLightbox(1));
  $("#lightbox").addEventListener("click", (e) => e.target.id === "lightbox" && closeLightbox());
  $("#toggleSidebar").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

  // Paste an image anywhere (outside text fields) → first reference input.
  document.addEventListener("paste", (e) => {
    if (e.defaultPrevented || !state.root || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const files = [...(e.clipboardData?.files || [])];
    const target = state.root.entries.find(([, c]) => c.isMedia);
    if (files.length && target) {
      e.preventDefault();
      target[1].addFiles(files);
    }
  });
  // Tick elapsed timers on active cards.
  setInterval(() => state.jobs.filter((j) => ACTIVE.has(j.status)).forEach(updateJobCard), 1000);
}

(async function init() {
  bind();
  await refreshConfig().catch(() => {});
  await loadModels();
  state.jobs = await api("/api/jobs").catch(() => []);
  state.jobs.filter((j) => ACTIVE.has(j.status)).forEach((j) => state.polling.add(j.id));
  renderJobs();
  const last = store.get("lastModel", null);
  selectModel(state.models.find((m) => m.id === last) || state.models[0]);
  pollLoop();
  if (state.config && !state.config.hasKey) setTimeout(openSettings, 300);
})();
