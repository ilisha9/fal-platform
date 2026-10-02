"use strict";

// Built-in model catalog. These are shortcuts — any fal endpoint id works via
// "Add model" in the UI, and every model's full settings are loaded live from
// fal's OpenAPI schema, so this list never limits what you can run.

const CATEGORIES = [
  { id: "text-to-image", name: "Text → Image" },
  { id: "image-to-image", name: "Image Edit / Reference" },
  { id: "text-to-video", name: "Text → Video" },
  { id: "image-to-video", name: "Image → Video" },
  { id: "video-to-video", name: "Video → Video" },
  { id: "upscale", name: "Upscale & Utility" },
  { id: "audio", name: "Audio & Speech" },
  { id: "3d", name: "3D" },
];

const m = (id, name, category, description) => ({ id, name, category, description });

const MODELS = [
  // Text → Image
  m("fal-ai/flux/schnell", "FLUX.1 [schnell]", "text-to-image", "Very fast, low-cost FLUX (1–4 steps)."),
  m("fal-ai/flux/dev", "FLUX.1 [dev]", "text-to-image", "High-quality open FLUX model."),
  m("fal-ai/flux-pro/v1.1", "FLUX1.1 [pro]", "text-to-image", "Pro-grade FLUX with strong prompt adherence."),
  m("fal-ai/flux-pro/v1.1-ultra", "FLUX1.1 [pro] ultra", "text-to-image", "Up to 4MP images, raw mode."),
  m("fal-ai/flux-lora", "FLUX.1 [dev] + LoRA", "text-to-image", "FLUX dev with custom LoRA weights."),
  m("fal-ai/flux-krea-lora", "FLUX Krea + LoRA", "text-to-image", "Aesthetic FLUX Krea with LoRA support."),
  m("fal-ai/imagen4/preview", "Imagen 4", "text-to-image", "Google's Imagen 4."),
  m("fal-ai/imagen4/preview/ultra", "Imagen 4 Ultra", "text-to-image", "Highest-quality Imagen 4."),
  m("fal-ai/nano-banana", "Nano Banana (Gemini Image)", "text-to-image", "Google Gemini image generation."),
  m("fal-ai/bytedance/seedream/v4/text-to-image", "Seedream 4.0", "text-to-image", "ByteDance Seedream, up to 4K."),
  m("fal-ai/qwen-image", "Qwen Image", "text-to-image", "Strong text rendering."),
  m("fal-ai/ideogram/v3", "Ideogram 3.0", "text-to-image", "Typography and design."),
  m("fal-ai/recraft/v3/text-to-image", "Recraft V3", "text-to-image", "Vector-art and brand styles."),
  m("fal-ai/hidream-i1-full", "HiDream I1 Full", "text-to-image", "17B open image model."),
  m("fal-ai/stable-diffusion-v35-large", "Stable Diffusion 3.5 Large", "text-to-image", "Stability AI SD 3.5."),

  // Image edit / reference
  m("fal-ai/nano-banana/edit", "Nano Banana Edit", "image-to-image", "Multi-image reference editing with Gemini."),
  m("fal-ai/flux-pro/kontext", "FLUX.1 Kontext [pro]", "image-to-image", "Edit an image with a text instruction."),
  m("fal-ai/flux-pro/kontext/max", "FLUX.1 Kontext [max]", "image-to-image", "Best Kontext quality and typography."),
  m("fal-ai/flux-pro/kontext/max/multi", "FLUX.1 Kontext [max] multi", "image-to-image", "Combine several reference images."),
  m("fal-ai/bytedance/seedream/v4/edit", "Seedream 4.0 Edit", "image-to-image", "Multi-reference editing."),
  m("fal-ai/qwen-image-edit", "Qwen Image Edit", "image-to-image", "Instruction-based edits with text rendering."),
  m("fal-ai/flux/dev/image-to-image", "FLUX.1 [dev] Image-to-Image", "image-to-image", "Restyle an image with FLUX dev."),
  m("fal-ai/ideogram/character", "Ideogram Character", "image-to-image", "Consistent character from a reference."),

  // Text → Video
  m("minimax/h3-max/text-to-video", "MiniMax H3 Max T2V", "text-to-video", "fal-tuned H3: 5–15s, 480p–1080p, synced audio, fast."),
  m("minimax/h3-max/director", "MiniMax H3 Max Director", "text-to-video", "H3 Max with director-style shot control."),
  m("fal-ai/veo3", "Veo 3", "text-to-video", "Google Veo 3 with native audio."),
  m("fal-ai/veo3/fast", "Veo 3 Fast", "text-to-video", "Faster, cheaper Veo 3."),
  m("fal-ai/kling-video/v2.1/master/text-to-video", "Kling 2.1 Master T2V", "text-to-video", "Top-tier Kling motion quality."),
  m("fal-ai/minimax/hailuo-02/standard/text-to-video", "Hailuo 02 Standard T2V", "text-to-video", "MiniMax Hailuo 02, 768p."),
  m("fal-ai/minimax/hailuo-02/pro/text-to-video", "Hailuo 02 Pro T2V", "text-to-video", "MiniMax Hailuo 02, 1080p."),
  m("fal-ai/bytedance/seedance/v1/pro/text-to-video", "Seedance 1.0 Pro T2V", "text-to-video", "ByteDance Seedance, up to 1080p."),
  m("fal-ai/wan/v2.2-a14b/text-to-video", "Wan 2.2 A14B T2V", "text-to-video", "Open Wan 2.2 video model."),
  m("fal-ai/ltxv-13b-098-distilled", "LTX-Video 13B", "text-to-video", "Fast long-form LTX video."),
  m("fal-ai/luma-dream-machine/ray-2", "Luma Ray 2", "text-to-video", "Luma Dream Machine Ray 2."),
  m("fal-ai/pixverse/v5/text-to-video", "PixVerse V5 T2V", "text-to-video", "PixVerse stylised video."),

  // Image → Video
  m("minimax/h3-max/image-to-video", "MiniMax H3 Max I2V", "image-to-video", "Animate a start image; add an end image for first→last keyframes."),
  m("minimax/h3-max/reference-to-video", "MiniMax H3 Max Reference", "image-to-video", "Up to 9 images, 3 videos, 3 audio clips as references."),
  m("minimax/h3-max-turbo/image-to-video", "MiniMax H3 Max Turbo I2V", "image-to-video", "Fastest H3 Max image-to-video."),
  m("fal-ai/kling-video/v2.1/master/image-to-video", "Kling 2.1 Master I2V", "image-to-video", "Animate an image with Kling 2.1 Master."),
  m("fal-ai/kling-video/v2.1/pro/image-to-video", "Kling 2.1 Pro I2V", "image-to-video", "Kling 2.1 Pro, start/end frames."),
  m("fal-ai/kling-video/v2.1/standard/image-to-video", "Kling 2.1 Standard I2V", "image-to-video", "Lower-cost Kling 2.1."),
  m("fal-ai/veo3/image-to-video", "Veo 3 I2V", "image-to-video", "Veo 3 from a start image."),
  m("fal-ai/veo3/fast/image-to-video", "Veo 3 Fast I2V", "image-to-video", "Faster Veo 3 from an image."),
  m("fal-ai/minimax/hailuo-02/standard/image-to-video", "Hailuo 02 Standard I2V", "image-to-video", "MiniMax Hailuo 02 from an image."),
  m("fal-ai/bytedance/seedance/v1/pro/image-to-video", "Seedance 1.0 Pro I2V", "image-to-video", "ByteDance Seedance from an image."),
  m("fal-ai/wan/v2.2-a14b/image-to-video", "Wan 2.2 A14B I2V", "image-to-video", "Open Wan 2.2 from an image."),
  m("fal-ai/luma-dream-machine/ray-2/image-to-video", "Luma Ray 2 I2V", "image-to-video", "Luma Ray 2 from an image."),
  m("fal-ai/pixverse/v5/image-to-video", "PixVerse V5 I2V", "image-to-video", "PixVerse from an image."),

  // Video → Video
  m("fal-ai/wan-vace-14b", "Wan VACE 14B", "video-to-video", "Reference/control-driven video editing."),
  m("fal-ai/luma-dream-machine/ray-2/modify", "Luma Ray 2 Modify", "video-to-video", "Restyle an existing video."),
  m("fal-ai/mmaudio-v2", "MMAudio V2", "video-to-video", "Generate a soundtrack for a video."),
  m("fal-ai/sync-lipsync/v2", "Sync Lipsync 2.0", "video-to-video", "Lip-sync a video to audio."),

  // Upscale & utility
  m("fal-ai/clarity-upscaler", "Clarity Upscaler", "upscale", "Creative detail-adding upscaler."),
  m("fal-ai/topaz/upscale/image", "Topaz Image Upscale", "upscale", "Topaz image enhancement."),
  m("fal-ai/topaz/upscale/video", "Topaz Video Upscale", "upscale", "Topaz video upscaling / frame interpolation."),
  m("fal-ai/birefnet/v2", "BiRefNet v2 Background Removal", "upscale", "Remove image backgrounds."),
  m("fal-ai/esrgan", "ESRGAN Upscale", "upscale", "Fast classic upscaler."),

  // Audio
  m("fal-ai/minimax/speech-02-hd", "MiniMax Speech-02 HD", "audio", "High-quality text-to-speech."),
  m("fal-ai/elevenlabs/tts/multilingual-v2", "ElevenLabs TTS Multilingual v2", "audio", "ElevenLabs text-to-speech."),
  m("fal-ai/stable-audio", "Stable Audio", "audio", "Text-to-music and sound effects."),
  m("fal-ai/minimax-music", "MiniMax Music", "audio", "Song generation from a reference track."),
  m("fal-ai/wizper", "Wizper (Whisper)", "audio", "Fast speech-to-text transcription."),

  // 3D
  m("fal-ai/hunyuan3d/v2", "Hunyuan3D v2", "3d", "Image to textured 3D mesh."),
  m("fal-ai/trellis", "TRELLIS", "3d", "Image to 3D asset."),
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
    properties: { prompt: PROMPT, video_url: str("Video URL") },
    required: ["video_url"],
  },
  upscale: { properties: { image_url: str("Image URL") }, required: ["image_url"] },
  audio: { properties: { prompt: str("Prompt / Text") }, required: [] },
  "3d": { properties: { image_url: str("Image URL") }, required: ["image_url"] },
};

function fallbackSchemaFor(category) {
  return { type: "object", ...(FALLBACKS[category] || FALLBACKS["text-to-image"]) };
}

module.exports = { MODELS, CATEGORIES, fallbackSchemaFor };
