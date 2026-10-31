// Drawing only, no UI. Every size here is a fraction of the poster, so the
// small preview and the full-size export come out the same.

// From the Stubby design spec §4: Fredoka roles use 1.25, Nunito roles 1.375.
const LINE_HEIGHT = { Fredoka: 1.25, Nunito: 1.375 };
// The Play badge SVG has no width/height, so browsers can't tell its size. Taken from each viewBox.
const BADGE_RATIO = { appstore: 119.66407 / 40, playstore: 238.96 / 70.87 };

// The biggest window of the image with the poster's shape, centred ("fill").
function cropRect(imgW, imgH, ratio) {
  if (imgW / imgH > ratio) {
    const sw = Math.round(imgH * ratio);
    return { sx: Math.round((imgW - sw) / 2), sy: 0, sw, sh: imgH };
  }
  const sh = Math.round(imgW / ratio);
  return { sx: 0, sy: Math.round((imgH - sh) / 2), sw: imgW, sh };
}

// One 120-unit tile per pattern, repeated over the background. Drawn with canvas,
// not loaded as SVG, so recoloring is instant.
const PATTERNS = {
  // Same two paws as the app's sheet texture (daily_plan_project home.html).
  paw(t) {
    for (const [x, y, deg] of [[14, 14, -15], [80, 76, 20]]) {
      t.save();
      t.translate(x, y);
      t.rotate((deg * Math.PI) / 180);
      t.beginPath();
      t.ellipse(8, 12, 5, 4, 0, 0, Math.PI * 2);
      for (const [cx, cy] of [[2.5, 5], [6.5, 2], [11, 2.5], [14, 6]]) {
        t.moveTo(cx + 2, cy);
        t.arc(cx, cy, 2, 0, Math.PI * 2);
      }
      t.fill();
      t.restore();
    }
  },
  dots(t) {
    t.beginPath();
    for (const [cx, cy] of [[30, 30], [90, 90]]) {
      t.moveTo(cx + 9, cy);
      t.arc(cx, cy, 9, 0, Math.PI * 2);
    }
    t.fill();
  },
  // 60-unit spacing divides the tile, so the diagonals meet across tile edges.
  stripes(t) {
    t.beginPath();
    for (let c = -120; c <= 120; c += 60) {
      t.moveTo(c, 0);
      t.lineTo(c + 120, 120);
    }
    t.lineWidth = 16;
    t.stroke();
  },
};

function patternTile(type, px, color, alpha) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = Math.max(4, Math.round(px));
  const t = tile.getContext("2d");
  t.scale(tile.width / 120, tile.width / 120);
  t.fillStyle = t.strokeStyle = color;
  t.globalAlpha = alpha;
  PATTERNS[type](t);
  return tile;
}

// Fredoka and Nunito have no Japanese or Chinese letters. Listing Noto second
// lets the browser use it only for those letters, so Latin and numbers keep Stubby's font.
const CJK_FONT = { ja: "Noto Sans JP", "zh-CN": "Noto Sans SC" };

// Japanese and Chinese have no spaces, so a line may break after any of their
// characters. Closing punctuation stays glued to the character before it.
const TOKEN = /[぀-ヿ㐀-鿿豈-﫿][、。，．！？」』）ー〜…]*|[^\s぀-ヿ㐀-鿿豈-﫿]+|\s+/g;

// Canvas has no auto-wrap. "\n" in the text forces a new line.
function wrapLines(ctx, text, maxW) {
  if (!text.trim()) return [];
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const token of para.match(TOKEN) || []) {
      const next = line + token;
      if (line.trim() && ctx.measureText(next.trimEnd()).width > maxW) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = next;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Returns { text: rectangle the lines cover (null if no text), overflow: true if
// the words or badges don't fit inside the box }.
function drawBox(ctx, W, H, b, badges, lang, withText) {
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  const px = b.size * W;

  ctx.fillStyle = b.fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(px * 0.6, h / 2));
  ctx.fill();

  const family = CJK_FONT[lang] ? `${b.font}, "${CJK_FONT[lang]}"` : b.font;
  ctx.font = `${b.weight} ${px}px ${family}`;
  const pad = px * 0.5;
  const lines = wrapLines(ctx, b.text[lang], w - pad * 2);
  const lineH = px * LINE_HEIGHT[b.font];
  const shown = ["appstore", "playstore"].filter((k) => b[k]);
  const badgeH = shown.length ? px * 1.8 : 0;
  const gap = badgeH && lines.length ? px * 0.6 : 0;
  // Text and badges sit as one block in the middle of the box.
  const top = y + (h - (lines.length * lineH + gap + badgeH)) / 2;

  ctx.fillStyle = b.color;
  ctx.textAlign = b.align;
  ctx.textBaseline = "middle";
  const tx = b.align === "left" ? x + pad : b.align === "right" ? x + w - pad : x + w / 2;
  if (withText) lines.forEach((line, i) => ctx.fillText(line, tx, top + lineH * (i + 0.5)));

  let textRect = null;
  let widest = 0;
  if (lines.length) {
    widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const left = b.align === "left" ? tx : b.align === "right" ? tx - widest : tx - widest / 2;
    textRect = { x: left, y: top, w: widest, h: lines.length * lineH };
  }

  let badgesW = 0;
  if (badgeH) {
    const between = b.badgeGap * W;
    const widths = shown.map((k) => badgeH * BADGE_RATIO[k]);
    badgesW = widths.reduce((sum, bw) => sum + bw, 0) + between * (shown.length - 1);
    let bx = b.align === "left" ? x + pad : b.align === "right" ? x + w - pad - badgesW : x + (w - badgesW) / 2;
    const by = top + lines.length * lineH + gap;
    shown.forEach((k, i) => {
      ctx.drawImage(badges[k], bx, by, widths[i], badgeH);
      bx += widths[i] + between;
    });
  }

  // +1 px of slack so rounding never flags text that fits.
  const overflow = top < y - 1 || Math.max(widest, badgesW) > w - pad * 2 + 1;
  return { text: textRect, overflow };
}

// p: { img, crop, bg, boxes, lang } — see poster.js. Draws at the canvas's own size.
// withText false draws everything except the words: what the text will sit on.
// Returns { boxName: drawBox result } for the shown boxes.
function drawPoster(canvas, p, badges, withText = true) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = p.bg.color;
  ctx.fillRect(0, 0, W, H);
  if (PATTERNS[p.bg.type] && p.bg.alpha > 0) {
    ctx.fillStyle = ctx.createPattern(patternTile(p.bg.type, p.bg.size * W, p.bg.ink, p.bg.alpha), "repeat");
    ctx.fillRect(0, 0, W, H);
  }

  const c = p.crop;
  ctx.drawImage(p.img, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);

  const rects = {};
  for (const [name, b] of Object.entries(p.boxes)) {
    if (b.show) rects[name] = drawBox(ctx, W, H, b, badges, p.lang, withText);
  }
  return rects;
}
