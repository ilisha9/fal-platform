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
  const PRICES_CHECKED = "fal.ai, 2 Oct 2026";

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
  function perSecond(table, { defaultRes = "720p", audioDefault = true, multiplier, minSeconds, fee, assumedSeconds } = {}) {
    return (r) => {
      let res = r.res(defaultRes);
      if (!(res in table)) {
        r.assumptions.push(`no listed rate for ${res}, used ${defaultRes}`);
        res = defaultRes;
      }
      let rate = table[res];
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
  function videoTokens(rates, { defaultRes = "720p", multiplier, inputVideo } = {}) {
    return (r) => {
      const res = r.res(defaultRes);
      const per1k = typeof rates === "number" ? rates : rates[res] ?? rates.default;
      if (inputVideo && r.listLen("reference_video_urls", "video_urls") > 0) r.assumptions.push("input reference video seconds are also billed (not included)");
      const [w, h] = videoDims(res, r.v("aspect_ratio"));
      const secs = r.seconds();
      const tokens = (w * h * secs * 24) / 1024;
      let cost = (tokens / 1000) * per1k;
      const lines = [`${secs}s at ${w}×${h} ≈ ${Math.round(tokens).toLocaleString()} tokens × $${per1k}/1k tokens`];
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

  const videoRefDiscount = (r) =>
    r.listLen("reference_video_urls", "video_urls", "reference_videos") > 0 ? { factor: 0.6, note: "× 0.6 (video references discount)" } : null;

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

  // ---------------------------------------------------------------- curated rules

  const VEO31 = { "720p": [0.2, 0.4], "1080p": [0.2, 0.4], "4k": [0.4, 0.6] };
  const VEO31_FAST = { "720p": [0.1, 0.15], "1080p": [0.1, 0.15], "4k": [0.3, 0.35] };
  const OMNI = { "360p": 0.03, "720p": 0.1, "1080p": 0.15, "4k": 0.3 };
  const WAN3 = { "480p": 0.05, "720p": 0.1, "1080p": 0.2 };
  const WAN3_PRIME = { "480p": 0.068, "720p": 0.14, "1080p": 0.28 };
  const H3MAX = { "480p": 0.05, "768p": 0.08, "1080p": 0.16 };
  const H3MAX_2K = { ...H3MAX, "2k": 0.32 };
  const H3MAX_TURBO = { "480p": 0.025, "768p": 0.04, "1080p": 0.08 };
  const H3MAX_TURBO_2K = { ...H3MAX_TURBO, "2k": 0.16 };
  const H3MAX_INSERT = { "480p": 0.05, "768p": 0.06 };
  const H3MAX_RECAST = { "768p": 0.3, "1080p": 0.45 };
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
  const SEEDANCE25 = { "480p": 0.0214, "720p": 0.0214, "1080p": 0.0234, default: 0.0214 };

  const RULES = {
    // Video
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
    "minimax/h3-max/recast": perSecond(H3MAX_RECAST, { defaultRes: "768p" }),
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
    "bytedance/seedance-2.5/reference-to-video": videoTokens(SEEDANCE25, { multiplier: videoRefDiscount, inputVideo: true }),
    "bytedance/seedance-2.0/text-to-video": videoTokens(SEEDANCE2),
    "bytedance/seedance-2.0/image-to-video": videoTokens(SEEDANCE2),
    "bytedance/seedance-2.0/reference-to-video": videoTokens(SEEDANCE2, { multiplier: videoRefDiscount, inputVideo: true }),
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
