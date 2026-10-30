const $ = (id) => document.getElementById(id);

// Blur is a % of the longest edge, so the small preview and the full-size
// download look the same. 100% = 8% of the edge.
const BLUR_MAX_FRACTION = 0.08;
const PREVIEW_MAX = 1000;

let img = null;
let baseName = "image";

function render(canvas, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const radius = ($("blur").value / 100) * BLUR_MAX_FRACTION * Math.max(w, h);

  // Canvas blur fades to transparent at the borders. Extra padding gives it
  // pixels to sample from, so the edges stay dark instead of washed out.
  const pad = Math.ceil(radius * 3);
  const padded = document.createElement("canvas");
  padded.width = w + pad * 2;
  padded.height = h + pad * 2;
  const pctx = padded.getContext("2d");
  pctx.drawImage(img, 0, 0, padded.width, padded.height);
  pctx.drawImage(img, pad, pad, w, h);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.filter = `brightness(${1 - $("darken").value / 100}) blur(${radius}px)`;
  ctx.drawImage(padded, -pad, -pad);
}

function updatePreview() {
  $("darkenOut").textContent = $("darken").value;
  $("blurOut").textContent = $("blur").value;
  if (img) render($("preview"), PREVIEW_MAX);
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  baseName = file.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const next = new Image();
  next.onload = () => {
    URL.revokeObjectURL(url);
    img = next;
    $("editor").hidden = false;
    updatePreview();
    document.dispatchEvent(new CustomEvent("imageloaded", { detail: { img, baseName } }));
  };
  next.src = url;
}

$("file").addEventListener("change", (e) => loadFile(e.target.files[0]));
$("darken").addEventListener("input", updatePreview);
$("blur").addEventListener("input", updatePreview);

const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  loadFile(e.dataTransfer.files[0]);
});

$("download").addEventListener("click", () => {
  const out = document.createElement("canvas");
  render(out, Infinity);
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}_bokeh.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png"); // PNG is lossless, so no quality is lost on save
});

updatePreview();
