"use strict";
// Cost estimates for fal models, computed from the request settings.
//
// Curated rules below come from fal's published model pricing (researched
// Oct 2026). For any model without a rule, the estimate falls back to the live
// unit price from fal's Platform API (GET https://api.fal.ai/v1/models/pricing).
// fal bills the real amount; these numbers are estimates.
//
// Works both in the browser (window.FalPricing) and in Node (require).

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FalPricing = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PRICES_CHECKED = "fal.ai, checked 23 Nov 2026";

  // ---------------------------------------------------------------- input readers

  function reader(input, defaults) {
    const v = (k) => (input && input[k] !== undefined && input[k] !== null ? input[k] : defaults ? defaults[k] : undefined);
    const assumptions = [];

    const seconds = (fallback = 5) => {
      const d = v("duration");
      if (String(d).toLowerCase() === "auto") {
        assumptions.push(`duration "auto" — assumed ${fallback}s`);
        return fallback;
      }
      if (d !== undefined) {
        const n = parseFloat(String(d));
        if (Number.isFinite(n)) return n;
      }
      const frames = v("num_frames");
      if (frames !== undefined) {
        const fps = Number(v("frames_per_second") ?? v("fps") ?? 24);
        return Number(frames) / fps;
      }
      assumptions.push(`assumed ${fallback}s duration`);
      return fallback;
    };

    const res = (fallback) => {
      const r = v("resolution") ?? v("video_resolution");
      if (r === undefined) return fallback;
      return String(r).toLowerCase().replace(/\s+/g, "");
    };

    const audio = (fallback = true) => {
      for (const k of ["generate_audio", "enable_audio", "with_audio", "audio"]) {
        const a = v(k);
        if (typeof a === "boolean") return a;
      }
      return fallback;
    };

    const count = () => Math.max(1, Number(v("num_images") ?? v("num_outputs") ?? 1) || 1);

    const listLen = (...keys) => keys.reduce((n, k) => n + (Array.isArray(input && input[k]) ? input[k].length : input && input[k] ? 1 : 0), 0);

    return { v, seconds, res, audio, count, listLen, assumptions };
  }

  const PRESET_SIZES = {
    square_hd: [1024, 1024],
    square: [512, 512],
    portrait_4_3: [768, 1024],
    portrait_16_9: [576, 1024],
    landscape_4_3: [1024, 768],
    landscape_16_9: [1024, 576],
  };

  function ratio(ar) {
    const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(ar || ""));
    return m ? Number(m[1]) / Number(m[2]) : null;
  }

  // Output image dimensions from whichever size setting the model uses.
  function imageDims(r, fallback = [1024, 1024]) {
    for (const key of ["image_size", "size"]) {
      const s = r.v(key);
      if (s && typeof s === "object" && s.width && s.height) return [Number(s.width), Number(s.height)];
      if (typeof s === "string") {
        if (PRESET_SIZES[s]) return PRESET_SIZES[s];
        const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(s);
        if (m) return [Number(m[1]), Number(m[2])];
      }
    }
    const res = String(r.v("resolution") || "").toUpperCase();
    const long = { "0.5K": 512, "1K": 1024, "2K": 2048, "4K": 4096 }[res];
    if (long) {
      const ar = ratio(r.v("aspect_ratio")) || 1;
      return ar >= 1 ? [long, Math.round(long / ar)] : [Math.round(long * ar), long];
    }
    if (r.v("image_size") === undefined && r.v("size") === undefined) r.assumptions.push(`assumed ${fallback[0]}×${fallback[1]}`);
    return fallback;
  }

  // Pixel dimensions for a video resolution label + aspect ratio.
  function videoDims(label, aspectRatio) {
    const short = { "360p": 360, "480p": 480, "540p": 540, "720p": 720, "768p": 768, "1080p": 1080, "2k": 1440, "4k": 2160 }[label] || 720;
    const ar = ratio(aspectRatio) || 16 / 9;
    return ar >= 1 ? [Math.round(short * ar), short] : [short, Math.round(short / ar)];
  }

  const money = (n) => (n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(4)}`);

  // ---------------------------------------------------------------- rule builders

  // Per-second price chosen by resolution (and optionally audio on/off).
  // table: { "720p": 0.1 } or { "720p": [silent, withAudio] }
  // promo: { until: ISO date, table, label } uses `table` until that moment.
  // aliases: map a model's resolution names to table keys (e.g. 1440p → 2k).
  // addPerSecond: [{ param, table, label }] extra per-second charge when param is true.
  function perSecond(table, { defaultRes = "720p", audioDefault = true, multiplier, minSeconds, fee, assumedSeconds, promo, aliases, addPerSecond } = {}) {
    return (r) => {
      let promoNote = "";
      let tbl = table;
      if (promo && Date.now() < Date.parse(promo.until)) {
        tbl = promo.table;
        promoNote = promo.label;
      }
      let res = r.res(defaultRes);
      if (aliases && aliases[res]) res = aliases[res];
      if (!(res in tbl)) {
        r.assumptions.push(`no listed rate for ${res}, used ${defaultRes}`);
        res = defaultRes;
      }
      let rate = tbl[res];
      let audioNote = "";
      if (Array.isArray(rate)) {
        const on = r.audio(audioDefault);
        rate = rate[on ? 1 : 0];
        audioNote = on ? ", audio on" : ", audio off";
      }
      let secs = r.seconds(assumedSeconds || 5);
      if (minSeconds && secs < minSeconds) secs = minSeconds;
      let cost = rate * secs;
      const lines = [`${secs}s × ${money(rate)}/s (${res}${audioNote})`];
      if (promoNote) lines.push(promoNote);
      for (const a of addPerSecond || []) {
        if (r.v(a.param) === true && a.table[res]) {
          cost += a.table[res] * secs;
          lines.push(`+ ${secs}s × ${money(a.table[res])}/s ${a.label}`);
        }
      }
      if (fee) {
        cost += fee.amount;
        lines.push(`+ ${money(fee.amount)} ${fee.label}`);
      }
      if (multiplier) {
        const m = multiplier(r);
        if (m && m.add) {
          cost += m.add;
          lines.push(m.note);
        } else if (m && m.factor !== undefined && m.factor !== 1) {
          cost *= m.factor;
          lines.push(m.note);
        }
      }
      return { cost, lines };
    };
  }

  // Token-billed video (Seedance): tokens = width × height × seconds × 24 / 1024.
  // refRates: per-1k rates used instead when any video reference is attached.
  function videoTokens(rates, { defaultRes = "720p", multiplier, inputVideo, refRates } = {}) {
    return (r) => {
      const res = r.res(defaultRes);
      const hasVideoRef = r.listLen("reference_video_urls", "video_urls") > 0;
      const pick = (t) => (typeof t === "number" ? t : t[res] ?? t.default);
      const per1k = refRates && hasVideoRef ? pick(refRates) : pick(rates);
      if (refRates && hasVideoRef) r.assumptions.push("reduced rate for video references");
      if (inputVideo && r.listLen("reference_video_urls", "video_urls") > 0) r.assumptions.push("input reference video seconds are also billed (not included)");
      const [w, h] = videoDims(res, r.v("aspect_ratio"));
      const secs = r.seconds();
      const tokens = (w * h * secs * 24) / 1024;
      let cost = (tokens / 1000) * per1k;
      const lines = [`${secs}s at ${w}×${h} ≈ ${Math.round(tokens).toLocaleString()} tokens × $${+per1k.toFixed(6)}/1k tokens`];
      if (multiplier) {
        const m = multiplier(r);
        if (m && m.factor !== 1) {
          cost *= m.factor;
          lines.push(m.note);
        }
      }
      return { cost, lines };
    };
  }

  function perImage(base, { resMultipliers, extras } = {}) {
    return (r) => {
      const n = r.count();
      let unit = base;
      const lines = [];
      if (resMultipliers) {
        const res = String(r.v("resolution") || "1K").toUpperCase();
        const m = resMultipliers[res] ?? 1;
        unit = base * m;
        lines.push(`${n} image${n > 1 ? "s" : ""} × ${money(unit)} (${res})`);
      } else {
        lines.push(`${n} image${n > 1 ? "s" : ""} × ${money(unit)}`);
      }
      let cost = unit * n;
      if (extras) {
        for (const e of extras) {
          if (e.equals !== undefined ? r.v(e.param) === e.equals : r.v(e.param) === true) {
            cost += e.price;
            lines.push(`+ ${money(e.price)} ${e.label}`);
          }
        }
      }
      return { cost, lines };
    };
  }

  // FLUX.2 [pro]: $0.03 first output MP + $0.015 per extra MP (input and output), rounded up.
  function fluxMegapixel(first, extra, { inputKeys = [] } = {}) {
    return (r) => {
      const [w, h] = imageDims(r);
      const outMp = Math.max(1, Math.ceil((w * h) / 1048576));
      const inputs = r.listLen(...inputKeys);
      if (inputs) r.assumptions.push("each input image counted as 1 MP");
      const perImg = first + extra * (outMp - 1 + inputs);
      const n = r.count();
      return {
        cost: perImg * n,
        lines: [`${n} × (${money(first)} first MP + ${outMp - 1 + inputs} extra MP × ${money(extra)}) at ${w}×${h}`],
      };
    };
  }

  // GPT Image 2.5: fal's per-image table by size and quality (prompt/input tokens extra).
  function gptImage() {
    const QUAL = ["low", "medium", "high", "xhigh", "max"];
    const TABLE = [
      [1024, 768, [0.00402, 0.00903, 0.03612, 0.0642, 0.14445]],
      [1024, 1024, [0.00588, 0.01317, 0.05268, 0.09366, 0.21072]],
      [1536, 1024, [0.00474, 0.01029, 0.04116, 0.07377, 0.16464]],
      [1920, 1080, [0.00441, 0.01029, 0.0396, 0.07041, 0.1584]],
      [2560, 1440, [0.00615, 0.01434, 0.05529, 0.09828, 0.2211]],
      [3840, 2160, [0.01113, 0.02595, 0.10008, 0.1779, 0.40026]],
    ];
    return (r) => {
      let quality = String(r.v("quality") ?? "high").toLowerCase();
      if (!QUAL.includes(quality)) {
        r.assumptions.push(`quality "${quality}" priced as high`);
        quality = "high";
      }
      const [w, h] = imageDims(r);
      const big = Math.max(w, h);
      const small = Math.min(w, h);
      // Closest table size by pixel count and shape, ignoring orientation.
      const score = (t) => Math.abs(Math.log((t[0] * t[1]) / (big * small))) + Math.abs(Math.log(t[0] / t[1] / (big / small)));
      const row = TABLE.reduce((best, t) => (score(t) < score(best) ? t : best));
      const unit = row[2][QUAL.indexOf(quality)];
      const n = r.count();
      return { cost: unit * n, lines: [`${n} × ${money(unit)} (${quality}, priced as ${row[0]}×${row[1]})`, "prompt & input-image tokens not included"] };
    };
  }

  // Per-image price looked up from a setting (e.g. resolution), plus per-input fees.
  function imageBy(param, table, { fallback, perInput, inputKeys = ["image_urls"], extras, normalize = (x) => x } = {}) {
    return (r) => {
      let key = normalize(String(r.v(param) ?? fallback));
      if (!(key in table)) {
        r.assumptions.push(`no listed price for ${param} "${key}", used ${fallback}`);
        key = fallback;
      }
      const n = r.count();
      const unit = table[key];
      let cost = unit * n;
      const lines = [`${n} image${n > 1 ? "s" : ""} × ${money(unit)} (${key})`];
      const inputs = r.listLen(...inputKeys);
      if (perInput && inputs) {
        const add = perInput.perOutput ? perInput.price * inputs * n : perInput.price * inputs;
        cost += add;
        lines.push(`+ ${inputs} input image${inputs > 1 ? "s" : ""} × ${money(perInput.price)}${perInput.perOutput && n > 1 ? ` × ${n} outputs` : ""}`);
      }
      for (const e of extras || []) {
        if (e.equals !== undefined ? r.v(e.param) === e.equals : r.v(e.param) === true) {
          cost += e.price * n;
          lines.push(`+ ${money(e.price)} ${e.label}`);
        }
      }
      return { cost, lines };
    };
  }

  // MAI-Image-2.7: billed by image tokens (1 token per 1,024 pixels).
  function maiImage(outPerM, inPerM) {
    return (r) => {
      const res = String(r.v("resolution") ?? "1K").toUpperCase();
      const outTokens = res === "2K" ? 4096 : 1024;
      const n = r.count();
      let cost = (outTokens / 1e6) * outPerM * n;
      const lines = [`${n} × ${outTokens.toLocaleString()} image tokens × $${outPerM}/M (${res})`];
      const inputs = r.listLen("image_urls");
      if (inPerM && inputs) {
        cost += (inputs * 1024 / 1e6) * inPerM;
        lines.push(`+ ${inputs} input image${inputs > 1 ? "s" : ""} × ~1,024 tokens × $${inPerM}/M`);
      }
      r.assumptions.push("prompt tokens not included");
      return { cost, lines };
    };
  }

  // Krea 3 Edit: $0.025 per megapixel of output plus each reference (capped at output size).
  function kreaMegapixel(perMp) {
    return (r) => {
      const [w, h] = imageDims(r);
      const outMp = (w * h) / 1048576;
      const refs = r.listLen("image_urls");
      if (refs) r.assumptions.push("each reference counted at the output size");
      const mp = outMp * (1 + refs);
      return { cost: mp * perMp, lines: [`${mp.toFixed(2)} MP (output${refs ? ` + ${refs} reference${refs > 1 ? "s" : ""}` : ""}) × ${money(perMp)}/MP`] };
    };
  }

  // Grok Imagine Image 2.0: by quality (low/medium) and resolution (1K/2K).
  function grokImage(perInput) {
    const T = { "1k": { low: 0.04, medium: 0.06 }, "2k": { low: 0.06, medium: 0.08 } };
    return (r) => {
      let res = String(r.v("resolution") ?? "1k").toLowerCase();
      let q = String(r.v("quality") ?? "medium").toLowerCase();
      if (res === "1.5k") {
        r.assumptions.push("1.5K priced as 2K");
        res = "2k";
      }
      if (!T[res]) res = "1k";
      if (!T[res][q]) {
        r.assumptions.push(`quality "${q}" priced as medium`);
        q = "medium";
      }
      const n = r.count();
      const unit = T[res][q];
      let cost = unit * n;
      const lines = [`${n} × ${money(unit)} (${q}, ${res.toUpperCase()})`];
      const inputs = r.listLen("image_urls");
      if (perInput && inputs) {
        cost += perInput * inputs;
        lines.push(`+ ${inputs} input image${inputs > 1 ? "s" : ""} × ${money(perInput)}`);
      }
      return { cost, lines };
    };
  }

  // Kling 4.0 reference: with video references the cheaper rate applies to
  // input + output seconds, billed as at least twice the output duration.
  function klingRef(table, refTable, hdr) {
    const base = perSecond(table, { defaultRes: "1080p", addPerSecond: [hdr] });
    return (r) => {
      if (r.listLen("video_urls") === 0) return base(r);
      const res = r.res("1080p");
      const rate = refTable[res] ?? refTable["1080p"];
      const secs = r.seconds();
      const billable = secs * 2;
      r.assumptions.push("billed as input + output seconds, at least 2× output (input length not known)");
      return { cost: rate * billable, lines: [`${billable} billable s × ${money(rate)}/s (${res}, video reference rate)`] };
    };
  }

  // Omni 1.2 Upscale: price depends on source → target resolution.
  function omniUpscale(r) {
    const target = r.res("1080p");
    const rate = target === "4k" ? 0.1638 : 0.041;
    r.assumptions.push(target === "4k" ? "any source → 4K" : "assumes source one step lower (360p→1080p costs $0.0819/s)");
    r.assumptions.push("billed by your source video's length");
    const secs = r.seconds(5);
    return { cost: rate * secs, lines: [`${secs}s × ${money(rate)}/s (to ${target})`] };
  }

  // H3 Max Recast: per output second (5s minimum) + input video tokens over 4,096
  // at $0.022/1k; one second of input ≈ 6,750 tokens. Output length = source length.
  function recast(r) {
    const res = r.res("768p");
    const rate = { "768p": 0.085, "1080p": 0.17 }[res] ?? 0.085;
    const secs = Math.max(5, r.seconds(5));
    const extraTokens = Math.max(0, secs * 6750 - 4096);
    const tokenCost = (extraTokens / 1000) * 0.022;
    r.assumptions.push("billed by your source video's length");
    return {
      cost: rate * secs + tokenCost,
      lines: [`${secs}s × ${money(rate)}/s (${res})`, `+ ~${Math.round(extraTokens).toLocaleString()} input video tokens × $0.022/1k`],
    };
  }

  // ---------------------------------------------------------------- curated rules

  const VEO31 = { "720p": [0.2, 0.4], "1080p": [0.2, 0.4], "4k": [0.4, 0.6] };
  const VEO31_FAST = { "720p": [0.1, 0.15], "1080p": [0.1, 0.15], "4k": [0.3, 0.35] };
  // Omni Flash 1.2: per second by resolution, plus input tokens at $1.50 per million.
  const OMNI12 = { "360p": 0.0273, "720p": 0.0819, "1080p": 0.1229, "4k": 0.2457 };
  const withNote = (rule, note) => (r) => {
    r.assumptions.push(note);
    return rule(r);
  };
  const OMNI12_TOKENS = "input tokens ($1.50/M) not included";
  const OMNI = { "360p": 0.03, "720p": 0.1, "1080p": 0.15, "4k": 0.3 };
  const WAN3 = { "480p": 0.05, "720p": 0.1, "1080p": 0.2 };
  const WAN3_PRIME = { "480p": 0.068, "720p": 0.14, "1080p": 0.28 };
  const H3MAX = { "480p": 0.05, "768p": 0.08, "1080p": 0.16 };
  const H3MAX_2K = { ...H3MAX, "2k": 0.32 };
  const H3MAX_TURBO = { "480p": 0.025, "768p": 0.04, "1080p": 0.08 };
  const H3MAX_TURBO_2K = { ...H3MAX_TURBO, "2k": 0.16 };
  const H3MAX_INSERT = { "480p": 0.05, "768p": 0.06 };
  const H3 = { "480p": 0.05, "768p": 0.06, "2k": 0.13, "4k": 0.16 };
  const H3_LORA = { "480p": 0.0625, "768p": 0.075, "2k": 0.1625, "4k": 0.2 };
  // H3 Max reference: 4,096 reference tokens included; a square image is 1,024 tokens;
  // extra tokens cost $0.02 per 1,000 (each square image after the 4th ≈ $0.02048).
  const h3MaxRefTokens = (r) => {
    const imgs = r.listLen("reference_image_urls");
    if (r.listLen("reference_video_urls", "reference_audio_urls")) r.assumptions.push("video/audio reference tokens not included");
    const extra = Math.max(0, imgs * 1024 - 4096);
    return extra ? { add: (extra / 1000) * 0.02, note: `+ ${extra.toLocaleString()} reference tokens × $0.02/1k (images counted as square)` } : null;
  };
  // Lip sync bills by the audio length, ×1.2 over 15 seconds.
  const lipSyncLong = (r) => (r.seconds(5) > 15 ? { factor: 1.2, note: "× 1.2 (over 15s)" } : null);
  // Base H3 reference: first 5 reference images free, $0.08 per extra image.
  const h3ExtraImages = (r) => {
    const extra = Math.max(0, r.listLen("reference_image_urls", "image_urls") - 5);
    return extra ? { add: extra * 0.08, note: `+ ${extra} extra reference image${extra > 1 ? "s" : ""} × $0.08` } : null;
  };
  const KLING3_PRO = { "1080p": [0.112, 0.168] };
  const NB2_RES = { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 };
  const WEB_SEARCH = [{ param: "enable_web_search", price: 0.015, label: "web search" }];
  const NB2_EXTRAS = [...WEB_SEARCH, { param: "thinking_level", equals: "high", price: 0.002, label: "high thinking" }];
  const SEEDANCE2 = { "480p": 0.014, "720p": 0.014, "1080p": 0.014, "4k": 0.008, default: 0.014 };
  const SEEDANCE2_VIDEO_REF = { "480p": 0.0086016, "720p": 0.0086016, "1080p": 0.0086016, "4k": 0.0048, default: 0.0086016 };
  const SEEDANCE25 = { "480p": 0.0214, "720p": 0.0214, "1080p": 0.0234, "4k": 0.0094, default: 0.0214 };
  const SEEDANCE25_VIDEO_REF = { "480p": 0.0128, "720p": 0.0128, "1080p": 0.014, "4k": 0.0058, default: 0.0128 };
  const SEEDANCE25_FLASH = 0.014;
  const SEEDANCE25_FLASH_VIDEO_REF = 0.014 * 0.614;
  // FLUX 3 Max: 35% off through Dec 7, 2026 (UTC); regular rates from Dec 8.
  const FLUX3MAX = { "720p": 0.17, "1080p": 0.29, "2k": 0.4, "4k": 0.8 };
  const FLUX3MAX_PROMO = { until: "2026-12-08T00:00:00Z", label: "35% off promo (until Dec 7)", table: { "720p": 0.1105, "1080p": 0.1885, "2k": 0.26, "4k": 0.52 } };
  const FLUX3 = { "720p": 0.17, "1080p": 0.29, "2k": 0.32, "4k": 0.47 };
  const FLUX3_ALIASES = { "1440p": "2k", "2160p": "4k" };
  const HEYGEN = { "480p": 0.02, "768p": 0.02, "1080p": 0.06, "2k": 0.06 };
  const KLING4 = { "720p": 0.157, "1080p": 0.235, "4k": 0.549 };
  const KLING4_VIDEO_REF = { "720p": 0.094, "1080p": 0.141, "4k": 0.329 };
  const KLING4_HDR = { param: "hdr", table: { "1080p": 0.047, "4k": 0.078 }, label: "HDR" };

  const RULES = {
    // Video
    "google/gemini-omni-flash/v1.2/text-to-video": withNote(perSecond(OMNI12), OMNI12_TOKENS),
    "google/gemini-omni-flash/v1.2/image-to-video": withNote(perSecond(OMNI12), OMNI12_TOKENS),
    "google/gemini-omni-flash/v1.2/reference-to-video": withNote(perSecond(OMNI12), "reference & text tokens not included"),
    // Edit bills the edited output, which is as long as the source video (no duration setting).
    "google/gemini-omni-flash/v1.2/edit": withNote(perSecond(OMNI12), `billed by your source video's length; ${OMNI12_TOKENS}`),
    "google/gemini-omni-flash/v1.2/extend": withNote(perSecond(OMNI12), OMNI12_TOKENS),
    "google/gemini-omni-flash/v1.2/upscale": omniUpscale,
    "blackforestlabs/flux-3-max/text-to-video": perSecond(FLUX3MAX, { promo: FLUX3MAX_PROMO }),
    "blackforestlabs/flux-3-max/image-to-video": perSecond(FLUX3MAX, { promo: FLUX3MAX_PROMO }),
    "blackforestlabs/flux-3/text-to-video": perSecond(FLUX3, { aliases: FLUX3_ALIASES }),
    "blackforestlabs/flux-3/image-to-video": perSecond(FLUX3, { aliases: FLUX3_ALIASES }),
    "heygen/heygen-video/text-to-video": perSecond(HEYGEN, { defaultRes: "768p" }),
    "heygen/heygen-video/image-to-video": perSecond(HEYGEN, { defaultRes: "768p" }),
    "heygen/heygen-video/reference-to-video": perSecond(HEYGEN, { defaultRes: "768p" }),
    "kling/v4/text-to-video": perSecond(KLING4, { defaultRes: "1080p", addPerSecond: [KLING4_HDR] }),
    "kling/v4/image-to-video": perSecond(KLING4, { defaultRes: "1080p", addPerSecond: [KLING4_HDR] }),
    "kling/v4/reference-to-video": klingRef(KLING4, KLING4_VIDEO_REF, KLING4_HDR),
    "minimax/h3-max-turbo/reference-to-video": perSecond(H3MAX, { defaultRes: "768p", multiplier: (r) => {
      const m = h3MaxRefTokens(r);
      return m && { add: m.add * 0.8, note: m.note.replace("$0.02/1k", "$0.016/1k") };
    } }),
    "minimax/h3-max/reframe-video": withNote(perSecond(H3MAX, { defaultRes: "768p" }), "billed by your source video's length (long videos bill overlap seconds too)"),
    "minimax/h3-max/relight": withNote(perSecond(H3MAX_2K, { defaultRes: "768p" }), "billed by your source video's length"),
    "bytedance/seedance-2.5/flash/text-to-video": videoTokens(SEEDANCE25_FLASH),
    "bytedance/seedance-2.5/flash/image-to-video": videoTokens(SEEDANCE25_FLASH),
    "bytedance/seedance-2.5/flash/reference-to-video": videoTokens(SEEDANCE25_FLASH, { refRates: SEEDANCE25_FLASH_VIDEO_REF, inputVideo: true }),
    "google/gemini-omni-flash/v1.1/text-to-video": perSecond(OMNI),
    "google/gemini-omni-flash/v1.1/image-to-video": perSecond(OMNI),
    "google/gemini-omni-flash/v1.1/reference-to-video": perSecond(OMNI),
    "alibaba/wan-3.0/text-to-video": perSecond(WAN3),
    "alibaba/wan-3.0/image-to-video": perSecond(WAN3),
    "alibaba/wan-3.0/reference-to-video": perSecond(WAN3),
    "alibaba/wan-3.0-prime/text-to-video": perSecond(WAN3_PRIME),
    "alibaba/wan-3.0-prime/image-to-video": perSecond(WAN3_PRIME),
    "alibaba/wan-3.0-prime/reference-to-video": perSecond(WAN3_PRIME),
    "minimax/h3-max/text-to-video": perSecond(H3MAX, { defaultRes: "768p" }),
    "minimax/h3-max/image-to-video": perSecond(H3MAX, { defaultRes: "768p" }),
    "minimax/h3-max/reference-to-video": perSecond(H3MAX, { defaultRes: "768p", multiplier: h3MaxRefTokens }),
    "minimax/h3-max/extend-video": perSecond(H3MAX_2K, { defaultRes: "768p", multiplier: h3MaxRefTokens }),
    "minimax/h3-max/camera-controls": perSecond(H3MAX, { defaultRes: "768p" }),
    "minimax/h3-max/insert-video": perSecond(H3MAX_INSERT, { defaultRes: "768p", multiplier: h3MaxRefTokens }),
    "minimax/h3-max/recast": recast,
    "minimax/h3-max/lip-sync/image-to-video": perSecond(H3MAX_2K, { defaultRes: "768p", multiplier: lipSyncLong }),
    "minimax/h3-max/3d-to-video": perSecond(H3MAX, { defaultRes: "768p", minSeconds: 5, fee: { amount: 0.5, label: "processing fee" }, multiplier: h3MaxRefTokens }),
    "minimax/h3-max-turbo/text-to-video": perSecond(H3MAX_TURBO, { defaultRes: "768p" }),
    "minimax/h3-max-turbo/image-to-video": perSecond(H3MAX_TURBO, { defaultRes: "768p" }),
    "minimax/h3-max-turbo/extend-video": perSecond(H3MAX_TURBO_2K, { defaultRes: "768p" }),
    "minimax/h3/text-to-video": perSecond(H3, { defaultRes: "2k" }),
    "minimax/h3/image-to-video": perSecond(H3, { defaultRes: "2k" }),
    "minimax/h3/reference-to-video": perSecond(H3, { defaultRes: "2k", multiplier: h3ExtraImages }),
    "minimax/h3/text-to-video/lora": perSecond(H3_LORA, { defaultRes: "2k" }),
    "minimax/h3/image-to-video/lora": perSecond(H3_LORA, { defaultRes: "2k" }),
    "minimax/h3/reference-to-video/lora": perSecond(H3_LORA, { defaultRes: "2k" }),
    "bytedance/seedance-2.5/text-to-video": videoTokens(SEEDANCE25),
    "bytedance/seedance-2.5/image-to-video": videoTokens(SEEDANCE25),
    "bytedance/seedance-2.5/reference-to-video": videoTokens(SEEDANCE25, { refRates: SEEDANCE25_VIDEO_REF, inputVideo: true }),
    "bytedance/seedance-2.0/text-to-video": videoTokens(SEEDANCE2),
    "bytedance/seedance-2.0/image-to-video": videoTokens(SEEDANCE2),
    "bytedance/seedance-2.0/reference-to-video": videoTokens(SEEDANCE2, { refRates: SEEDANCE2_VIDEO_REF, inputVideo: true }),
    "fal-ai/veo3.1": perSecond(VEO31),
    "fal-ai/veo3.1/image-to-video": perSecond(VEO31),
    "fal-ai/veo3.1/fast": perSecond(VEO31_FAST),
    "fal-ai/veo3.1/fast/image-to-video": perSecond(VEO31_FAST),
    "fal-ai/kling-video/v3/pro/text-to-video": perSecond(KLING3_PRO, { defaultRes: "1080p" }),
    "fal-ai/kling-video/v3/pro/image-to-video": perSecond(KLING3_PRO, { defaultRes: "1080p" }),

    // Images
    "openai/gpt-image-2.5/sunburst/text-to-image": gptImage(),
    "openai/gpt-image-2.5/flare/text-to-image": gptImage(),
    "openai/gpt-image-2.5/sunburst/edit": gptImage(),
    "openai/gpt-image-2.5/flare/edit": gptImage(),
    // GPT Image 2.6 bills at the same token rates as 2.5; fal publishes no 2.6 size table.
    "openai/gpt-image-2.6/sunburst/text-to-image": withNote(gptImage(), "approx.: GPT Image 2.5's table (same token rates)"),
    "openai/gpt-image-2.6/flare/text-to-image": withNote(gptImage(), "approx.: GPT Image 2.5's table (same token rates)"),
    "openai/gpt-image-2.6/sunburst/edit": withNote(gptImage(), "approx.: GPT Image 2.5's table (same token rates)"),
    "openai/gpt-image-2.6/flare/edit": withNote(gptImage(), "approx.: GPT Image 2.5's table (same token rates)"),
    "microsoft/mai-image-2.7/text-to-image": maiImage(34),
    "microsoft/mai-image-2.7/flash/text-to-image": maiImage(10),
    "microsoft/mai-image-2.7/edit": maiImage(34, 8),
    "microsoft/mai-image-2.7/flash/edit": maiImage(10, 2.5),
    "kling/v4/text-to-image": imageBy("resolution", { "2K": 0.063, "4K": 0.094, "8K": 0.157 }, { fallback: "2K" }),
    "kling/v4/image-to-image": imageBy("resolution", { "2K": 0.063, "4K": 0.094, "8K": 0.157 }, { fallback: "2K", perInput: { price: 0.003 }, inputKeys: ["image_urls", "elements"] }),
    "google/nano-banana-2.1": withNote(imageBy("resolution", { "1K": 0.04, "2K": 0.059, "4K": 0.134 }, { fallback: "1K", extras: WEB_SEARCH }), "thinking tokens can add a little"),
    "google/nano-banana-2.1/edit": withNote(imageBy("resolution", { "1K": 0.04, "2K": 0.059, "4K": 0.134 }, { fallback: "1K", perInput: { price: 0.002 }, extras: WEB_SEARCH }), "thinking tokens can add a little"),
    "xai/grok-imagine-image/v2.0/text-to-image": grokImage(0),
    "xai/grok-imagine-image/v2.0/edit": grokImage(0.01),
    "bytedance/seedream/v5.5/text-to-image": imageBy("image_size", { "auto_2K": 0.0405, standard: 0.03 }, { fallback: "standard", normalize: (x) => (x === "auto_2K" ? x : "standard") }),
    "bytedance/seedream/v5.5/edit": imageBy("image_size", { "auto_2K": 0.0405, standard: 0.03 }, { fallback: "standard", normalize: (x) => (x === "auto_2K" ? x : "standard"), perInput: { price: 0.012, perOutput: true } }),
    "krea/v3/edit": kreaMegapixel(0.025),
    "fal-ai/nano-banana-pro": perImage(0.15, { resMultipliers: { "1K": 1, "2K": 1, "4K": 2 }, extras: WEB_SEARCH }),
    "fal-ai/nano-banana-pro/edit": perImage(0.15, { resMultipliers: { "1K": 1, "2K": 1, "4K": 2 }, extras: WEB_SEARCH }),
    "fal-ai/nano-banana-2": perImage(0.08, { resMultipliers: NB2_RES, extras: NB2_EXTRAS }),
    "fal-ai/nano-banana-2/edit": perImage(0.08, { resMultipliers: NB2_RES, extras: NB2_EXTRAS }),
    "xai/grok-imagine-image": perImage(0.02),
    "fal-ai/flux-2-pro": fluxMegapixel(0.03, 0.015),
    "fal-ai/flux-2-pro/edit": fluxMegapixel(0.03, 0.015, { inputKeys: ["image_urls", "image_url"] }),
  };

  // ---------------------------------------------------------------- generic (live price)

  function fromLivePrice(live, r) {
    const unit = String(live.unit || "").toLowerCase();
    const p = Number(live.unit_price);
    if (!Number.isFinite(p)) return null;
    if (/image/.test(unit)) {
      const n = r.count();
      return { cost: p * n, lines: [`${n} × ${money(p)} per ${live.unit}`] };
    }
    if (/second|sec\b|^s$/.test(unit)) {
      const s = r.seconds();
      return { cost: p * s, lines: [`${s}s × ${money(p)}/s (base rate; resolution/audio may change it)`] };
    }
    if (/megapixel|\bmp\b/.test(unit)) {
      const [w, h] = imageDims(r);
      const mp = Math.max(1, Math.ceil((w * h) / 1048576));
      const n = r.count();
      return { cost: p * mp * n, lines: [`${n} × ${mp} MP × ${money(p)}/MP`] };
    }
    if (/video|request|generation|call|clip|run|output|unit/.test(unit)) {
      return { cost: p, lines: [`${money(p)} per ${live.unit}`] };
    }
    return { cost: null, lines: [`${money(p)} per ${live.unit} (can't estimate this unit from settings)`] };
  }

  /**
   * @param endpointId fal endpoint id
   * @param input      request input (one run)
   * @param opts       { defaults: schema defaults, live: { unit_price, unit, currency } }
   * @returns { perRequest, lines, assumptions, source } or null when no price is known
   */
  function estimate(endpointId, input, { defaults = {}, live } = {}) {
    const r = reader(input, defaults);
    const rule = RULES[endpointId];
    let out = null;
    let source = null;
    if (rule) {
      out = rule(r);
      source = `fal price list (${PRICES_CHECKED})`;
    } else if (live) {
      out = fromLivePrice(live, r);
      source = "fal pricing API";
    }
    if (!out) return null;
    return {
      perRequest: out.cost,
      lines: out.lines,
      assumptions: r.assumptions,
      source,
      currency: (live && live.currency) || "USD",
    };
  }

  return { estimate, hasRule: (id) => id in RULES, money, RULES, PRICES_CHECKED };
});
