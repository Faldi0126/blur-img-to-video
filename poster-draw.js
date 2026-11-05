// Drawing only, no UI. Every size here is a fraction of the poster, so the
// small preview and the full-size export come out the same.

// From the Stubby design spec §4: Fredoka roles use 1.25, Nunito roles 1.375.
const LINE_HEIGHT = { Fredoka: 1.25, Nunito: 1.375 };
// The Play badge SVG has no width/height, so browsers can't tell its size. Taken from each viewBox.
const BADGE_RATIO = { appstore: 119.66407 / 40, playstore: 238.96 / 70.87 };
// Stubby's sheet color (#EDF3EA) as "r, g, b": the light tint every text backdrop uses.
const BACKDROP_TINT = "237, 243, 234";

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

// Canvas has no auto-wrap and one font per fillText, so lines are built word by
// word, each word measured in its own font. Markup: "**" switches bold, "_" italic;
// both carry over "\n" so one B press can cover two lines. "\n" forces a new line.
// Returns [{ words: [{ t, font, w }], w }].
function layoutText(ctx, b, lang, px, maxW) {
  const text = b.text[lang];
  if (!text.trim()) return [];
  const family = CJK_FONT[lang] ? `${b.font}, "${CJK_FONT[lang]}"` : b.font;
  const lines = [];
  let bold = false, italic = false;
  for (const para of text.split("\n")) {
    let line = [], w = 0;
    for (const part of para.split(/(\*\*|_)/)) {
      if (part === "**" || part === "_") {
        if (part === "**") bold = !bold;
        else italic = !italic;
        continue;
      }
      // 1000 is the CSS maximum; a font with a lower top weight draws its heaviest.
      // Our fonts have no italic files, so the browser slants the normal letters.
      ctx.font = `${italic ? "italic " : ""}${bold ? Math.min(1000, b.weight + 300) : b.weight} ${px}px ${family}`;
      for (const t of part.match(TOKEN) || []) {
        const space = !t.trim();
        if (space && !line.length) continue;
        const word = { t, font: ctx.font, w: ctx.measureText(t).width };
        if (!space && line.length && w + word.w > maxW) {
          lines.push(line);
          line = [];
          w = 0;
        }
        line.push(word);
        w += word.w;
      }
    }
    lines.push(line);
  }
  return lines.map((words) => {
    while (words.length && !words.at(-1).t.trim()) words.pop();
    return { words, w: words.reduce((sum, k) => sum + k.w, 0) };
  });
}

// Returns { text: rectangle the lines cover (null if no text), overflow: true if
// the words or badges don't fit inside the box }.
function drawBox(ctx, W, H, b, badges, lang, withText) {
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  const px = b.size * W;

  const radius = Math.min(px * 0.6, h / 2);

  // Backdrops keep text readable on busy images. Header and footer only; the bubble has its own fill.
  if (b.backdrop === "fade") {
    // Sheet color, solid at the poster's nearest edge, fading out half a box past the far side.
    const fromTop = y + h / 2 < H / 2;
    const y0 = fromTop ? 0 : H, y1 = fromTop ? y + h * 1.5 : y - h * 0.5;
    const fade = ctx.createLinearGradient(0, y0, 0, y1);
    fade.addColorStop(0, `rgba(${BACKDROP_TINT}, 0.96)`);
    fade.addColorStop(0.7, `rgba(${BACKDROP_TINT}, 0.88)`);
    fade.addColorStop(1, `rgba(${BACKDROP_TINT}, 0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  } else if (b.backdrop === "frosted") {
    // Blur by shrinking what is under the box to a few pixels per 2% of the poster and
    // stretching it back. It looks like a blur filter and, unlike ctx.filter, works on iPhones before iOS 18.
    const sx = Math.max(0, x - W * 0.03), sy = Math.max(0, y - W * 0.03);
    const sw = Math.min(W, x + w + W * 0.03) - sx, sh = Math.min(H, y + h + W * 0.03) - sy;
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(sw / (W * 0.02)));
    small.height = Math.max(1, Math.round(sh / (W * 0.02)));
    const sctx = small.getContext("2d");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, small.width, small.height);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    ctx.drawImage(small, sx, sy, sw, sh);
    ctx.fillStyle = `rgba(${BACKDROP_TINT}, 0.62)`;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = Math.max(1, W * 0.0028);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke();
  }

  ctx.fillStyle = b.fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();

  const pad = px * 0.5;
  const lines = layoutText(ctx, b, lang, px, w - pad * 2);
  const lineH = px * LINE_HEIGHT[b.font];
  const shown = ["appstore", "playstore"].filter((k) => b[k]);
  const badgeH = shown.length ? px * 1.8 : 0;
  const gap = badgeH && lines.length ? px * 0.6 : 0;
  // Text and badges sit as one block in the middle of the box.
  const top = y + (h - (lines.length * lineH + gap + badgeH)) / 2;
  // Left edge of a row `rowW` wide, from the box's alignment.
  const startX = (rowW) => (b.align === "left" ? x + pad : b.align === "right" ? x + w - pad - rowW : x + (w - rowW) / 2);

  ctx.fillStyle = b.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // dx shifts every word sideways; the glow uses it to draw its text off the canvas.
  const drawText = (dx) => lines.forEach((line, i) => {
    let lx = startX(line.w) + dx;
    for (const word of line.words) {
      ctx.font = word.font;
      ctx.fillText(word.t, lx, top + lineH * (i + 0.5));
      lx += word.w;
    }
  });
  if (b.backdrop === "glow") {
    // Only the halo lands on the poster: the text is drawn far off the canvas and its
    // shadow is shifted back. So the contrast check, which draws without text, still
    // sees the halo. A tight blur drawn three times hugs the letters like a soft sticker
    // edge; a wide one fades out before it can lift dark text off a dark image.
    ctx.save();
    ctx.shadowColor = `rgba(${BACKDROP_TINT}, 0.95)`;
    ctx.shadowBlur = px * 0.35;
    ctx.shadowOffsetX = W * 10;
    for (let i = 0; i < 3; i++) drawText(-W * 10);
    ctx.restore();
  }
  if (withText) drawText(0);

  let textRect = null;
  let widest = 0;
  if (lines.length) {
    widest = Math.max(...lines.map((l) => l.w));
    textRect = { x: startX(widest), y: top, w: widest, h: lines.length * lineH };
  }

  let badgesW = 0;
  if (badgeH) {
    const between = b.badgeGap * W;
    const widths = shown.map((k) => badgeH * BADGE_RATIO[k]);
    badgesW = widths.reduce((sum, bw) => sum + bw, 0) + between * (shown.length - 1);
    let bx = startX(badgesW);
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

// Where the text may go inside each shape, as a share of the bubble's width and height.
// Round and spiky shapes lose their corners, so their text area is smaller.
const BUBBLE_INNER = { stubby: [0.92, 0.7], oval: [0.78, 0.66], cloud: [0.7, 0.6], shout: [0.6, 0.5], whisper: [0.78, 0.66] };

// b: the bubble (see poster.js); b.x/y/w/h is its body, b.tx/ty the tail's tip. The tip
// is a point on the poster, so moving the body keeps the tail aimed at the same spot.
// The text shrinks until it fits, never above b.size. Returns the same as drawBox.
function drawBubble(ctx, W, H, b, lang, withText) {
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
  const s = Math.min(w, h);
  const tip = [b.tx * W, b.ty * H];
  // b.root: where the tail leaves the body, as an angle around the center. null means
  // "facing the tip". An angle moves and resizes with the body, a point would not.
  const a = b.root ?? Math.atan2(tip[1] - cy, tip[0] - cx);
  const ux = Math.cos(a), uy = Math.sin(a);
  // How far the body's edge is from the center along the tail's direction. The tail
  // starts well inside it, so the body's fill covers the joint. The other shapes are
  // close enough to an ellipse; Stubby's is a rounded rectangle, and the editor's dot
  // has to sit on its real edge.
  let edge = (rx * ry) / Math.hypot(ry * ux, rx * uy);
  if (b.shape === "stubby") {
    const r = s * 0.3, ax = Math.abs(ux), ay = Math.abs(uy);
    edge = Math.min(ax ? rx / ax : Infinity, ay ? ry / ay : Infinity);
    if (ax * edge > rx - r && ay * edge > ry - r) {
      // Leaves through a rounded corner: where the ray meets the corner's circle, t² - 2t(u·c) + |c|² - r² = 0.
      const cx0 = rx - r, cy0 = ry - r, uc = ax * cx0 + ay * cy0;
      edge = uc + Math.sqrt(uc * uc - (cx0 * cx0 + cy0 * cy0 - r * r));
    }
  }
  // Stubby's tail is a short flick rooted near the edge (the SVG in home.html);
  // comic tails are wider wedges rooted deeper in.
  const depth = b.shape === "stubby" ? 0.85 : 0.6;
  const base = [cx + ux * edge * depth, cy + uy * edge * depth];
  // The tail's width is measured across its own direction, root to tip. That equals the
  // center-to-tip direction until the root is moved.
  const run = Math.hypot(tip[0] - base[0], tip[1] - base[1]) || 1;
  const dx = (tip[0] - base[0]) / run, dy = (tip[1] - base[1]) / run;
  // Stubby's thin tail grows wider as it gets longer, or a far tip turns it into a
  // horn; capped so its root never pokes out past a corner of the body.
  const half = b.shape === "stubby" ? Math.min(s * 0.2, s * 0.1 + run * 0.07) : s * 0.14;
  let b1 = [base[0] - dy * half, base[1] + dx * half];
  let b2 = [base[0] + dy * half, base[1] - dx * half];
  // Body and tail are filled as one path, so both must wind clockwise, or the
  // overlap would cancel out and leave a hole.
  const turn = (tip[0] - b1[0]) * (b2[1] - b1[1]) - (tip[1] - b1[1]) * (b2[0] - b1[0]);
  if (turn < 0) [b1, b2] = [b2, b1];

  // The body is kept apart from the tail: the shadow falls under the body only,
  // because a shadow on a thin tail looks like a dirty streak.
  const body = new Path2D();
  const polygon = (path, pts) => { path.moveTo(...pts[0]); for (const p of pts.slice(1)) path.lineTo(...p); path.closePath(); };
  const around = (k, n, r) => [cx + rx * r * Math.cos((k / n) * Math.PI * 2), cy + ry * r * Math.sin((k / n) * Math.PI * 2)];

  if (b.shape === "stubby") {
    body.roundRect(x, y, w, h, s * 0.3);
  } else if (b.shape === "cloud") {
    // 10 puffs: each is a curve bulging out past the points between them.
    const n = 10;
    body.moveTo(...around(0, n, 0.86));
    for (let k = 0; k < n; k++) body.quadraticCurveTo(...around(k + 0.5, n, 1.16), ...around(k + 1, n, 0.86));
    body.closePath();
    // A thought trails off in shrinking circles instead of a pointed tail.
    const from = [cx + ux * edge, cy + uy * edge];
    [[0.3, 0.1], [0.62, 0.07], [0.9, 0.045]].forEach(([t, r]) => {
      const px = from[0] + (tip[0] - from[0]) * t, py = from[1] + (tip[1] - from[1]) * t;
      body.moveTo(px + s * r, py);
      body.arc(px, py, s * r, 0, Math.PI * 2);
    });
  } else if (b.shape === "shout") {
    // Spikes of uneven length look hand-drawn, like a manga shout.
    const n = 28;
    polygon(body, Array.from({ length: n }, (_, k) => around(k, n, k % 2 ? 0.74 : [1, 0.9, 0.96][(k / 2) % 3])));
  } else {
    body.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  const path = new Path2D(body);
  if (b.shape === "stubby") {
    // Stubby's tail droops like the app's (home.html): both sides bow the same amount
    // toward the lower side, whichever way the tail points. Each side gets its own
    // bend point; one shared point would pinch the tail thin in the middle.
    const down = b1[1] > b2[1] ? b1 : b2;
    const sag = [(down[0] - base[0]) * 1.6, (down[1] - base[1]) * 1.6];
    path.moveTo(...b1);
    path.quadraticCurveTo((b1[0] + tip[0]) / 2 + sag[0], (b1[1] + tip[1]) / 2 + sag[1], ...tip);
    path.quadraticCurveTo((b2[0] + tip[0]) / 2 + sag[0], (b2[1] + tip[1]) / 2 + sag[1], ...b2);
    path.closePath();
  } else if (b.shape !== "cloud") {
    polygon(path, [b1, tip, b2]);
  }

  ctx.save();
  // The app's bubble shadow, 0 6px 16px rgba(53,55,61,.1) on a 390 px wide phone. The
  // body is drawn far off the canvas so only its shadow lands here; the fill below
  // then draws once, so a see-through fill is not darkened twice.
  ctx.save();
  ctx.shadowColor = "rgba(53, 55, 61, 0.1)";
  ctx.shadowOffsetX = W * 10;
  ctx.shadowOffsetY = W * 0.015;
  ctx.shadowBlur = W * 0.04;
  ctx.translate(-W * 10, 0);
  ctx.fill(body);
  ctx.restore();
  if (b.lineW > 0) {
    // Twice as wide, then the fill covers the inner half: the outline stays outside
    // the shape and the line where tail meets body disappears.
    ctx.lineWidth = b.lineW * W * 2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = b.line;
    if (b.shape === "whisper") ctx.setLineDash([b.lineW * W * 3, b.lineW * W * 3]);
    ctx.stroke(path);
  }
  ctx.fillStyle = b.fill;
  ctx.fill(path);
  ctx.restore();

  const [fw, fh] = BUBBLE_INNER[b.shape];
  const iw = w * fw, ih = h * fh;
  // Same test drawBox uses for overflow; its padding is half the font size on each side.
  const fits = (px) => {
    const lines = layoutText(ctx, b, lang, px, iw - px);
    return lines.length * px * LINE_HEIGHT[b.font] <= ih + 1 && lines.every((l) => l.w <= iw - px + 1);
  };
  let px = b.size * W;
  if (!fits(px)) {
    // Binary search: halve the gap between "fits" and "too big" until it is tiny.
    let lo = W * 0.01, hi = px;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    px = lo;
  }
  const inner = { x: (cx - iw / 2) / W, y: (cy - ih / 2) / H, w: iw / W, h: ih / H, size: px / W, fill: "rgba(0, 0, 0, 0)" };
  // root: where the body's edge meets the tail, as poster fractions, for the editor's dot.
  return { ...drawBox(ctx, W, H, { ...b, ...inner }, null, lang, withText), root: [(cx + ux * edge) / W, (cy + uy * edge) / H] };
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
  const { bubble, ...boxes } = p.boxes;
  // On the image, under the header and footer.
  if (bubble.show) rects.bubble = drawBubble(ctx, W, H, bubble, p.lang, withText);
  for (const [name, b] of Object.entries(boxes)) {
    if (b.show) rects[name] = drawBox(ctx, W, H, b, badges, p.lang, withText);
  }
  return rects;
}
