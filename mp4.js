// MP4 maker shared by Image to video and Poster Studio. Needs vendor/mp4-muxer.js.
const FPS = 30;
const BITRATE = 5_000_000;
// H.264 level 4.0 allows ~2.1M pixels per frame. Fitting inside 1920x1080
// (either way round) keeps every image under that limit.
const CODEC = "avc1.640028";
const MAX_LONG = 1920;
const MAX_SHORT = 1080;

function fitSize(w, h) {
  const scale = Math.min(1, MAX_LONG / Math.max(w, h), MAX_SHORT / Math.min(w, h));
  // H.264 needs even width and height.
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { w: even(w), h: even(h) };
}

// Calls drawFrame(i) to paint frame i onto canvas, for frameCount frames.
// onProgress(0–1) after each frame. Resolves to an MP4 Blob.
async function makeMp4(canvas, frameCount, drawFrame, onProgress) {
  const { width, height } = canvas;
  const config = { codec: CODEC, width, height, bitrate: BITRATE, framerate: FPS };
  if (!window.VideoEncoder || !(await VideoEncoder.isConfigSupported(config)).supported) {
    throw new Error("This browser cannot make MP4 video. Try Chrome, Edge or Safari.");
  }

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: FPS },
    fastStart: "in-memory", // puts the index first, so the file plays while loading
  });
  let encoder;
  try {
    // No error handler logic here: flush() below rejects with the same error.
    encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: () => {} });
    encoder.configure(config);

    for (let i = 0; i < frameCount; i++) {
      drawFrame(i);
      // Without a duration the last frame counts as 0 s long and the video comes out one frame short.
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      // A keyframe every second lets players seek.
      encoder.encode(frame, { keyFrame: i % FPS === 0 });
      frame.close();
      // Don't pile frames up in memory; waiting also lets the progress text paint.
      while (encoder.encodeQueueSize > 5) await new Promise((r) => setTimeout(r, 5));
      onProgress((i + 1) / frameCount);
    }
    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
  }
}
