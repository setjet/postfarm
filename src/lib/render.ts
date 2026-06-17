// Client-side slide renderer. Each slide becomes a 1080×1920 PNG drawn on a
// canvas — text over a gradient. No image-generation API, no cost, deterministic
// output. The resulting data URLs are sent to the server, which uploads them to
// post-bridge as the post's media.
//
// Caption geometry (font %, stroke, line-height, padding, centering) comes from
// lib/captionStyle.ts — the SAME constants the editor preview uses — so the
// scheduled PNG matches what the user saw when editing.
import type { Slide, Slideshow } from '../types';
import { FONT_SIZE_PCT, STROKE_RATIO, LINE_HEIGHT, SIDE_PAD_PCT, pct } from './captionStyle';

const W = 1080;
const H = 1920;

// Word-wrap within hard newlines, mirroring the preview's wrapping.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { out.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

// Draw an image to cover the whole canvas (object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function fillSlideBackground(ctx: CanvasRenderingContext2D, slide: Slide) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, slide.bgFrom || '#0f172a');
  grad.addColorStop(1, slide.bgTo || '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

async function drawImageOrGradient(ctx: CanvasRenderingContext2D, slide: Slide, darken = 0.45) {
  if (slide.imageUrl) {
    try {
      const img = await loadImage(slide.imageUrl);
      drawCover(ctx, img);
      ctx.fillStyle = `rgba(0,0,0,${darken})`;
      ctx.fillRect(0, 0, W, H);
      return;
    } catch {
      // fall through to gradient
    }
  }
  fillSlideBackground(ctx, slide);
}

export async function renderSlide(slide: Slide): Promise<string> {
  // Make sure the web font is ready, otherwise the first render uses a fallback.
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (slide.imageUrl) {
    // Image background (same-origin: bundled at /library/… or scraped via /api/…).
    try {
      const img = await loadImage(slide.imageUrl);
      drawCover(ctx, img);
      // Darken so white text stays readable.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      ctx.fillStyle = slide.bgFrom || '#0f172a';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, slide.bgFrom || '#0f172a');
    grad.addColorStop(1, slide.bgTo || '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle vignette for depth
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Caption: white bold text, black outline, centered — driven by the SAME
  // percentages the editor preview uses, so the two always match.
  const fontPx = Math.round(H * pct(FONT_SIZE_PCT));
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(2, Math.round(fontPx * STROKE_RATIO));

  ctx.font = `800 ${fontPx}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = W * (1 - 2 * pct(SIDE_PAD_PCT));
  const lines = wrap(ctx, slide.text || '', maxWidth);
  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2; // vertically centered, matching the preview
  const x = W / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Paint stroke first, fill on top — same effect as CSS paint-order: stroke fill.
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeW;
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], x, y);
  }

  return canvas.toDataURL('image/png');
}

function notesDataFrom(show: Slideshow) {
  const fallbackText = show.slides?.[1]?.text || show.caption || '';
  return show.notesData || {
    hookText: show.hook || show.slides?.[0]?.text || '',
    noteTitle: 'notes',
    points: fallbackText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((line) => ({ heading: line, body: '' })),
  };
}

function stripPointNumber(text: string) {
  return String(text || '').replace(/^\s*(?:\d+[).:-]\s*)+/, '').trim();
}

function notesText(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function renderNotesHookSlide(show: Slideshow): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const slide = show.slides[0] || {};
  await drawImageOrGradient(ctx, slide, 0.42);

  const text = notesDataFrom(show).hookText || show.hook || slide.text || '';
  const fontPx = 84;
  const lineHeight = 96;
  const maxWidth = W - 180;
  ctx.font = `900 ${fontPx}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  const lines = wrap(ctx, text.toLowerCase(), maxWidth);
  const blockH = lines.length * lineHeight;
  const y = H * 0.58 - blockH / 2;
  for (let i = 0; i < lines.length; i++) {
    const yy = y + i * lineHeight;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 10;
    ctx.strokeText(lines[i], W / 2, yy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], W / 2, yy);
  }

  return canvas.toDataURL('image/png');
}

function notesMetrics(scale: number, gapScale: number) {
  const px = (value: number, min: number) => Math.max(min, Math.round(value * scale));
  const gap = (value: number, min: number) => Math.max(min, Math.round(value * gapScale));
  return {
    margin: 96,
    topY: 128,
    bottomY: H - 116,
    datePx: px(38, 28),
    titlePx: px(64, 46),
    headingPx: px(46, 34),
    bodyPx: px(39, 30),
    dateGap: gap(72, 44),
    titleGap: gap(46, 22),
    pointGap: gap(42, 18),
    bodyTopGap: gap(12, 6),
  };
}

type NotesMetrics = ReturnType<typeof notesMetrics>;

function font(weight: number, px: number) {
  return `${weight} ${px}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function preparedPoints(data: ReturnType<typeof notesDataFrom>) {
  return data.points.slice(0, 5).map((point) => ({
    heading: stripPointNumber(point.heading),
    body: notesText(point.body),
  })).filter((point) => point.heading || point.body);
}

function measureNotes(ctx: CanvasRenderingContext2D, data: ReturnType<typeof notesDataFrom>, m: NotesMetrics) {
  const maxWidth = W - m.margin * 2;
  let total = Math.round(m.datePx * 1.25) + m.dateGap;
  if (data.noteTitle) {
    ctx.font = font(700, m.titlePx);
    total += wrap(ctx, notesText(data.noteTitle), maxWidth).length * Math.round(m.titlePx * 1.12) + m.titleGap;
  }
  const points = preparedPoints(data);
  points.forEach((point, index) => {
    ctx.font = font(700, m.headingPx);
    total += wrap(ctx, `${index + 1}. ${notesText(point.heading)}`, maxWidth).length * Math.round(m.headingPx * 1.18);
    if (point.body) {
      ctx.font = font(400, m.bodyPx);
      total += m.bodyTopGap + wrap(ctx, point.body, maxWidth).length * Math.round(m.bodyPx * 1.28);
    }
    if (index < points.length - 1) total += m.pointGap;
  });
  return total;
}

function fitNotesMetrics(ctx: CanvasRenderingContext2D, data: ReturnType<typeof notesDataFrom>) {
  const available = H - 128 - 116;
  for (let scale = 1; scale >= 0.72; scale -= 0.035) {
    for (let gapScale = 1; gapScale >= 0.55; gapScale -= 0.075) {
      const m = notesMetrics(scale, gapScale);
      if (measureNotes(ctx, data, m) <= available) return m;
    }
  }
  return notesMetrics(0.72, 0.55);
}

function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  fillStyle: string
) {
  ctx.fillStyle = fillStyle;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length * lineHeight;
}

async function renderNotesValueSlide(show: Slideshow): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const data = notesDataFrom(show);
  const points = preparedPoints(data);

  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, W, H);

  const m = fitNotesMetrics(ctx, data);
  const maxWidth = W - m.margin * 2;
  const date = data.noteDate || new Date().toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  let y = m.topY;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = font(500, m.datePx);
  drawWrappedLines(ctx, [notesText(date)], W / 2, y, Math.round(m.datePx * 1.25), '#a5a29b');
  y += Math.round(m.datePx * 1.25) + m.dateGap;

  ctx.textAlign = 'left';
  if (data.noteTitle) {
    ctx.font = font(700, m.titlePx);
    const titleLineHeight = Math.round(m.titlePx * 1.12);
    const titleLines = wrap(ctx, notesText(data.noteTitle), maxWidth);
    y += drawWrappedLines(ctx, titleLines, m.margin, y, titleLineHeight, '#1d1d1f') + m.titleGap;
  }

  points.forEach((point, index) => {
    const headingLineHeight = Math.round(m.headingPx * 1.18);
    const bodyLineHeight = Math.round(m.bodyPx * 1.28);
    ctx.font = font(700, m.headingPx);
    const headingLines = wrap(ctx, `${index + 1}. ${notesText(point.heading)}`, maxWidth);
    if (y + headingLines.length * headingLineHeight > m.bottomY) return;
    y += drawWrappedLines(ctx, headingLines, m.margin, y, headingLineHeight, '#1d1d1f');

    if (point.body) {
      y += m.bodyTopGap;
      ctx.font = font(400, m.bodyPx);
      const bodyLines = wrap(ctx, point.body, maxWidth);
      const remaining = Math.floor((m.bottomY - y) / bodyLineHeight);
      const visibleLines = bodyLines.slice(0, Math.max(0, remaining));
      if (visibleLines.length < bodyLines.length && visibleLines.length > 0) {
        visibleLines[visibleLines.length - 1] = '+ more in caption';
      }
      y += drawWrappedLines(ctx, visibleLines, m.margin, y, bodyLineHeight, '#2f2f31');
    }
    if (index < points.length - 1) y += m.pointGap;
  });

  return canvas.toDataURL('image/png');
}

export async function renderNotesSlideshow(show: Slideshow): Promise<string[]> {
  if (!show.notesData) {
    return Promise.all(show.slides.map((slide) => renderSlide(slide)));
  }
  return [await renderNotesHookSlide(show), await renderNotesValueSlide(show)];
}

export async function renderSlideshow(show: Slideshow): Promise<string[]> {
  if (show.format === 'notes') return renderNotesSlideshow(show);
  const out: string[] = [];
  for (const slide of show.slides) {
    out.push(await renderSlide(slide));
  }
  return out;
}
