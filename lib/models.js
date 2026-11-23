"use strict";

// Built-in model catalog. These are shortcuts — any fal endpoint id works via
// "Add model" in the UI, and every model's full settings are loaded live from
// fal's OpenAPI schema, so this list never limits what you can run.

// Rankings: Artificial Analysis arenas (artificialanalysis.ai), 23 Nov 2026:
// T2V = AA-Video-T2V v2.1, I2V = AA-Video-I2V v2.1, T2I = AA-Image-T2I v2.1,
// Edit = AA-Image-Editing v2.1. Only top-ranked models (and the tiers/tools of
// those families) are listed; any other fal model can be added in the UI.
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
  // Text → Video
  m("alibaba/wan-3.0/text-to-video", "Wan 3.0", "text-to-video", "Up to 30s with audio, open weights. $0.05–0.20/s.", "#1 T2V · Elo 1174"),
  m("alibaba/wan-3.0-prime/text-to-video", "Wan 3.0 Prime", "text-to-video", "Higher-quality Wan 3.0 tier. $0.068–0.28/s.", "Wan 3.0 tier"),
  m("minimax/h3/text-to-video", "MiniMax H3", "text-to-video", "Open-weights H3, 480p–4K, 5–15s. $0.05–0.16/s.", "#3 T2V · Elo 1163"),
  m("minimax/h3/text-to-video/lora", "MiniMax H3 + LoRA", "text-to-video", "Base H3 with your LoRA. $0.0625–0.20/s.", "H3 base"),
  m("bytedance/seedance-2.5/text-to-video", "Seedance 2.5", "text-to-video", "Up to 30s single shot, up to 4K. Token-billed (~$0.47/s at 720p).", "#5 T2V · Elo 1155"),
  m("bytedance/seedance-2.5/flash/text-to-video", "Seedance 2.5 Flash", "text-to-video", "Faster, cheaper Seedance 2.5, 480p/720p. ~$0.30/s at 720p.", "new · 2.5 tier"),
  m("google/gemini-omni-flash/v1.2/text-to-video", "Gemini Omni Flash 1.2", "text-to-video", "Native audio, 3–15s, up to 4K. $0.027–0.25/s.", "#6 T2V · Elo 1153"),
  m("blackforestlabs/flux-3-max/text-to-video", "FLUX 3 Max", "text-to-video", "fal × BFL, 5–20s with audio, up to 4K. $0.17–0.80/s (35% off to Dec 7).", "#7 T2V · Elo 1150"),
  m("heygen/heygen-video/text-to-video", "HeyGen Video 1", "text-to-video", "Very cheap, 480p–2K. $0.02–0.06/s.", "#8 T2V · Elo 1148"),
  m("minimax/h3-max/text-to-video", "MiniMax H3 Max", "text-to-video", "fal-tuned H3, very fast, 5–15s. $0.05–0.16/s.", "#9 T2V · Elo 1144"),
  m("minimax/h3-max-turbo/text-to-video", "MiniMax H3 Max Turbo", "text-to-video", "Fastest H3 Max. $0.025–0.08/s.", "H3 Max tier"),
  m("blackforestlabs/flux-3/text-to-video", "FLUX 3", "text-to-video", "5–20s with audio, up to 4K. $0.17–0.47/s.", "#10 T2V · Elo 1137"),
  m("bytedance/seedance-2.0/text-to-video", "Seedance 2.0", "text-to-video", "Cinematic motion with audio. ~$0.30/s at 720p.", "#12 T2V · Elo 1133"),
  m("kling/v4/text-to-video", "Kling 4.0", "text-to-video", "720p–4K, optional HDR. $0.157–0.549/s.", "new · not ranked yet"),

  // Image → Video
  m("bytedance/seedance-2.5/image-to-video", "Seedance 2.5 I2V", "image-to-video", "Start + optional end image; edits/extends. Token-billed.", "#1 I2V · Elo 1162"),
  m("bytedance/seedance-2.5/flash/image-to-video", "Seedance 2.5 Flash I2V", "image-to-video", "Faster, cheaper Seedance 2.5 from an image. ~$0.30/s at 720p.", "new · 2.5 tier"),
  m("bytedance/seedance-2.0/image-to-video", "Seedance 2.0 I2V", "image-to-video", "Start frame (+ optional end frame). ~$0.30/s at 720p.", "#4 I2V · Elo 1141"),
  m("minimax/h3/image-to-video", "MiniMax H3 I2V", "image-to-video", "Open-weights H3 from an image, 480p–4K. $0.05–0.16/s.", "#5 I2V · Elo 1136"),
  m("minimax/h3/image-to-video/lora", "MiniMax H3 I2V + LoRA", "image-to-video", "Base H3 from an image with your LoRA. $0.0625–0.20/s.", "H3 base"),
  m("heygen/heygen-video/image-to-video", "HeyGen Video 1 I2V", "image-to-video", "Very cheap, 480p–2K. $0.02–0.06/s.", "#6 I2V · Elo 1127"),
  m("minimax/h3-max/image-to-video", "MiniMax H3 Max I2V", "image-to-video", "Start + optional end frame, 5–15s. $0.05–0.16/s.", "#9 I2V · Elo 1119"),
  m("minimax/h3-max-turbo/image-to-video", "MiniMax H3 Max Turbo I2V", "image-to-video", "Fastest H3 Max from an image. $0.025–0.08/s.", "H3 Max tier"),
  m("minimax/h3-max/camera-controls", "MiniMax H3 Max Camera Controls", "image-to-video", "Multi-angle: keyframed camera orbit/elevation/distance from one image. $0.05–0.16/s.", "H3 Max tool"),
  m("minimax/h3-max/lip-sync/image-to-video", "MiniMax H3 Max Lip Sync", "image-to-video", "Talking video from one image + audio. $0.05–0.32/s of audio.", "H3 Max tool"),
  m("alibaba/wan-3.0/image-to-video", "Wan 3.0 I2V", "image-to-video", "Up to 30s from an image. $0.05–0.20/s.", "#12 I2V · Elo 1110"),
  m("alibaba/wan-3.0-prime/image-to-video", "Wan 3.0 Prime I2V", "image-to-video", "Higher-quality Wan 3.0 from start (+ end) frame. $0.068–0.28/s.", "Wan 3.0 tier"),
  m("google/gemini-omni-flash/v1.2/image-to-video", "Gemini Omni Flash 1.2 I2V", "image-to-video", "Start + optional end frame (≤10s with end), audio. $0.027–0.25/s.", "#15 I2V · Elo 1086"),
  m("blackforestlabs/flux-3/image-to-video", "FLUX 3 I2V", "image-to-video", "5–20s with audio, up to 4K. $0.17–0.47/s.", "#16 I2V · Elo 1072"),
  m("blackforestlabs/flux-3-max/image-to-video", "FLUX 3 Max I2V", "image-to-video", "Start + optional end frame, up to 4K. $0.17–0.80/s (35% off to Dec 7).", "#17 I2V · Elo 1067"),
  m("kling/v4/image-to-video", "Kling 4.0 I2V", "image-to-video", "Start/middle/end frames, 720p–4K, optional HDR. $0.157–0.549/s.", "new · not ranked yet"),

  // Reference → Video (rank shown is the family's best video rank)
  m("bytedance/seedance-2.5/reference-to-video", "Seedance 2.5 Reference", "reference-to-video", "Up to 50 references (@Image1…); cheaper rate with video refs.", "#1 I2V family"),
  m("bytedance/seedance-2.5/flash/reference-to-video", "Seedance 2.5 Flash Reference", "reference-to-video", "Faster, cheaper Seedance 2.5 references; video refs ×0.614.", "new · 2.5 tier"),
  m("alibaba/wan-3.0/reference-to-video", "Wan 3.0 Reference", "reference-to-video", "Omni-reference video. $0.05–0.20/s.", "#1 T2V family"),
  m("alibaba/wan-3.0-prime/reference-to-video", "Wan 3.0 Prime Reference", "reference-to-video", "Higher-quality Wan 3.0 references. $0.068–0.28/s.", "Wan 3.0 tier"),
  m("minimax/h3/reference-to-video", "MiniMax H3 Reference", "reference-to-video", "9 images/3 videos/3 audio. $0.05–0.16/s (+$0.08 per image after 5).", "#3 T2V family"),
  m("minimax/h3/reference-to-video/lora", "MiniMax H3 Reference + LoRA", "reference-to-video", "Base H3 references with your LoRA. $0.0625–0.20/s.", "H3 base"),
  m("minimax/h3-max/reference-to-video", "MiniMax H3 Max Reference", "reference-to-video", "Up to 9 images, 3 videos, 3 audio clips. $0.05–0.16/s (+ref tokens over 4,096).", "H3 Max"),
  m("minimax/h3-max-turbo/reference-to-video", "MiniMax H3 Max Turbo Reference", "reference-to-video", "Turbo references. $0.05–0.16/s (+ref tokens over 4,096).", "H3 Max tier"),
  m("google/gemini-omni-flash/v1.2/reference-to-video", "Gemini Omni Flash 1.2 Reference", "reference-to-video", "Up to 10 images + 3 videos (≤15s each). $0.027–0.25/s + tokens.", "#6 T2V family"),
  m("heygen/heygen-video/reference-to-video", "HeyGen Video 1 Reference", "reference-to-video", "9 images/3 videos/3 audio, very cheap. $0.02–0.06/s.", "#8 T2V family"),
  m("bytedance/seedance-2.0/reference-to-video", "Seedance 2.0 Reference", "reference-to-video", "Image/video/audio references; cheaper rate with video refs.", "#4 I2V family"),
  m("kling/v4/reference-to-video", "Kling 4.0 Reference", "reference-to-video", "Images, elements and video refs, 720p–4K. $0.094–0.549/s.", "new · not ranked yet"),

  // Video → Video
  m("google/gemini-omni-flash/v1.2/edit", "Gemini Omni Flash 1.2 Edit", "video-to-video", "Edit a video (≤15s) with a simple instruction. $0.027–0.25/s.", "Omni 1.2"),
  m("google/gemini-omni-flash/v1.2/extend", "Gemini Omni Flash 1.2 Extend", "video-to-video", "Continue a video; only new seconds billed. $0.027–0.25/s.", "Omni 1.2"),
  m("google/gemini-omni-flash/v1.2/upscale", "Gemini Omni Flash 1.2 Upscale", "video-to-video", "Upscale to 720p/1080p/4K. $0.041–0.164/s.", "Omni 1.2"),
  m("minimax/h3-max/extend-video", "MiniMax H3 Max Extend", "video-to-video", "Continue a video by 5–15s, up to 2K. $0.05–0.32/s.", "H3 Max tool"),
  m("minimax/h3-max-turbo/extend-video", "MiniMax H3 Max Turbo Extend", "video-to-video", "Fast 1–15s continuation, up to 2K. $0.025–0.16/s.", "H3 Max tier"),
  m("minimax/h3-max/3d-to-video", "MiniMax H3 Max 3D to Video", "video-to-video", "Blender/3D previs to photoreal video. $0.05–0.16/s + $0.50/request.", "H3 Max tool"),
  m("minimax/h3-max/insert-video", "MiniMax H3 Max Insert", "video-to-video", "Insert a new scene into a video. $0.05–0.06/s of new scene.", "H3 Max tool"),
  m("minimax/h3-max/recast", "MiniMax H3 Max Recast", "video-to-video", "Recast people from reference photos. $0.085–0.17/s + input video tokens.", "H3 Max tool"),
  m("minimax/h3-max/reframe-video", "MiniMax H3 Max Reframe", "video-to-video", "Change a video's aspect ratio by generating new edges. $0.05–0.16/s.", "H3 Max tool"),
  m("minimax/h3-max/relight", "MiniMax H3 Max Relight", "video-to-video", "Relight a video from a reference image. $0.05–0.32/s.", "H3 Max tool"),

  // Text → Image
  m("openai/gpt-image-2.6/sunburst/text-to-image", "GPT Image 2.6 Sunburst", "text-to-image", "Most detailed GPT Image. Priced by quality/size.", "#1 T2I · Elo 1264"),
  m("openai/gpt-image-2.5/sunburst/text-to-image", "GPT Image 2.5 Sunburst", "text-to-image", "$0.004–0.40 by quality/size.", "#2 T2I · Elo 1230"),
  m("openai/gpt-image-2.6/flare/text-to-image", "GPT Image 2.6 Flare", "text-to-image", "Faster GPT Image 2.6, same price.", "#3 T2I · Elo 1227"),
  m("microsoft/mai-image-2.7/text-to-image", "MAI-Image-2.7", "text-to-image", "Microsoft, 1K/2K. ~$0.035 per 1K image.", "#4 T2I · Elo 1214"),
  m("openai/gpt-image-2.5/flare/text-to-image", "GPT Image 2.5 Flare", "text-to-image", "Faster GPT Image 2.5, same price.", "#5 T2I · Elo 1210"),
  m("kling/v4/text-to-image", "Kling Image 4.0", "text-to-image", "2K–8K output. $0.063–0.157 per image.", "#7 T2I · Elo 1180"),
  m("google/nano-banana-2.1", "Nano Banana 2.1", "text-to-image", "Google, 1K–4K. $0.040–0.134 per image.", "#8 T2I · Elo 1175"),
  m("xai/grok-imagine-image/v2.0/text-to-image", "Grok Imagine Image 2.0", "text-to-image", "xAI, 1K–2K. $0.04–0.08 per image.", "#10 T2I · Elo 1166"),
  m("microsoft/mai-image-2.7/flash/text-to-image", "MAI-Image-2.7 Flash", "text-to-image", "Fast MAI 2.7. ~$0.010 per 1K image.", "#11 T2I · Elo 1160"),
  m("bytedance/seedream/v5.5/text-to-image", "Seedream 5.5", "text-to-image", "ByteDance, up to 2K. $0.03–0.0405 per image.", "#14 T2I · Elo 1135"),

  // Image edit
  m("microsoft/mai-image-2.7/edit", "MAI-Image-2.7 Edit", "image-to-image", "Best-ranked editor, up to 5 references. ~$0.043 per 1K edit.", "#1 Edit · Elo 1215"),
  m("openai/gpt-image-2.6/sunburst/edit", "GPT Image 2.6 Sunburst Edit", "image-to-image", "Up to 16 references. Priced by quality/size.", "#2 Edit · Elo 1211"),
  m("openai/gpt-image-2.6/flare/edit", "GPT Image 2.6 Flare Edit", "image-to-image", "Faster GPT Image 2.6 edits.", "#3 Edit · Elo 1205"),
  m("openai/gpt-image-2.5/sunburst/edit", "GPT Image 2.5 Sunburst Edit", "image-to-image", "Priced by quality/size.", "#4 Edit · Elo 1201"),
  m("openai/gpt-image-2.5/flare/edit", "GPT Image 2.5 Flare Edit", "image-to-image", "Faster GPT Image 2.5 edits.", "#5 Edit · Elo 1185"),
  m("kling/v4/image-to-image", "Kling Image 4.0 Edit", "image-to-image", "Up to 10 references, 2K–8K. $0.063–0.157 + $0.003/ref.", "#6 Edit · Elo 1183"),
  m("microsoft/mai-image-2.7/flash/edit", "MAI-Image-2.7 Flash Edit", "image-to-image", "Fast MAI 2.7 edits. ~$0.013 per 1K edit.", "#7 Edit · Elo 1179"),
  m("bytedance/seedream/v5.5/edit", "Seedream 5.5 Edit", "image-to-image", "Multi-reference edits. $0.03–0.0405 + $0.012/ref.", "#8 Edit · Elo 1159"),
  m("krea/v3/edit", "Krea 3 Edit", "image-to-image", "Up to 8 references. $0.025 per megapixel (output + refs).", "#9 Edit · Elo 1153"),
  m("google/nano-banana-2.1/edit", "Nano Banana 2.1 Edit", "image-to-image", "Multi-image edits, 1K–4K. $0.040–0.134 per image.", "#10 Edit · Elo 1152"),
  m("xai/grok-imagine-image/v2.0/edit", "Grok Imagine Image 2.0 Edit", "image-to-image", "xAI edits. $0.04–0.08 + $0.01 per input image.", "#24 Edit · Elo 1117"),
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
