// The editor: state, preview, drag, panel. Slides, languages and export are in poster-session.js.
// Needs `$` from blur.js, drawPoster/cropRect from poster-draw.js, measureContrast from contrast.js.

// Stubby design spec §2.
const PALETTE = [
  ["sageDeep", "#4E7A58"], ["sage", "#B7CEB2"], ["sagePale", "#D9E7D3"], ["sheet", "#EDF3EA"],
  ["ink", "#35373D"], ["ink2", "#7B7D83"], ["white", "#FFFFFF"], ["sky", "#B9E1FB"],
  ["urgent", "#C4604F"], ["amber", "#E0B54A"],
];

// Sizes from 2026 guides; platforms change them, so re-check now and then.
const PRESETS = [
  { id: "auto", label: "Auto (match image)" },
  { id: "9x16", label: "9:16 · TikTok, Reels, Shorts, Play Store", w: 1080, h: 1920 },
  { id: "3x4", label: "3:4 · Instagram, Threads", w: 1080, h: 1440 },
  { id: "4x5", label: "4:5 · Instagram feed, Threads, X", w: 1080, h: 1350 },
  { id: "1x1", label: "1:1 · Square", w: 1080, h: 1080 },
  { id: "16x9", label: "16:9 · X, YouTube", w: 1920, h: 1080 },
  { id: "appstore", label: 'App Store 6.9"', w: 1320, h: 2868 },
];

const WEIGHTS = { Fredoka: [300, 700], Nunito: [200, 1000] };
const PREVIEW_LONG = 1200;
const MIN_BOX = 0.05;
const SNAP = 0.012;

// One session = one carousel: shape, background and languages are shared, each
// slide has its own image and boxes. box.text is { langCode: "words" }.
const poster = {
  preset: "auto",
  exact: false,
  // ink/alpha/size are the pattern's color, strength and tile width (share of poster width).
  // Defaults are the app's sheet: paws in ink at 3.5% (Stubby spec §5).
  bg: { type: "paw", color: "#EDF3EA", ink: "#35373D", alpha: 0.035, size: 0.3 },
  langs: ["en"],
  lang: "en",
  slides: [],
  current: -1,
  // Boxes for the first slide. Later slides copy the slide before them.
  template: {
    header: {
      show: true, x: 0.06, y: 0.04, w: 0.88, h: 0.16,
      text: { en: "Plan your day\nwith Stubby" }, font: "Fredoka", weight: 600, size: 0.075,
      align: "center", color: "#35373D", fill: "rgba(0, 0, 0, 0)",
      appstore: false, playstore: false, badgeGap: 0.016,
    },
    footer: {
      show: true, x: 0.06, y: 0.8, w: 0.88, h: 0.16,
      text: { en: "Get Stubby on the App Store and Google Play" }, font: "Nunito", weight: 800, size: 0.04,
      align: "center", color: "#35373D", fill: "rgba(0, 0, 0, 0)",
      // badgeGap: space between the two badges, as a share of poster width.
      appstore: true, playstore: true, badgeGap: 0.016,
    },
  },
};
let picked = "header";
// False after a click outside the boxes: the preview shows no outlines or handles.
// The panel still edits `picked`.
let selectionShown = true;

const slide = () => poster.slides[poster.current];
const boxesNow = () => (slide() ? slide().boxes : poster.template);
const pickedBox = () => boxesNow()[picked];

const badgeImgs = { appstore: new Image(), playstore: new Image() };
const badgesReady = Promise.all(
  Object.entries(badgeImgs).map(([k, im]) => { im.src = `assets/badges/${k}.svg`; return im.decode(); })
);

// The preset "Auto" snaps to, or null to keep the image's own shape. Snaps only
// when the nearest preset is within 3% of the image's shape, so Auto never makes a big surprise crop.
function matchPreset(imgW, imgH) {
  const r = imgW / imgH;
  let best = null;
  for (const p of PRESETS) {
    if (!p.w) continue;
    const off = Math.abs(p.w / p.h - r) / r;
    if (off <= 0.03 && (!best || off < best.off)) best = { p, off };
  }
  // Under 1% the image already is that shape. An iPhone 1290 × 2796 is 0.2% off App Store's
  // 1320 × 2868, and Apple accepts it as is; trimming 3 px would make it a size Apple rejects.
  return best && best.off >= 0.01 ? best.p : null;
}

// Every slide gets the same shape; on Auto it comes from the first slide's image.
function ratioOf() {
  const { naturalWidth: w, naturalHeight: h } = poster.slides[0].img;
  const p = PRESETS.find((x) => x.id === poster.preset);
  const target = p.w ? p : matchPreset(w, h);
  return target ? target.w / target.h : w / h;
}

// Native size = the crop at 1 image pixel per poster pixel: no resampling, no quality loss.
function outputSize(s) {
  const crop = cropRect(s.img.naturalWidth, s.img.naturalHeight, ratioOf());
  const p = PRESETS.find((x) => x.id === poster.preset);
  if (poster.exact && p.w) return { crop, w: p.w, h: p.h };
  return { crop, w: crop.sw, h: crop.sh };
}

function draw(canvas, w, h, s, lang, withText = true) {
  canvas.width = w;
  canvas.height = h;
  const { crop } = outputSize(s);
  return drawPoster(canvas, { img: s.img, crop, bg: poster.bg, boxes: s.boxes, lang }, badgeImgs, withText);
}

// ---------- preview ----------

const stage = $("stage");
const pCanvas = $("pCanvas");
const plainCanvas = document.createElement("canvas"); // the preview without text, for contrast
const boxEls = Object.fromEntries([...stage.querySelectorAll(".box")].map((el) => [el.dataset.box, el]));
let frameQueued = false;

function renderPoster() {
  if (frameQueued || !slide()) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    if (!slide()) return;
    const s = slide();
    const { crop, w, h } = outputSize(s);
    const k = Math.min(1, PREVIEW_LONG / Math.max(w, h));
    const pw = Math.round(w * k), ph = Math.round(h * k);
    stage.style.setProperty("--ar", w / h);
    draw(pCanvas, pw, ph, s, poster.lang);
    const rects = draw(plainCanvas, pw, ph, s, poster.lang, false);
    showContrast(rects);
    placeBoxes();
    showInfo(w, h, crop);
    // Shape and background changes touch every slide; a drag only touches this one.
    for (const t of drag ? [s] : poster.slides) drawThumb(t);
  });
}

function showInfo(w, h, crop) {
  const scaled = w !== crop.sw;
  let info = scaled
    ? `Export: ${w} × ${h} px PNG, ${w > crop.sw ? "enlarged" : "shrunk"} from ${crop.sw} × ${crop.sh}.`
    : `Export: ${w} × ${h} px PNG, image pixels kept 1:1 (no quality loss).`;
  const sizes = new Set(poster.slides.map((s) => { const o = outputSize(s); return `${o.w}×${o.h}`; }));
  if (sizes.size > 1) info += " Slides differ in pixel size (same shape). Pick a preset and tick Exact size to make them match.";
  $("pInfo").textContent = info;
  $("boxSizeOut").textContent = Math.round(pickedBox().size * w);
  $("boxBadgeGapOut").textContent = Math.round(pickedBox().badgeGap * w);
}

function showContrast(rects) {
  const out = $("contrast");
  out.replaceChildren();
  const chip = (cls, words) => {
    const el = document.createElement("span");
    el.className = `chip ${cls}`;
    el.textContent = words;
    out.append(el);
  };
  for (const [name, r] of Object.entries(rects)) {
    const label = name === "header" ? "Header" : "Footer";
    boxEls[name].classList.toggle("overflow", r.overflow);
    if (r.overflow) chip("low", `${label} doesn't fit its box`);
    const ratio = r.text && measureContrast(plainCanvas, r.text, rgbaOf(boxesNow()[name].color));
    if (ratio == null) continue;
    const [cls, word] = ratio >= 4.5 ? ["good", "Good"] : ratio >= 3 ? ["ok", "Big text only"] : ["low", "Low"];
    chip(cls, `${label} ${ratio.toFixed(1)}:1 · ${word}`);
  }
}

function placeBoxes() {
  for (const [name, el] of Object.entries(boxEls)) {
    const b = boxesNow()[name];
    el.hidden = !b.show;
    el.style.left = `${b.x * 100}%`;
    el.style.top = `${b.y * 100}%`;
    el.style.width = `${b.w * 100}%`;
    el.style.height = `${b.h * 100}%`;
    el.classList.toggle("picked", selectionShown && name === picked);
  }
  stage.classList.toggle("clean", !selectionShown);
}

// Clicking anywhere except a box or the settings hides the selection.
document.addEventListener("pointerdown", (e) => {
  if (!selectionShown || e.target.closest(".box, .sidebar")) return;
  selectionShown = false;
  placeBoxes();
});

// ---------- drag to move / resize ----------

for (const el of Object.values(boxEls)) {
  for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const h = document.createElement("span");
    h.className = `handle ${dir}`;
    h.dataset.dir = dir;
    el.append(h);
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let drag = null;

stage.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".box");
  if (!el) return;
  pickBox(el.dataset.box);
  if (sideTab === "bg" || sideTab === "export") showSide("text");
  const b = pickedBox();
  // Work from where the box was at grab time plus how far the pointer moved,
  // so the box never jumps to the pointer.
  drag = { b, dir: e.target.dataset.dir || "move", x0: e.clientX, y0: e.clientY, start: { ...b }, rect: stage.getBoundingClientRect() };
  // Keeps the drag alive when a fast finger slides off the small handle.
  e.target.setPointerCapture(e.pointerId);
  e.preventDefault();
});

stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const { b, dir, start: s, rect } = drag;
  const dx = (e.clientX - drag.x0) / rect.width;
  const dy = (e.clientY - drag.y0) / rect.height;
  let snapped = false;

  if (dir === "move") {
    b.x = clamp(s.x + dx, 0, 1 - s.w);
    b.y = clamp(s.y + dy, 0, 1 - s.h);
    snapped = Math.abs(b.x + b.w / 2 - 0.5) < SNAP;
    if (snapped) b.x = 0.5 - b.w / 2;
  } else {
    if (dir.includes("e")) b.w = clamp(s.w + dx, MIN_BOX, 1 - s.x);
    if (dir.includes("s")) b.h = clamp(s.h + dy, MIN_BOX, 1 - s.y);
    if (dir.includes("w")) {
      b.x = clamp(s.x + dx, 0, s.x + s.w - MIN_BOX);
      b.w = s.x + s.w - b.x;
    }
    if (dir.includes("n")) {
      b.y = clamp(s.y + dy, 0, s.y + s.h - MIN_BOX);
      b.h = s.y + s.h - b.y;
    }
  }
  $("guide").hidden = !snapped;
  renderPoster();
});

function endDrag() {
  drag = null;
  $("guide").hidden = true;
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

// ---------- color controls ----------

const probe = document.createElement("canvas").getContext("2d");

// Any CSS color in, [r, g, b, alpha 0–1] out. Canvas gives back "#rrggbb" or "rgba(r, g, b, a)".
function rgbaOf(color) {
  probe.fillStyle = color;
  const v = probe.fillStyle;
  if (v.startsWith("#")) return [...[1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)), 1];
  const [r, g, b, a = 1] = v.match(/[\d.]+/g).map(Number);
  return [r, g, b, a];
}

// For the native picker, which only takes "#rrggbb".
const toHex = (color) => `#${rgbaOf(color).slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("")}`;

// Builds swatches + picker + text field inside el. Returns a function that refreshes it.
function colorControl(el, read, write) {
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = el.dataset.label;
  const swatches = document.createElement("div");
  swatches.className = "swatches";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.setAttribute("aria-label", `${el.dataset.label} picker`);
  const text = document.createElement("input");
  text.type = "text";
  text.spellcheck = false;
  text.setAttribute("aria-label", `${el.dataset.label} hex or rgba`);

  const entries = "none" in el.dataset ? [["none", "rgba(0, 0, 0, 0)"], ...PALETTE] : PALETTE;
  for (const [name, value] of entries) {
    const s = document.createElement("button");
    s.className = name === "none" ? "swatch none" : "swatch";
    s.style.background = value;
    s.title = name;
    s.setAttribute("aria-label", name);
    s.addEventListener("click", () => set(value));
    swatches.append(s);
  }

  const sync = () => {
    text.value = read();
    picker.value = toHex(read());
    text.classList.remove("bad");
  };
  const set = (v) => { write(v); sync(); renderPoster(); };

  picker.addEventListener("input", () => set(picker.value));
  text.addEventListener("change", () => {
    if (CSS.supports("color", text.value)) set(text.value.trim());
    else text.classList.add("bad");
  });

  el.append(label, swatches, picker, text);
  sync();
  return sync;
}

const colorEl = (k) => document.querySelector(`.color[data-color="${k}"]`);
const syncColors = [
  colorControl(colorEl("bg"), () => poster.bg.color, (v) => { poster.bg.color = v; }),
  colorControl(colorEl("pattern"), () => poster.bg.ink, (v) => { poster.bg.ink = v; }),
  colorControl(colorEl("text"), () => pickedBox().color, (v) => { pickedBox().color = v; }),
  colorControl(colorEl("fill"), () => pickedBox().fill, (v) => { pickedBox().fill = v; }),
];

// ---------- panel ----------

const ratioSel = $("pRatio");
for (const p of PRESETS) ratioSel.add(new Option(p.label, p.id));

function syncPanel() {
  ratioSel.value = poster.preset;
  $("pExact").checked = poster.exact;
  $("pExact").disabled = poster.preset === "auto";
  $("bgType").value = poster.bg.type;
  $("patternControls").hidden = poster.bg.type === "plain";
  $("patStrength").value = poster.bg.alpha * 100;
  $("patStrengthOut").textContent = +(poster.bg.alpha * 100).toFixed(1);
  $("patSize").value = poster.bg.size * 100;
  $("patSizeOut").textContent = Math.round(poster.bg.size * 100);

  const b = pickedBox();
  for (const btn of document.querySelectorAll("[data-pick]")) btn.setAttribute("aria-pressed", btn.dataset.pick === picked);
  for (const btn of document.querySelectorAll("[data-align]")) btn.setAttribute("aria-pressed", btn.dataset.align === b.align);
  $("boxShow").checked = b.show;
  // Rewriting the textarea while you type would throw the cursor to the end.
  if ($("boxText").value !== b.text[poster.lang]) $("boxText").value = b.text[poster.lang];
  $("boxFont").value = b.font;
  const [lo, hi] = WEIGHTS[b.font];
  $("boxWeight").min = lo;
  $("boxWeight").max = hi;
  $("boxWeight").value = b.weight;
  $("boxWeightOut").textContent = b.weight;
  $("boxBold").setAttribute("aria-pressed", b.weight >= 700);
  $("boxSize").value = b.size * 100;
  $("boxAppstore").checked = b.appstore;
  $("boxPlaystore").checked = b.playstore;
  $("boxBadgeGap").value = b.badgeGap * 100;
  $("boxBadgeGap").disabled = !(b.appstore && b.playstore);
  syncColors.forEach((s) => s());
  syncSession();
}

function pickBox(name) {
  picked = name;
  selectionShown = true;
  syncPanel();
  renderPoster();
}

// ---------- sidebar tabs ----------

let sideTab = "text";

function showSide(name) {
  sideTab = name;
  for (const btn of document.querySelectorAll("[data-side]")) btn.setAttribute("aria-pressed", btn.dataset.side === name);
  for (const panel of document.querySelectorAll("[data-panel]")) panel.hidden = panel.dataset.panel !== name;
  // Header/Footer picker and contrast only matter while editing a box.
  $("sideBox").hidden = name !== "text" && name !== "style";
}
for (const btn of document.querySelectorAll("[data-side]")) btn.addEventListener("click", () => showSide(btn.dataset.side));

// One handler for every panel input: write the value into poster, then redraw.
const inputs = {
  pRatio: (v) => { poster.preset = v; },
  pExact: (v, el) => { poster.exact = el.checked; },
  bgType: (v) => { poster.bg.type = v; },
  patStrength: (v) => { poster.bg.alpha = v / 100; },
  patSize: (v) => { poster.bg.size = v / 100; },
  boxShow: (v, el) => { pickedBox().show = el.checked; },
  boxText: (v) => { pickedBox().text[poster.lang] = v; },
  boxFont: (v) => {
    const b = pickedBox();
    b.font = v;
    b.weight = clamp(b.weight, ...WEIGHTS[v]);
  },
  boxWeight: (v) => { pickedBox().weight = +v; },
  boxSize: (v) => { pickedBox().size = v / 100; },
  boxAppstore: (v, el) => { pickedBox().appstore = el.checked; },
  boxPlaystore: (v, el) => { pickedBox().playstore = el.checked; },
  boxBadgeGap: (v) => { pickedBox().badgeGap = v / 100; },
};
for (const [id, write] of Object.entries(inputs)) {
  $(id).addEventListener("input", (e) => {
    write(e.target.value, e.target);
    syncPanel();
    renderPoster();
  });
}

for (const btn of document.querySelectorAll("[data-pick]")) btn.addEventListener("click", () => pickBox(btn.dataset.pick));
for (const btn of document.querySelectorAll("[data-align]")) {
  btn.addEventListener("click", () => { pickedBox().align = btn.dataset.align; syncPanel(); renderPoster(); });
}
$("boxBold").addEventListener("click", () => {
  const b = pickedBox();
  b.weight = b.weight >= 700 ? 400 : 700;
  syncPanel();
  renderPoster();
});
