// WCAG 2 contrast: how different two colors look in brightness, from 1:1 to 21:1.
// 4.5 is the bar for normal text, 3 for big text.

// WCAG relative luminance of one 0–255 sRGB channel, precomputed for speed.
const CHANNEL_LUM = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const luminance = (r, g, b) => 0.2126 * CHANNEL_LUM[r] + 0.7152 * CHANNEL_LUM[g] + 0.0722 * CHANNEL_LUM[b];
const contrastOf = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// The text sits on many colors at once (photo, paws, box color), so we get one
// ratio per sampled pixel. We report the 5th-worst percent: the worst single pixel
// would let one bright speck in a photo fail everything, while the average hides
// a busy patch right behind the words.
function summarizeContrast(ratios) {
  const sorted = Float64Array.from(ratios).sort();
  return sorted[Math.floor(sorted.length * 0.05)];
}

// canvas: the poster drawn WITHOUT text. rect: where the text goes. text: [r, g, b, alpha 0–1].
function measureContrast(canvas, rect, [tr, tg, tb, ta]) {
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width - x, Math.ceil(rect.w)), h = Math.min(canvas.height - y, Math.ceil(rect.h));
  if (w <= 0 || h <= 0) return null;
  const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
  // See-through text shows the background inside the letters, so blend before comparing.
  const mix = (t, bg) => Math.round(ta * t + (1 - ta) * bg);
  // About 4000 samples is plenty and keeps dragging smooth.
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  const ratios = [];
  for (let row = 0; row < h; row += step) {
    for (let col = 0; col < w; col += step) {
      const i = (row * w + col) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      ratios.push(contrastOf(luminance(mix(tr, r), mix(tg, g), mix(tb, b)), luminance(r, g, b)));
    }
  }
  return summarizeContrast(ratios);
}
