// Slides, languages and export for Poster Studio.
// Needs poster.js (loaded first), CJK_FONT from poster-draw.js, mp4.js, and vendor/fflate.js.

// Stubby's languages (daily_plan_project plan/13). English is the base: new languages start as a copy of it.
const LANGS = { en: "English", id: "Indonesian", es: "Spanish", de: "German", ja: "Japanese", "zh-CN": "Chinese (Simplified)" };
// Drawn at twice the shown height so thumbnails stay sharp on high-density screens.
const THUMB_H = 176;

// Canvas draws with a fallback font if the real one hasn't loaded yet, and never
// redraws by itself, so wait first. Variable fonts: one load covers every weight.
function fontsReady(langs) {
  const loads = [document.fonts.load("400 16px Fredoka"), document.fonts.load("400 16px Nunito"), badgesReady];
  for (const l of langs) if (CJK_FONT[l]) loads.push(document.fonts.load(`400 16px "${CJK_FONT[l]}"`, "字"));
  return Promise.all(loads);
}

const allBoxes = () => [poster.template, ...poster.slides.map((s) => s.boxes)].flatMap((bs) => Object.values(bs));

// ---------- slides ----------

function drawThumb(s) {
  const { w, h } = outputSize(s);
  draw(s.thumb, Math.round((w / h) * THUMB_H), THUMB_H, s, poster.lang);
}

function selectSlide(i) {
  poster.current = i;
  // Show the boxes' outlines on a freshly picked slide; touch screens have no hover to reveal them.
  selectionShown = true;
  syncPanel();
  renderPoster();
}

async function addImages(files) {
  const list = [...files]
    .filter((f) => f.type.startsWith("image/"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); // 2.png before 10.png
  const firstNew = poster.slides.length;
  for (const file of list) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      continue; // not an image the browser can read; skip it instead of stopping the batch
    } finally {
      URL.revokeObjectURL(url);
    }
    const prev = poster.slides.at(-1);
    poster.slides.push({
      img,
      name: file.name.replace(/\.[^.]+$/, ""),
      // A new slide copies the one before it, so the carousel stays consistent.
      boxes: structuredClone(prev ? prev.boxes : poster.template),
      thumb: document.createElement("canvas"),
      // on: this slide exports as MP4 instead of PNG.
      video: { on: false, seconds: 6, zoom: 0 },
    });
  }
  if (poster.slides.length > firstNew) selectSlide(firstNew);
}

function moveSlide(by) {
  const i = poster.current;
  const [s] = poster.slides.splice(i, 1);
  poster.slides.splice(i + by, 0, s);
  selectSlide(i + by);
}

$("slidePrev").addEventListener("click", () => moveSlide(-1));
$("slideNext").addEventListener("click", () => moveSlide(1));
$("slideDel").addEventListener("click", () => {
  poster.slides.splice(poster.current, 1);
  selectSlide(Math.min(poster.current, poster.slides.length - 1));
});

// Position, size and style go to every slide; the words stay per slide.
$("applyAll").addEventListener("click", () => {
  const { text, ...style } = pickedBox();
  for (const s of poster.slides) Object.assign(s.boxes[picked], structuredClone(style));
  syncPanel();
  renderPoster();
  $("applyAll").textContent = "Applied ✓";
  setTimeout(() => { $("applyAll").textContent = "Apply this box to all slides"; }, 1500);
});

$("pFile").addEventListener("change", (e) => { addImages(e.target.files); e.target.value = ""; });
// The empty-state drop zone, and the preview area once slides exist, both take dropped files.
for (const zone of [$("pDrop"), $("canvasArea")]) {
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    addImages(e.dataTransfer.files);
  });
}

// ---------- this slide as video ----------

const videoInputs = {
  vidOn: (v, el) => { slide().video.on = el.checked; },
  vidSecs: (v) => { slide().video.seconds = +v; },
  vidZoom: (v) => { slide().video.zoom = +v; },
};
for (const [id, write] of Object.entries(videoInputs)) {
  $(id).addEventListener("input", (e) => { write(e.target.value, e.target); syncSession(); });
}

// Platforms expect the preset's size (e.g. 1080 × 1920); on Auto, use the slide's own.
async function slideMp4(s, lang, onProgress) {
  const preset = PRESETS.find((x) => x.id === poster.preset);
  const { w, h } = preset.w ? preset : outputSize(s);
  const size = fitSize(w, h);
  // Draw the slide once; frames then only copy (and zoom) pixels, which keeps encoding fast.
  const still = document.createElement("canvas");
  draw(still, size.w, size.h, s, lang);
  const video = document.createElement("canvas");
  video.width = size.w;
  video.height = size.h;
  const vctx = video.getContext("2d");
  vctx.imageSmoothingQuality = "high";
  const frames = Math.round(s.video.seconds * FPS);
  return makeMp4(video, frames, (i) => {
    // Zoom grows linearly from 1x on the first frame to 1+zoom on the last, like Image to video.
    const k = 1 + (s.video.zoom / 100) * (i / (frames - 1));
    vctx.drawImage(still, (size.w - size.w * k) / 2, (size.h - size.h * k) / 2, size.w * k, size.h * k);
  }, onProgress);
}

// ---------- languages ----------

async function setLang(code) {
  poster.lang = code;
  syncPanel();
  if (CJK_FONT[code]) $("langStatus").textContent = `Loading the ${LANGS[code]} font…`;
  await fontsReady([code]);
  $("langStatus").textContent = "";
  renderPoster();
}

$("langAdd").addEventListener("change", (e) => {
  const code = e.target.value;
  if (!code) return;
  poster.langs.push(code);
  for (const b of allBoxes()) b.text[code] = b.text.en;
  setLang(code);
});

$("langRemove").addEventListener("click", () => {
  const code = poster.lang;
  if (!confirm(`Remove ${LANGS[code]} and its text on every slide?`)) return;
  poster.langs = poster.langs.filter((l) => l !== code);
  for (const b of allBoxes()) delete b.text[code];
  setLang("en");
});

// ---------- keep the session UI in step (called from syncPanel) ----------

let busy = false; // an export is running: leave the button labels alone

function syncSession() {
  const n = poster.slides.length;
  const s = slide();
  $("pEditor").hidden = n === 0;
  $("pDrop").hidden = n > 0;

  $("slides").replaceChildren(...poster.slides.map((sl, i) => {
    const btn = document.createElement("button");
    btn.className = "slide";
    btn.setAttribute("aria-pressed", i === poster.current);
    btn.setAttribute("aria-label", `Slide ${i + 1}${sl.video.on ? ", video" : ""}`);
    const num = document.createElement("span");
    num.textContent = i + 1;
    btn.append(sl.thumb, num);
    if (sl.video.on) {
      const tag = document.createElement("span");
      tag.className = "video";
      tag.textContent = "▶";
      btn.append(tag);
    }
    btn.addEventListener("click", () => selectSlide(i));
    return btn;
  }));
  $("slidePrev").disabled = poster.current <= 0;
  $("slideNext").disabled = poster.current >= n - 1;

  $("langTabs").replaceChildren(...poster.langs.map((code) => {
    const btn = document.createElement("button");
    btn.textContent = LANGS[code];
    btn.setAttribute("aria-pressed", code === poster.lang);
    btn.addEventListener("click", () => setLang(code));
    return btn;
  }));
  const add = $("langAdd");
  add.replaceChildren(new Option("+ Add another language", ""));
  for (const [code, name] of Object.entries(LANGS)) if (!poster.langs.includes(code)) add.add(new Option(name, code));
  add.hidden = add.options.length === 1;
  $("langRemove").hidden = poster.lang === "en";

  const first = poster.slides[0];
  const match = first && matchPreset(first.img.naturalWidth, first.img.naturalHeight);
  $("pAuto").textContent = first
    ? `First image is ${first.img.naturalWidth} × ${first.img.naturalHeight}. ` +
      (match ? `Auto uses ${match.label}.` : "Auto keeps its own shape.")
    : "";

  if (s) {
    $("vidOn").checked = s.video.on;
    $("vidControls").hidden = !s.video.on;
    $("vidSecs").value = s.video.seconds;
    $("vidSecsOut").textContent = s.video.seconds;
    $("vidZoom").value = s.video.zoom;
    $("vidZoomOut").textContent = s.video.zoom;
  }
  if (!busy) {
    $("pZip").textContent = "All slides (ZIP)";
    $("pDownload").textContent = `This slide (${s && s.video.on ? "MP4" : "PNG"})`;
  }
  const langs = poster.langs.length;
  $("pCount").textContent = langs > 1 ? `ZIP: ${n} slide${n === 1 ? "" : "s"} × ${langs} languages = ${n * langs} files` : "";
}

// ---------- export ----------

// "This slide" exports the shown slide in the shown language; ZIP does every slide × every language.
// A slide with video on comes out as MP4, otherwise PNG.
async function onExport(e) {
  const btn = e.currentTarget;
  const all = btn.id === "pZip";
  busy = true;
  $("pZip").disabled = $("pDownload").disabled = true;
  $("pStatus").textContent = "";
  try {
    const langs = all ? poster.langs : [poster.lang];
    const slides = all ? poster.slides : [slide()];
    await fontsReady(langs);
    const files = {};
    let last = null;
    let done = 0;
    for (const lang of langs) {
      const dir = langs.length > 1 ? `${lang}/` : "";
      for (const s of slides) {
        const step = all ? `Making ZIP… ${done + 1}/${langs.length * slides.length}` : "Exporting…";
        btn.textContent = step;
        let blob;
        if (s.video.on) {
          blob = await slideMp4(s, lang, (d) => { btn.textContent = `${step} video ${Math.round(d * 100)}%`; });
        } else {
          const { w, h } = outputSize(s);
          const out = document.createElement("canvas");
          draw(out, w, h, s, lang);
          blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
        }
        const ext = s.video.on ? "mp4" : "png";
        const index = String(poster.slides.indexOf(s) + 1).padStart(2, "0");
        // level 0 = store only: PNG and MP4 are already compressed, zipping them again only costs time.
        if (all) files[`${dir}slide-${index}.${ext}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
        last = { blob, name: `${s.name}_${lang}.${ext}` };
        done++;
      }
    }
    const result = all ? { blob: new Blob([fflate.zipSync(files)], { type: "application/zip" }), name: "stubby-carousel.zip" } : last;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.blob);
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    $("pStatus").textContent = `Could not export: ${err.message}`;
  } finally {
    busy = false;
    $("pZip").disabled = $("pDownload").disabled = false;
    syncSession();
  }
}
$("pZip").addEventListener("click", onExport);
$("pDownload").addEventListener("click", onExport);

fontsReady([]).then(renderPoster);
syncPanel();
