"use strict";

// Built-in model catalog. These are shortcuts — any fal endpoint id works via
// "Add model" in the UI, and every model's full settings are loaded live from
// fal's OpenAPI schema, so this list never limits what you can run.

// Rankings: Artificial Analysis arenas (artificialanalysis.ai), Sep 2026.
// Only top-ranked models are listed; any other fal model can be added in the UI.
const CATEGORIES = [
  { id: "text-to-video", name: "Text → Video" },
  { id: "image-to-video", name: "Image → Video" },
  { id: "reference-to-video", name: "Reference → Video" },
  { id: "video-to-video", name: "Video → Video" },
  { id: "text-to-image", name: "Text → Image" },
  { id: "image-to-image", name: "Image Edit" },
  { id: "other", name: "My models" },
];

const m = (id, name, category, description, rank) => ({ id, name, category, description, rank });

const MODELS = [
  // Text → Video (AA text-to-video arena, Elo)
  m("google/gemini-omni-flash/v1.1/text-to-video", "Gemini Omni Flash 1.1", "text-to-video", "Native audio, 3–10s, up to 4K. $0.03–0.30/s.", "#1 · Elo 1233"),
  m("alibaba/wan-3.0/text-to-video", "Wan 3.0", "text-to-video", "Up to 30s with audio, open weights. $0.05–0.20/s.", "#2 · Elo 1229"),
  m("minimax/h3-max/text-to-video", "MiniMax H3 Max", "text-to-video", "fal-tuned H3, very fast, 5–15s. $0.05–0.32/s.", "#3 · Elo 1227"),
  m("minimax/h3-max-turbo/text-to-video", "MiniMax H3 Max Turbo", "text-to-video", "Fastest H3 Max. $0.025–0.08/s.", "H3 Max tier"),
  m("minimax/h3/text-to-video", "MiniMax H3", "text-to-video", "Base open-weights H3, native 2K, 5–15s. $0.13/s.", "H3 base"),
  m("minimax/h3/text-to-video/lora", "MiniMax H3 + LoRA", "text-to-video", "Base H3 with your own LoRA weights.", "H3 base"),
  m("bytedance/seedance-2.0/text-to-video", "Seedance 2.0", "text-to-video", "Cinematic motion with audio. ~$0.30/s at 720p.", "#4 · Elo 1210"),
  m("bytedance/seedance-2.5/text-to-video", "Seedance 2.5", "text-to-video", "Up to 30s single shot, 720p. Token-billed (~$0.46/s at 720p).", "#3 silent · Elo 1143"),
  m("alibaba/wan-3.0-prime/text-to-video", "Wan 3.0 Prime", "text-to-video", "Higher-quality Wan 3.0 tier. $0.068–0.28/s.", "Wan 3.0 tier"),
  m("fal-ai/veo3.1", "Veo 3.1", "text-to-video", "Google Veo 3.1. $0.20–0.60/s depending on audio/4K.", "top 10"),
  m("fal-ai/veo3.1/fast", "Veo 3.1 Fast", "text-to-video", "Cheaper Veo 3.1. $0.10–0.35/s.", "top 10"),
  m("fal-ai/kling-video/v3/pro/text-to-video", "Kling 3.0 Pro", "text-to-video", "1080p, optional audio. $0.112–0.168/s.", "top 10"),

  // Image → Video (AA image-to-video arena, Elo)
  m("bytedance/seedance-2.0/image-to-video", "Seedance 2.0 I2V", "image-to-video", "Start frame (+ optional end frame). ~$0.30/s at 720p.", "#1 · Elo 1197"),
  m("google/gemini-omni-flash/v1.1/image-to-video", "Gemini Omni Flash 1.1 I2V", "image-to-video", "Start + optional end frame, audio. $0.03–0.30/s.", "#2 · Elo 1192"),
  m("minimax/h3-max/image-to-video", "MiniMax H3 Max I2V", "image-to-video", "Start + optional end frame, 5–15s. $0.05–0.32/s.", "#1 open · Elo 1181"),
  m("minimax/h3-max-turbo/image-to-video", "MiniMax H3 Max Turbo I2V", "image-to-video", "Fastest H3 Max from an image. $0.025–0.08/s.", "H3 Max tier"),
  m("minimax/h3/image-to-video", "MiniMax H3 I2V", "image-to-video", "Base open-weights H3 from an image, 2K.", "#1 open · Elo 1181"),
  m("minimax/h3-max/multi-angle/image-to-video", "MiniMax H3 Max Multi Angle", "image-to-video", "New camera angles of a scene from one image.", "H3 Max tool"),
  m("minimax/h3-max/lip-sync/image-to-video", "MiniMax H3 Max Lip Sync", "image-to-video", "Talking video from one image + 5–15s of audio.", "H3 Max tool"),
  m("alibaba/wan-3.0/image-to-video", "Wan 3.0 I2V", "image-to-video", "Up to 30s from an image. $0.05–0.20/s.", "Wan 3.0"),
  m("bytedance/seedance-2.5/image-to-video", "Seedance 2.5 I2V", "image-to-video", "Start + optional end image; edits/extends. Token-billed.", "new"),
  m("fal-ai/veo3.1/image-to-video", "Veo 3.1 I2V", "image-to-video", "Veo 3.1 from a start image. $0.20–0.60/s.", "#8 · Elo 1085"),
  m("fal-ai/kling-video/v3/pro/image-to-video", "Kling 3.0 Pro I2V", "image-to-video", "1080p, optional audio. $0.112–0.168/s.", "top 10"),

  // Reference → Video
  m("google/gemini-omni-flash/v1.1/reference-to-video", "Gemini Omni Flash 1.1 Reference", "reference-to-video", "Reference images + up to 3 short videos. $0.03–0.30/s.", "#1 family"),
  m("minimax/h3-max/reference-to-video", "MiniMax H3 Max Reference", "reference-to-video", "Up to 9 images, 3 videos, 3 audio clips. $0.05–0.32/s.", "#3 family"),
  m("minimax/h3/reference-to-video", "MiniMax H3 Reference", "reference-to-video", "Base H3, 2K, 9 images/3 videos/3 audio. $0.13/s (+$0.08 per image after 5).", "H3 base"),
  m("alibaba/wan-3.0/reference-to-video", "Wan 3.0 Reference", "reference-to-video", "Omni-reference video. $0.05–0.20/s.", "#2 family"),
  m("bytedance/seedance-2.0/reference-to-video", "Seedance 2.0 Reference", "reference-to-video", "Image/video/audio references; video refs ×0.6 price.", "#4 family"),
  m("bytedance/seedance-2.5/reference-to-video", "Seedance 2.5 Reference", "reference-to-video", "Up to 50 references; video refs ×0.6 price.", "new"),

  // Video → Video
  m("minimax/h3-max/extend-video", "MiniMax H3 Max Extend", "video-to-video", "Continue an existing video by 5–15s from a text prompt.", "H3 Max tool"),
  m("minimax/h3-max/3d-to-video", "MiniMax H3 Max 3D to Video", "video-to-video", "Turn Blender/3D previs renders into photoreal video.", "H3 Max tool"),

  // Text → Image (AA text-to-image arena, Elo)
  m("openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst", "text-to-image", "Most detailed GPT Image. $0.004–0.40 by quality/size.", "#1 · Elo 1197"),
  m("openai/gpt-image-2.5/flare/text-to-image", "GPT Image 2.5 Flare", "text-to-image", "Faster GPT Image 2.5, same price.", "#2 · Elo 1190"),
  m("xai/grok-imagine-image", "Grok Imagine Image", "text-to-image", "xAI image model. ~$0.02–0.08/image.", "#4 · Elo 1155"),
  m("fal-ai/nano-banana-pro", "Nano Banana Pro", "text-to-image", "Google Gemini 3 Pro Image. $0.15 (4K $0.30).", "top tier"),
  m("fal-ai/nano-banana-2", "Nano Banana 2", "text-to-image", "Fast Gemini image. $0.08 (0.5K–4K ×0.75–2).", "top tier"),
  m("fal-ai/flux-2-pro", "FLUX.2 [pro]", "text-to-image", "$0.03 first MP + $0.015/extra MP.", "top tier"),

  // Image edit (AA image-editing arena, Elo)
  m("openai/gpt-image-2.5/sunburst/edit", "GPT Image 2.5 Sunburst Edit", "image-to-image", "Best-ranked editor. Priced by quality/size.", "#1 · Elo 1182"),
  m("openai/gpt-image-2.5/flare/edit", "GPT Image 2.5 Flare Edit", "image-to-image", "Faster GPT Image 2.5 edits.", "#2 · Elo 1162"),
  m("fal-ai/nano-banana-pro/edit", "Nano Banana Pro Edit", "image-to-image", "Multi-image reference editing. $0.15.", "top tier"),
  m("fal-ai/nano-banana-2/edit", "Nano Banana 2 Edit", "image-to-image", "Fast multi-reference edits. $0.08.", "top tier"),
  m("fal-ai/flux-2-pro/edit", "FLUX.2 [pro] Edit", "image-to-image", "Multi-reference edit, per-MP pricing.", "top tier"),
];

// Generic forms used only when fal's live schema can't be fetched.
const str = (title, extra = {}) => ({ type: "string", title, ...extra });
const PROMPT = str("Prompt", { description: "Describe what you want to generate." });
const NEG = str("Negative Prompt", { default: "" });
const SEED = { type: "integer", title: "Seed", description: "Same seed + same settings = same output." };
const IMAGE_SIZE = {
  title: "Image Size",
  anyOf: [
    { type: "string", enum: ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"] },
    { type: "object", properties: { width: { type: "integer", minimum: 64, maximum: 14142 }, height: { type: "integer", minimum: 64, maximum: 14142 } } },
  ],
  default: "landscape_4_3",
};
const NUM_IMAGES = { type: "integer", title: "Num Images", minimum: 1, maximum: 4, default: 1 };
const DURATION = { type: "string", title: "Duration (seconds)", enum: ["5", "10"], default: "5" };
const ASPECT = { type: "string", title: "Aspect Ratio", enum: ["16:9", "9:16", "1:1"], default: "16:9" };

const FALLBACKS = {
  "text-to-image": {
    properties: { prompt: PROMPT, negative_prompt: NEG, image_size: IMAGE_SIZE, num_images: NUM_IMAGES, seed: SEED, enable_safety_checker: { type: "boolean", title: "Enable Safety Checker", default: true } },
    required: ["prompt"],
  },
  "image-to-image": {
    properties: { prompt: PROMPT, image_urls: { type: "array", title: "Image URLs", items: { type: "string" } }, num_images: NUM_IMAGES, seed: SEED },
    required: ["prompt"],
  },
  "text-to-video": {
    properties: { prompt: PROMPT, negative_prompt: NEG, duration: DURATION, aspect_ratio: ASPECT, seed: SEED },
    required: ["prompt"],
  },
  "image-to-video": {
    properties: { prompt: PROMPT, image_url: str("Image URL"), duration: DURATION, negative_prompt: NEG, seed: SEED },
    required: ["prompt", "image_url"],
  },
  "video-to-video": {
    properties: { prompt: PROMPT, video_url: str("Video URL"), duration: DURATION },
    required: ["video_url"],
  },
  "reference-to-video": {
    properties: { prompt: PROMPT, reference_image_urls: { type: "array", title: "Reference Image URLs", items: { type: "string" } }, duration: DURATION, aspect_ratio: ASPECT, seed: SEED },
    required: ["prompt"],
  },
};

function fallbackSchemaFor(category) {
  return { type: "object", ...(FALLBACKS[category] || FALLBACKS["text-to-image"]) };
}

module.exports = { MODELS, CATEGORIES, fallbackSchemaFor };
