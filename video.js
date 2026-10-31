// Needs mp4.js, and `$` from blur.js (load order matters).
const SECONDS = 6;
const FRAMES = FPS * SECONDS;

const vCanvas = $("videoPreview");
const vCtx = vCanvas.getContext("2d");
const makeBtn = $("makeVideo");
let source = null;
let fileBase = "image";

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
  makeBtn.disabled = true;
  status.textContent = "";
  try {
    const blob = await makeMp4(vCanvas, FRAMES, drawFrame, (done) => {
      makeBtn.textContent = `Making video… ${Math.round(done * 100)}%`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}_${SECONDS}s.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    status.textContent = `Could not make the video: ${err.message}`;
  } finally {
    makeBtn.textContent = label;
    makeBtn.disabled = false;
    drawFrame(0);
  }
});
