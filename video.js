// Needs vendor/mp4-muxer.js, and `$` from blur.js (load order matters).
const FPS = 30;
const SECONDS = 6;
const FRAMES = FPS * SECONDS;
const BITRATE = 5_000_000;
// H.264 level 4.0 allows ~2.1M pixels per frame. Fitting inside 1920x1080
// (either way round) keeps every image under that limit.
const CODEC = "avc1.640028";
const MAX_LONG = 1920;
const MAX_SHORT = 1080;

const vCanvas = $("videoPreview");
const vCtx = vCanvas.getContext("2d");
const makeBtn = $("makeVideo");
let source = null;
let fileBase = "image";

function fitSize(w, h) {
  const scale = Math.min(1, MAX_LONG / Math.max(w, h), MAX_SHORT / Math.min(w, h));
  // H.264 needs even width and height.
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { w: even(w), h: even(h) };
}

// Zoom grows linearly from 1x on the first frame to 1+zoom on the last.
function drawFrame(i) {
  const k = 1 + ($("zoom").value / 100) * (i / (FRAMES - 1));
  const w = vCanvas.width * k;
  const h = vCanvas.height * k;
  vCtx.drawImage(source, (vCanvas.width - w) / 2, (vCanvas.height - h) / 2, w, h);
}

function showZoom() {
  $("zoomOut").textContent = $("zoom").value;
}

document.addEventListener("imageloaded", (e) => {
  source = e.detail.img;
  fileBase = e.detail.baseName;
  const { w, h } = fitSize(source.naturalWidth, source.naturalHeight);
  vCanvas.width = w;
  vCanvas.height = h;
  vCtx.imageSmoothingQuality = "high"; // resizing a canvas resets its context
  drawFrame(0);
  $("videoInfo").textContent = `${w} × ${h}, ${SECONDS} s, ${FPS} fps, no sound.`;
  $("videoStatus").textContent = "";
});

$("zoom").addEventListener("input", showZoom);
showZoom();

makeBtn.addEventListener("click", async () => {
  const label = makeBtn.textContent;
  const status = $("videoStatus");
  const { width, height } = vCanvas;
  let encoder;
  makeBtn.disabled = true;
  status.textContent = "";
  try {
    const config = { codec: CODEC, width, height, bitrate: BITRATE, framerate: FPS };
    if (!window.VideoEncoder || !(await VideoEncoder.isConfigSupported(config)).supported) {
      throw new Error("This browser cannot make MP4 video. Try Chrome, Edge or Safari.");
    }

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width, height, frameRate: FPS },
      fastStart: "in-memory", // puts the index first, so the file plays while loading
    });
    // No error handler logic here: flush() below rejects with the same error.
    encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: () => {} });
    encoder.configure(config);

    for (let i = 0; i < FRAMES; i++) {
      drawFrame(i);
      // Without a duration the last frame counts as 0 s long and the video comes out one frame short.
      const frame = new VideoFrame(vCanvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      // A keyframe every second lets players seek.
      encoder.encode(frame, { keyFrame: i % FPS === 0 });
      frame.close();
      // Don't pile frames up in memory; waiting also lets the progress text paint.
      while (encoder.encodeQueueSize > 5) await new Promise((r) => setTimeout(r, 5));
      makeBtn.textContent = `Making video… ${Math.round(((i + 1) / FRAMES) * 100)}%`;
    }
    await encoder.flush();
    muxer.finalize();

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([muxer.target.buffer], { type: "video/mp4" }));
    a.download = `${fileBase}_${SECONDS}s.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    status.textContent = `Could not make the video: ${err.message}`;
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
    makeBtn.textContent = label;
    makeBtn.disabled = false;
    drawFrame(0);
  }
});
