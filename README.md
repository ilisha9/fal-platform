# fal Studio

A local web app for running any [fal.ai](https://fal.ai) model — images, video, audio, 3D — from your browser on Windows (also macOS and Linux).

- **Only top-ranked models.** The sidebar lists the highest-ranked models on the [Artificial Analysis](https://artificialanalysis.ai) leaderboards (Sep 2026), with each one's rank shown:
  - **Video:** Gemini Omni Flash 1.1, Wan 3.0, MiniMax H3 Max, Seedance 2.0 / 2.5, Veo 3.1, Kling 3.0. Each has text→video, image→video and reference→video versions where fal offers them.
  - **Images:** GPT Image 2.5 (Sunburst/Flare), Grok Imagine, Nano Banana Pro / 2, FLUX.2 [pro], plus their edit versions.
  - Any other fal model can be added by pasting its endpoint id.
- **Cost estimate before you generate.** The estimate updates live as you change settings (duration, resolution, audio, quality, size, number of images, number of runs) and shows how it was worked out. It uses fal's published prices (checked against fal.ai model pages, 2 Oct 2026). For models without a built-in price, it uses the live unit price from fal's pricing API (`api.fal.ai/v1/models/pricing`). Each result card shows its estimated cost, and the header shows an estimated total for today. These are estimates; fal bills actual usage.
- **All settings.** The form for each model is built from fal's own OpenAPI schema for that model, so every parameter it supports appears automatically: duration (seconds), aspect ratio, resolution, image size (preset or custom width/height), number of images, steps, guidance, seed, LoRAs, safety checker, and so on. Anything new that fal adds shows up without updating this app. **Extra JSON** covers anything else.
- **Reference uploads.** Every image, video or audio input gets a drop zone. Drag files in, click to browse, paste with Ctrl+V, or paste a URL. Files are uploaded to fal's storage (large files use multipart upload). Recent uploads can be reused, and any generated image can be sent back in as a reference with **＋ref**.
- **Number of generations.** Use the model's own `num_images` setting, and/or **Number of generations** to send 1–50 separate requests at once. With a fixed seed, each extra run can use seed + 1.
- **Queue-based.** Requests go through fal's queue API with live status, queue position, logs, and cancel. Jobs keep running if you close the tab, and resume after a restart.
- **Saved locally.** Every output is downloaded to `outputs/<date>/`. History, **Reuse** (load a past job's settings back into the form), a lightbox, and per-model drafts are all included.
- **Key stays private.** Your API key stays in the local server and is never sent to the browser. The app only listens on `127.0.0.1` by default.

## Run it on Windows

1. Install **Node.js 18 or newer** (LTS) from <https://nodejs.org/>. There's nothing else to install, because the app has no npm dependencies.
2. Download this repository (green **Code** button → **Download ZIP**) and unzip it, or `git clone` it.
3. Double-click **`start.bat`**. Your browser opens at <http://localhost:3000>.
4. Click **⚙ Settings**, paste your fal API key from <https://fal.ai/dashboard/keys>, then click **Test key** and **Save**.

To stop the app, close the black console window. To start it again, double-click `start.bat`.

From a terminal it works the same way: `npm start` (opens the browser) or `node server.js`.

macOS/Linux: run `./start.sh`.

## Configuration

Copy `.env.example` to `.env` (`start.bat` does this for you), then edit it:

| Variable  | Default     | Meaning |
|-----------|-------------|---------|
| `FAL_KEY` | (empty)     | API key. Optional, since you can set it in Settings instead (Settings takes priority). |
| `PORT`    | `3000`      | Web app port. |
| `HOST`    | `127.0.0.1` | Set to `0.0.0.0` to use the app from other devices on your network. Anyone who can reach it can spend your fal credits. |

In **Settings** you can also turn off auto-saving and change the output folder.

## Using it

1. Pick a model on the left, or search for one. To use any fal model, paste a full endpoint id such as `fal-ai/kling-video/v2.1/pro/image-to-video` into the search box, or use **＋ Add any fal model**. You can copy the id from the model's page on fal.ai.
2. Fill in the prompt and drop in reference files. Then set the duration, aspect ratio, number of images and anything under **Advanced settings**.
3. Set **Number of generations** if you want several separate runs.
4. Press **Generate**, or Ctrl+Enter.
5. Results appear on the right. From there you can enlarge, download, open the fal URL, copy the seed, **Reuse** the settings, view logs and raw JSON, or delete.

**Request JSON** shows exactly what will be sent to fal.

## How it works

```
browser (public/)  ──►  local server (server.js)  ──►  fal.ai
                         • holds your API key            queue.fal.run   (submit / status / result / cancel)
                         • uploads references            rest.fal.ai     (storage upload)
                         • saves outputs to disk         fal.ai/api/openapi/queue/openapi.json (model schemas)
```

- `server.js` is the HTTP server, the fal queue/storage client, job tracking and output downloads.
- `lib/openapi.js` turns a model's OpenAPI document into a self-contained input schema.
- `public/pricing.js` holds the cost-estimate rules (shared by the browser and the tests).
- `lib/models.js` holds the built-in model catalog and a generic fallback form for when a schema can't be fetched.
- `public/` is the web UI (plain HTML/CSS/JS, no build step).
- `data/` holds config, history, schema cache and the upload list. `outputs/` holds the generated files. Both are git-ignored.

## Tests

```
npm test
```

The tests run the server against a local mock of fal's queue, storage and schema APIs (`test/mock-fal.js`), so they need no network access and use no credits.
