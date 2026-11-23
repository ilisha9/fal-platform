"use strict";
// Prompt guides: the prompting standards each model family's makers (or fal)
// publish, condensed into tips, a template, and a worked example per mode.
// Examples are written to each guide's rules and use the model's own
// reference-tag syntax. Researched Nov 2026; see each guide's sources.
//
// Works in the browser (window.FalGuides) and in Node (require).

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FalGuides = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const GUIDES = [
    {
      id: "heygen",
      title: "HeyGen Video 1",
      match: [/^heygen\/heygen-video\//],
      // HeyGen labels references <Picture 1>, <Video 1>, <Audio 1> (fal's schema doesn't say).
      tagStyle: { name: "<Picture 1>", format: (m, n) => (m === "Image" ? `<Picture ${n}>` : `<${m} ${n}>`) },
      sources: [{ label: "HeyGen Video developer docs", url: "https://developers.heygen.com/docs/models/heygen-video" }],
      tips: [
        "Long prompts beat short ones: a few hundred to a few thousand characters gives clearly better output.",
        "Name the camera, not the mood: \"Shot on an ARRI Alexa Mini LF, 50mm T2, locked off on a tripod\" changes the image; \"cinematic\" does almost nothing.",
        "Ask for texture, then forbid the correction: add \"no retouching, no beauty filter, no glamour lighting\" (and \"no teal-orange grade\" for muted colour).",
        "Rule out invented branding: \"no logos, brand names, printed words or badges anywhere in frame\".",
        "Lettering: keep it short, spelled exactly, and named as the only lettering in frame.",
        "Prefer stillness: a static camera with the subject wearing or holding the object is most reliable; close hand work degrades fastest.",
        "Say where things touch and that the contact holds, or gestures land near the target instead of on it.",
        "Direct the sound: room tone, specific effects and their distance. Say \"no music\" if you don't want a bed. Dialogue fits at about 2.5 words per second.",
        "It follows the brief literally: no dialogue unless you write some.",
        "Reference-to-video: address files as <Picture 1>, <Video 1>, <Audio 1> in list order (type @ in the prompt to insert them).",
      ],
      examples: {
        "text-to-video": {
          settings: { duration: 6 },
          prompt:
            "A warehouse supervisor in her forties, in a plain grey work coat, stands beside a conveyor line and speaks to camera, calm and matter-of-fact: \"Every crate gets checked twice before it leaves this floor.\" Shot on an ARRI Alexa Mini LF, 50mm T2, locked off on a tripod, eye level. Natural skin texture with visible pores and fine lines; no retouching, no beauty filter, no glamour lighting. Muted colour under cool overhead fluorescents; no teal-orange grade. No logos, brand names, printed words or badges anywhere in frame. Sound: steady conveyor rumble at medium distance, a forklift reversing alarm far behind her, her voice close and dry. No music.",
        },
        "image-to-video": {
          settings: { duration: 5 },
          prompt:
            "Starting from the image, the baker lifts the tray of bread out of the oven with both hands and sets it down on the steel counter; the tray's edge rests flat on the counter and stays there. Static camera, 35mm, warm light from the oven. No retouching, no beauty filter. No logos or printed words anywhere in frame. Sound: the oven door thudding shut, the tray scraping steel, a kitchen extractor fan humming. No music.",
        },
        "reference-to-video": {
          settings: { duration: 5 },
          prompt:
            "The woman in <Picture 1> wears the backpack from <Picture 2> and stands still on a mountain ridge trail, speaking to camera with a quiet grin: \"Twelve kilos, and I barely feel it.\" The backpack's straps sit on her shoulders and stay put. Static camera, 35mm, flat overcast light. Natural skin texture; no retouching, no beauty filter. No logos or printed words except those already on the backpack. Sound: wind across the ridge, gravel shifting underfoot, her voice close. No music.",
        },
      },
    },
    {
      id: "minimax-h3",
      title: "MiniMax H3 / H3 Max",
      match: [/^minimax\/h3/],
      sources: [
        { label: "fal: MiniMax H3 prompting guide", url: "https://fal.ai/learn/devs/minimax-h3-prompting-guide" },
        { label: "fal: How to use MiniMax H3 Max", url: "https://fal.ai/learn/tools/how-to-use-minimax-h3-max" },
      ],
      tips: [
        "Precision beats length: a specific noun and verb survive to the render; a pile of adjectives hands the decision back to the model.",
        "Shortest useful prompt: one sentence of picture and one of sound, for one subject doing one physical thing.",
        "For moments that must land on a mark, use timed beats (\"0.0 to 3.5s: …\") and make them add up to the duration you set.",
        "Dialogue goes in double quotes with a delivery direction (\"quiet and unhurried\"); lip sync and room acoustics come in the same pass.",
        "Name concrete sound sources (tape ripping, a chair creaking), not moods. Close with \"No on-screen text\".",
        "Reference-to-video: call files Image 1, Video 1, Audio 1 (numbered per type) and give each one a purpose. Up to 9 images, 3 videos, 3 audio clips (12 files).",
        "Your prompt is rewritten by prompt expansion: \"balanced\" adds ~1s; \"quality\" can take ~30s.",
        "H3 Max: start at 768P and 5–10 seconds. For 2K/4K output use base MiniMax H3.",
      ],
      template:
        "[Format/genre and setting], [lens and camera position].\n0.0 to X s: [first action]\nX to Y s: [next action, starting from the last]\nY to END s: [final action / line of dialogue in quotes, with delivery]\n[Light, lens, film look].\nSound: [specific sources, room tone, when cues land]. No music, no on-screen text.",
      examples: {
        "text-to-video": {
          settings: { duration: 8 },
          prompt:
            "A night-market noodle stall in Taipei, shot at eye level on a 35mm lens. 0.0 to 3.0s: the cook, a man in his sixties in a white apron, tosses noodles in a blackened wok as flames lick up its side. 3.0 to 6.0s: the camera slides left along the counter as a young woman in a yellow raincoat sits down and wipes rain off her glasses. 6.0 to 8.0s: he slides a steaming bowl in front of her and says, warm and gruff: \"Eat it while it's hot.\" Neon signs reflect in the wet street behind them, light rain, shallow focus. Sound: oil crackling, the ladle scraping the wok, rain drumming on the tarp roof, distant scooters. No music, no on-screen text.",
        },
        "image-to-video": {
          settings: { duration: 5 },
          prompt:
            "She turns from the window toward the camera and breaks into a small smile, lifting one hand to tuck her hair behind her ear. The camera slowly pushes in from a medium shot to a close-up. The curtain moves slightly in a draft. Sound: quiet room tone, a kettle beginning to whistle in the next room. No on-screen text.",
        },
        "reference-to-video": {
          settings: { duration: 8 },
          prompt:
            "The woman in Image 1 walks through the street market in Image 2 at dusk, matching the handheld camera and walking rhythm of Video 1. Image 1 controls only her face, hair and jacket; Image 2 controls only the location and light; Video 1 controls only the camera movement. She stops at a fruit stall, picks up an orange and smiles at the vendor. Audio 1 plays faintly from a radio at the stall. Sound: crowd chatter, paper bags rustling. No on-screen text, no added logos.",
        },
        "minimax/h3-max/extend-video": {
          settings: { duration: 5 },
          prompt:
            "Continue from the last frame: the camera keeps tracking the cyclist as she crests the hill, then slows and settles on a wide view of the valley at sunrise. Sound: wind, the freewheel ticking, birdsong rising. No on-screen text.",
        },
        "minimax/h3-max-turbo/extend-video": {
          settings: { duration: 5 },
          prompt:
            "Continue from the last frame: the camera keeps tracking the cyclist as she crests the hill, then slows and settles on a wide view of the valley at sunrise. Sound: wind, the freewheel ticking, birdsong rising. No on-screen text.",
        },
        "minimax/h3-max/insert-video": {
          prompt:
            "A new scene: a close-up of the chef's hands slicing scallions on a wooden board, steam drifting across frame, then the camera tilts up to his face as he glances toward the door. Match the original footage's lighting and colour. Sound: knife on wood, kitchen hum.",
        },
        "minimax/h3-max/recast": {
          prompt: "The person on the left becomes the woman in the first reference photo. Keep the original motion, camera moves, cuts and audio.",
        },
        "minimax/h3-max/3d-to-video": {
          prompt:
            "Photoreal version of this previs: a rain-soaked alley at night, wet asphalt reflecting neon signs, a courier in a dark green rain jacket riding through on a bicycle. Keep the source render's layout, camera path and timing exactly. Sound: rain, tyres on wet ground, distant traffic. No on-screen text.",
        },
        "minimax/h3-max/reframe-video": {
          prompt: "Extend the scene naturally into the new edges: more of the beach and sky on both sides, matching the original light, colour and grain. No new people, objects or on-screen text.",
        },
        "minimax/h3-max/camera-controls": {
          prompt: "A white lighthouse on a rocky cliff at golden hour, waves breaking on the rocks below and gulls circling. Sound: surf, wind, gull cries. No on-screen text.",
        },
      },
    },
    {
      id: "seedance",
      title: "Seedance 2.5 / 2.0",
      match: [/^bytedance\/seedance-2/],
      sources: [{ label: "fal: Seedance 2.5 prompting guide", url: "https://fal.ai/learn/devs/seedance-2-5-prompting-guide" }],
      tips: [
        "Long durations need a timeline: more seconds don't add events, so give each block an action that starts from the state the last one left.",
        "Write the cause before the reaction, and say where fluid motion (water, cloth, smoke) ends.",
        "Give the camera a position inside the frame and say when it starts and stops moving.",
        "Give each reference one job: \"@Image1 controls only the product\", and say what not to copy (\"Do not copy the background from @Image1\"). Don't let an image and a video do the same job.",
        "Write dialogue as a performance: what happens before, during and after the line, with its own time block.",
        "End with an ending state: where the character, objects and camera are in the final frame.",
        "When a result misses, change one thing: rewrite only the beat that went wrong.",
        "Image-to-video: the start frame (and optional end frame) set the look; describe the motion between them.",
        "Reference mode: tag files as @Image1, @Video1, @Audio1 (type @ in the prompt to insert them).",
      ],
      template:
        "FORMAT\n[Duration], [aspect ratio], [single take or cuts], [real-time or specified speed]\n\nREFERENCE ROLES\n@Image1 controls only [identity / product / wardrobe / environment].\nDo not copy [pose / background / lighting / text] from @Image1.\n\nSTARTING STATE\n[Positions, held objects, camera position]\n\nTIMELINE\n0-X seconds: [first action]\nX-Y seconds: [next action, starting from the result of the first]\nY-Z seconds: [final action and settling]\n\nCAMERA\n[Path, screen position, when it starts and stops]\n\nCONTINUITY\n[Identity, objects, direction, clothing that must not change]\n\nAUDIO\n[Dialogue, room tone, contact sounds, music or silence]\n\nENDING STATE\n[Final positions of character, objects and camera]\n\nCONSTRAINTS\n[No cuts / slow motion / extra objects / text]",
      examples: {
        "text-to-video": {
          settings: { duration: 10 },
          prompt:
            "FORMAT\n10 seconds, 16:9, single continuous take, real-time speed.\n\nSTARTING STATE\nA bike messenger in a red helmet stands outside a corner shop at night, phone in her right hand. Camera at chest height, three metres behind her.\n\nTIMELINE\n0-3 seconds: She pockets the phone and pushes the glass door open with her left shoulder.\n3-7 seconds: Inside, she pulls a green bottle from the cooler with her right hand and sets it on the counter; the clerk scans it.\n7-10 seconds: She taps her card, nods once and walks back out, the door swinging shut behind her.\n\nCAMERA\nHandheld, follows her inside at the same distance, stops at the counter and lets her exit frame left.\n\nCONTINUITY\nThe red helmet stays on. Once the bottle leaves the cooler it stays in her right hand.\n\nAUDIO\nDoor chime, cooler hum, scanner beep, street traffic outside. No music.\n\nENDING STATE\nEmpty doorway, the door settling closed, the clerk looking down at the register.\n\nCONSTRAINTS\nNo cuts, no slow motion, no on-screen text or logos.",
        },
        "image-to-video": {
          settings: { duration: 6 },
          prompt:
            "6 seconds, single take, real-time speed. 0-2 seconds: she lifts the cup from the saucer with her right hand. 2-4 seconds: she blows across it once and takes a slow sip. 4-6 seconds: she lowers the cup and looks out of the rain-streaked window. Camera locked off at table height. Audio: ceramic on the saucer, rain on the glass, quiet café murmur. No music. Ending state: cup back on the saucer, her gaze on the window.",
        },
        "reference-to-video": {
          settings: { duration: 8 },
          prompt:
            "REFERENCE ROLES\n@Image1 controls only the product: the matte white kettle's shape, materials and logo.\n@Image2 controls only the kitchen layout and morning light.\nDo not copy the studio background from @Image1. Do not redesign the kettle based on @Image2.\n\n8 seconds, 16:9, single take.\n0-3 seconds: a hand places the kettle from @Image1 on the counter in @Image2.\n3-6 seconds: steam starts to rise as the camera slowly pushes in.\n6-8 seconds: the kettle clicks off and sunlight catches its handle.\n\nAUDIO\nWater coming to the boil, the click of the switch, birdsong outside. No music.\n\nCONSTRAINTS\nNo cuts, no on-screen text, no extra products.",
        },
      },
    },
    {
      id: "wan",
      title: "Wan 3.0 / Wan 3.0 Prime",
      match: [/^alibaba\/wan-3/],
      sources: [
        { label: "Alibaba Model Studio: video prompt guide (official)", url: "https://help.aliyun.com/en/model-studio/text-to-video-prompt" },
        { label: "fal: How to use Wan 3", url: "https://fal.ai/learn/tools/how-to-use-wan-3" },
      ],
      tips: [
        "Basic formula: Entity + Scene + Motion. Advanced: add entity/scene/motion detail, aesthetic control (light, shot size, angle, lens, camera move) and a style.",
        "Image-to-video formula: Motion + Camera movement. The image already sets subject, scene and style; write \"fixed camera\" to hold the frame.",
        "Sound formula: voice = line + emotion + tone + speed + timbre + accent; sound effect = source + action + ambience; music = score + style.",
        "Spoken lines written as X says: \"…\" are kept exactly. Write \"No dialogue.\" or \"No background music.\" to suppress them.",
        "Multi-shot: an overall description, then \"Shot 1 [0–3 s] …, Shot 2 [3–6 s] …\". For one unbroken take write \"Generate single shot.\"",
        "References: \"Image 1\" / \"Video 1\" (capitalised, with a space), numbered per type in upload order, e.g. \"the cat in Image 1 plays in the room in Image 2\".",
        "Prompt expansion rewrites your text: be concrete (named lens, lit direction, colours, speed). \"Cinematic\" and \"epic\" get absorbed and do nothing.",
      ],
      template:
        "[Overall description: theme, tone, core event.]\nShot 1 [0–X s] [subject + action + camera].\nShot 2 [X–Y s] Hard cut, [framing], [action / line: Name says, \"…\", in a [tone] voice].\nShot 3 [Y–END s] [final beat].\nSound: [voices, effects, ambience]. [No background music.]",
      examples: {
        "text-to-video": {
          settings: { duration: 10 },
          prompt:
            "A short, bittersweet film about a lighthouse keeper's last night on duty.\nShot 1 [0–3 s] Wide shot of a white lighthouse on a cliff at dusk, the lamp beginning to turn, waves breaking on the rocks below.\nShot 2 [3–7 s] Hard cut, medium close-up inside the lamp room: an old man in a cable-knit sweater wipes the glass and says softly, \"Forty years. Not one night missed,\" in a slow, gravelly voice.\nShot 3 [7–10 s] Hard cut, fixed camera from outside the window as he switches off the radio and looks out to sea.\nSound: wind against the glass, a distant foghorn, the radio crackling off. No background music.",
        },
        "image-to-video": {
          settings: { duration: 5 },
          prompt:
            "The dancer spins twice, quickly, and lands softly, her skirt flaring out, then slowly holds the final pose. The camera slowly orbits right around her. Sound: shoes on a wooden stage, fabric swishing, a few claps from the dark at the end. No background music.",
        },
        "reference-to-video": {
          settings: { duration: 6 },
          prompt:
            "The cat in Image 1 plays in the living room in Image 2, batting at a ball of red yarn, then leaps onto the sofa and curls up. Fixed camera at floor level, warm afternoon sunlight through the window. Sound: soft thumps on the rug, a contented purr. No dialogue. No background music.",
        },
      },
    },
    {
      id: "omni",
      title: "Gemini Omni Flash 1.2",
      match: [/^google\/gemini-omni-flash\//],
      sources: [
        { label: "Google DeepMind: Gemini Omni prompt guide (official)", url: "https://deepmind.google/models/gemini-omni/prompt-guide/" },
        { label: "Runware: Gemini Omni Flash 1.2 prompting", url: "https://runware.ai/docs/models/google-gemini-omni-flash-1-2/guides/prompting" },
      ],
      tips: [
        "Cover the five elements: shot framing and motion, style, lighting, location and action.",
        "Don't over-prescribe: Omni uses world knowledge, so say what you want and let it fill in the details.",
        "Camera language works: \"one continuous shot\" or \"oner\", \"static\" / \"locked off\", \"push in\", \"dolly zoom\", \"film camera\", \"webcam style\".",
        "For a finished sequence, write \"Cut to\" for each new shot and place beats with bracketed timecodes, one per line, ending at your duration.",
        "Edits: ask for one specific change in plain words (\"Change the bee into a swarm of fireflies\") and repeat for further changes.",
        "Text rendering works: say the words, placement and animation style.",
        "References are sent in list order before your prompt, with no tags: describe them, e.g. \"the woman in the first image\".",
        "With an end frame the clip is capped at 10 seconds.",
      ],
      template:
        "[Subject, location, time of day, style.]\n[0-Xs] [Framing + action].\n[X-Ys] Cut to [framing + action].\n[Y-ENDs] Cut to [final beat].\n[Lighting.] Sound: [effects, voices, music].",
      examples: {
        "text-to-video": {
          settings: { duration: 8 },
          prompt:
            "A street drummer plays upturned buckets in a tiled subway station during the evening rush, documentary style.\n[0-3s] Wide shot from the far end of the platform as commuters stream past him.\n[3-6s] Cut to a low close-up of his sticks hammering the buckets, sweat flying.\n[6-8s] Cut to a medium shot as a train pulls in behind him and he ends on a crash, grinning at a child who stopped to watch.\nHarsh fluorescent light with warm spill from the train windows. Sound: the drumming echoing off the tiles, footsteps, the train's brakes squealing.",
        },
        "image-to-video": {
          settings: { duration: 8 },
          prompt:
            "Animate this photo: the old fisherman hauls the net in hand over hand, water streaming off it, then pauses and squints up at the sky. Slow push-in with a slight handheld feel. Golden-hour light. Sound: water splashing, the wooden boat creaking, gulls overhead.",
        },
        "reference-to-video": {
          settings: { duration: 8 },
          prompt:
            "The woman in the first image walks into the café from the second image and orders at the counter, then turns and laughs at something off camera. One continuous shot, the camera drifting alongside her. Warm morning light. Sound: an espresso machine hissing, cups clinking, quiet chatter.",
        },
        "google/gemini-omni-flash/v1.2/edit": {
          prompt: "Change the daytime sky to a stormy night with distant lightning, keeping everything else the same.",
        },
        "google/gemini-omni-flash/v1.2/extend": {
          settings: { duration: 8 },
          prompt: "Continue the scene: the camera keeps following the car as it turns onto the coastal road and accelerates toward the sunset.",
        },
      },
    },
    {
      id: "flux3",
      title: "FLUX 3 / FLUX 3 Max",
      match: [/^blackforestlabs\/flux-3/],
      sources: [
        { label: "Black Forest Labs: FLUX 3 text-to-video prompting (official)", url: "https://docs.bfl.ai/guides/prompting_video_text_to_video" },
        { label: "fal: FLUX 3 examples + prompting guide", url: "https://fal.ai/learn/tools/flux-3-video-examples-prompts" },
      ],
      tips: [
        "Direct a scene, don't list objects: say what happens, how subjects move, how the camera behaves and the atmosphere.",
        "Default shape: \"[camera] shot of [subject] [action] in [environment]. [supporting visual and motion details]\".",
        "Short prompts let the model fill in a story; long prompts give precision. Start short, then add only the details that matter.",
        "Timesteps for actions that must land on time: two or three beats per 5 seconds, and mark HARD CUT where the angle changes.",
        "Multi-shot: core summary, then per-shot scene, a fixed subject description, timecoded camera + action, per-shot audio, and a global style & colour line.",
        "Name the format (\"a 1987 local news report about…\"): it brings the camera, lighting and edit with it.",
        "Audio is generated with the picture: describe scenes that imply sound (footsteps, rain, engines). For speech, quote the line and add \"No on-screen text, no subtitles\".",
      ],
      template:
        "[camera] shot of [subject] [action] in [environment]. [supporting visual and motion details]. [sound].\n\n— or timesteps —\n0.0–X s — [beat 1]\nX–Y s — [beat 2]\nY–END s — [beat 3]",
      examples: {
        "text-to-video": {
          settings: { duration: 10 },
          prompt:
            "A 1987 local news report about a small town's first video arcade: a reporter in a shoulder-padded blazer speaks to camera on the pavement outside, then teenagers crowd around glowing cabinets inside, faces lit blue and red. Worn VHS look, a lower-third caption with the reporter's name. Sound: arcade beeps, excited chatter, the reporter's upbeat voice.",
        },
        "image-to-video": {
          settings: { duration: 5 },
          prompt:
            "Slow push-in as she lifts her head from the book and looks out of the train window; trees streak past outside and the light flickers across her face. Sound: the train rattling over the rails, a page turning.",
        },
        "blackforestlabs/flux-3-max/text-to-video": {
          settings: { duration: 10 },
          prompt:
            "0.0–3.0s — locked wide shot of a still mountain lake at dawn, mist lying on the water\n3.0–6.0s — a slow push-in begins as a grey heron lifts off and glides across the frame\n6.0–10.0s — the sun clears the ridge, warm light spreads over the water and the camera settles\nTelephoto lens, shallow depth of field, natural colour. Sound: water lapping, wingbeats, a distant loon call.",
        },
      },
    },
    {
      id: "kling4",
      title: "Kling 4.0",
      match: [/^kling\/v4\/(text|image|reference)-to-video/],
      sources: [{ label: "fal: Kling 4.0 prompting guide", url: "https://fal.ai/learn/devs/kling-4-prompting-guide" }],
      tips: [
        "Decide what each input controls: a character's identity, a product's look, the camera path, or the order of events.",
        "Give every asset one clear job: a reference video can supply motion while an image supplies identity.",
        "References are written @Image1, @Video1, @Element1 (type @ in the prompt to insert them).",
        "For multi-shot clips, label each shot with its framing, subject and motion, and keep timed segments in order.",
        "Restate the subject's key details (clothes, colours) in every shot instead of writing \"same outfit\".",
        "Per-shot prompts can also go in the multi_prompt field: use either prompt or multi_prompt, not both.",
        "HDR (1080p/4K) adds cost; draft at 720p first.",
      ],
      template:
        "Shot 1 (0-Xs): [framing]. [Subject with full description] [action].\nShot 2 (X-Ys): [framing]. [Same subject, restated] [action].\nShot 3 (Y-ENDs): [framing]. [Same subject, restated] [action].\nMood: […]. Sound: […].",
      examples: {
        "text-to-video": {
          settings: { duration: 10 },
          prompt:
            "Shot 1 (0-4s): Wide shot. A woman in a long red wool coat and black boots walks across a snowy town square at dusk under strings of warm lights.\nShot 2 (4-7s): Medium close-up. The woman in the long red wool coat stops at a bakery window, her breath fogging the glass, and smiles at the pastries.\nShot 3 (7-10s): Close-up from inside the bakery. The woman in the long red wool coat pushes the door open; a bell rings and warm light falls across her face.\nMood: quiet, cosy winter evening. Sound: boots crunching on snow, distant carols, the door bell.",
        },
        "image-to-video": {
          settings: { duration: 5 },
          prompt:
            "From the opening frame, the skateboarder pushes off, carves down into the empty pool and pops out over the coping, landing cleanly. The camera follows low and fast, then holds wide on the landing. Sound: wheels roaring on concrete, a sharp clack on the coping, a friend whooping off camera.",
        },
        "reference-to-video": {
          settings: { duration: 8 },
          prompt:
            "Use @Image1 only for the sneaker's design, colours and logo. Use @Video1 only for the camera path and timing. A runner laces up the sneaker from @Image1 on a wet city street at dawn, then sprints toward the camera as it tracks backward, following the motion of @Video1. Sound: footsteps splashing, city ambience, a low synth pulse.",
        },
      },
    },
    {
      id: "gpt-image",
      title: "GPT Image 2.6 / 2.5",
      match: [/^openai\/gpt-image-2/],
      sources: [{ label: "OpenAI: image prompting guide (official)", url: "https://developers.openai.com/api/docs/guides/image-prompting" }],
      tips: [
        "Define the result: subject and intended use (product photo, ad, diagram), composition, aspect ratio and placement constraints.",
        "For complex requests use labelled sections: scene, subject, details, constraints.",
        "Describe visible details: materials, lighting, colours, medium. Ask for \"photorealistic\" explicitly when that's the goal.",
        "People: describe framing, gaze and how hands meet objects (\"full body visible, feet included\").",
        "Exact text goes in quotes with its position and typography; ask for no extra text. Use medium/high quality for small text.",
        "Edits: say \"change only X\" and list what to preserve (identity, layout, lighting); state exclusions (text, logos, watermarks).",
        "Multiple references: identify each by number and purpose (subject, style, clothing, background).",
        "Iterate: request one change at a time and restate the critical constraints if results drift.",
      ],
      template: "[Intended use].\nScene: […]\nSubject: […]\nDetails: [materials, light, colour, lens/medium]\nText: \"[exact words]\" — [position, typography]\nConstraints: [no other text, no logos, no watermark]",
      examples: {
        "text-to-image": {
          prompt:
            "Product photograph for a coffee brand's website hero.\nScene: a sunlit kitchen counter in the morning, white marble, soft window light from the left.\nSubject: a matte black pour-over kettle pouring water into a glass carafe, steam rising.\nDetails: photorealistic, 50mm lens, shallow depth of field, warm neutral palette, fine droplets on the glass.\nText: the words \"SLOW MORNINGS\" in a thin serif typeface, top left.\nConstraints: no other text, no logos, no watermark.",
        },
        "image-to-image": {
          prompt:
            "Change only the jacket to a dark green waxed-cotton field jacket. Keep the person's face, hair, pose, background, lighting and camera angle exactly the same. No added text, logos or watermarks.",
        },
      },
    },
    {
      id: "kling-image",
      title: "Kling Image 4.0",
      match: [/^kling\/v4\/(text-to-image|image-to-image|long-image)/],
      sources: [{ label: "fal: Kling Image 4.0 prompting guide", url: "https://fal.ai/learn/tools/kling-image-4-prompting-guide" }],
      tips: [
        "Aim for camera realism: soft light fall-off, fine skin and fabric texture, natural expressions; group shots get distinct faces.",
        "Control colour precisely with HEX values or a named palette.",
        "Dense text works (up to ~2,000 characters): describe the lettering, or pass a font sample as a reference image.",
        "Ask for a series and it plans the whole set (storyboards, product sets, slide decks) with consistent subjects.",
        "Pick 2K / 4K / 8K output directly; 8K keeps more texture for prints and crops.",
        "Image-to-image: up to 10 references; say which reference supplies what.",
      ],
      examples: {
        "text-to-image": {
          prompt:
            "Editorial portrait of a ceramicist in her sunlit studio, clay dust on her linen apron, holding a freshly thrown bowl. True-to-life skin texture, soft window light falling off into shadow, 85mm lens, shallow depth of field. Colour palette: #C96F4A terracotta, #F2E8DC cream, #3E4A3D olive.",
        },
        "image-to-image": {
          prompt:
            "Use the first reference image for the woman's face and hair, and the second for the cream cable-knit sweater. Place her in a snowy pine forest at blue hour, standing still with her hands in the sweater's pockets. Keep her identity exact. Colour palette: #DCE3EA snow, #2F3B48 dusk blue, #F4EBDD cream.",
        },
      },
    },
    {
      id: "image-general",
      title: "Image models",
      match: [/^microsoft\/mai-image/, /^google\/nano-banana/, /^xai\/grok-imagine-image/, /^bytedance\/seedream/, /^krea\//],
      sources: [{ label: "OpenAI: image prompting guide (general best practice)", url: "https://developers.openai.com/api/docs/guides/image-prompting" }],
      tips: [
        "General best practice (this model's maker publishes no separate guide on fal): define the result and its use, then scene, subject, details and constraints.",
        "Describe what the camera would see: materials, light direction, colours, lens or medium, rather than mood words.",
        "Exact text goes in quotes, with position and style; ask for no other text.",
        "Edits: \"change only X\", list what must stay the same, and give each reference image a role.",
        "Change one thing per retry so you can tell what worked.",
      ],
      examples: {
        "text-to-image": {
          prompt:
            "Poster for a summer night market. Scene: a lantern-lit street of food stalls at dusk, crowds blurred by motion. Subject: a vendor flipping skewers over a charcoal grill, sparks rising. Details: photorealistic, 35mm, warm orange and teal palette, smoke catching the lantern light. Text: \"NIGHT MARKET — FRIDAYS\" in bold condensed letters across the top. Constraints: no other text, no logos, no watermark.",
        },
        "image-to-image": {
          prompt:
            "Change only the background to a misty pine forest at sunrise. Keep the person's face, clothing, pose, lighting direction and framing exactly the same. No added text or logos.",
        },
      },
    },
  ];

  function guideFor(endpointId) {
    return GUIDES.find((g) => g.match.some((re) => re.test(endpointId))) || null;
  }

  /** Example for this endpoint: exact endpoint first, then its category. */
  function exampleFor(endpointId, category) {
    const g = guideFor(endpointId);
    if (!g) return null;
    return g.examples[endpointId] || g.examples[category] || null;
  }

  return { GUIDES, guideFor, exampleFor };
});
