/**
 * Wireframe-tunnel background for the home page: browser-window outlines drift
 * toward the camera, fading with distance. Reproduces the mockup's three.js
 * scene with plain canvas 2D (a perspective divide on four corners) so the
 * demo doesn't ship a WebGL library for a handful of stroked windows.
 */

interface Frame {
  x: number;
  y: number;
  z: number;
  rot: number;
  teal: boolean;
}

const FRAME_COUNT = 3;
const TUNNEL_DEPTH = 100;
const SPEED = 0.01;
const FRAME_W = 18;
const FRAME_H = 11;
const TITLE_BAR_RATIO = 0.14;
const URL_BAR_RATIO = 0.07;
const NEAR_Z = 1.2;
const BASE_OPACITY = 0.18;
const COLOR_TEAL = '0, 223, 193';
const COLOR_COBALT = '0, 66, 154';

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function strokeBrowserOutline(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const left = -w / 2;
  const top = -h / 2;
  const radius = Math.min(w, h) * 0.05;
  const titleH = h * TITLE_BAR_RATIO;
  const urlH = h * URL_BAR_RATIO;
  const urlInset = w * 0.07;
  const urlTop = top + titleH + h * 0.05;

  traceRoundedRect(ctx, left, top, w, h, radius);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(left, top + titleH);
  ctx.lineTo(left + w, top + titleH);
  ctx.stroke();

  const dotR = Math.max(0.6, w * 0.011);
  const dotY = top + titleH / 2;
  const dotX = left + w * 0.07;
  const dotGap = dotR * 3.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(dotX + i * dotGap, dotY, dotR, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (w > 28) {
    traceRoundedRect(ctx, left + urlInset, urlTop, w - urlInset * 2, urlH, urlH / 2);
    ctx.stroke();
  }
}

export function initHomeBackground(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const frames: Frame[] = Array.from({ length: FRAME_COUNT }, (_, i) => ({
    x: (Math.random() - 0.5) * 6,
    y: (Math.random() - 0.5) * 6,
    z: NEAR_Z + (i / FRAME_COUNT) * TUNNEL_DEPTH,
    rot: (Math.random() - 0.5) * 0.15,
    teal: Math.random() > 0.5,
  }));

  function draw(time: number) {
    ctx!.clearRect(0, 0, width, height);

    // Gentle camera sway, as in the mockup.
    const camX = Math.sin(time * 0.0005) * 0.2;
    const camY = Math.cos(time * 0.0004) * 0.2;
    // World units → pixels at z=1; scales the whole tunnel with the viewport.
    const focal = Math.min(width, height) * 0.16;
    const cx = width / 2;
    const cy = height / 2;

    for (const f of frames) {
      const dist = f.z;
      const alpha = Math.max(0, Math.min(BASE_OPACITY, (dist / 20) * BASE_OPACITY));
      if (alpha <= 0.004) continue;

      const scale = focal / dist;
      const px = cx + (f.x - camX) * scale * 10;
      const py = cy + (f.y - camY) * scale * 10;
      const w = FRAME_W * scale * 10;
      const h = FRAME_H * scale * 10;

      ctx!.save();
      ctx!.translate(px, py);
      ctx!.rotate(f.rot);
      ctx!.strokeStyle = `rgba(${f.teal ? COLOR_TEAL : COLOR_COBALT}, ${alpha})`;
      ctx!.lineWidth = 1;
      strokeBrowserOutline(ctx!, w, h);
      ctx!.restore();
    }
  }

  function advance() {
    for (const f of frames) {
      f.z -= SPEED;
      if (f.z < NEAR_Z) {
        f.z = NEAR_Z + TUNNEL_DEPTH;
        f.x = (Math.random() - 0.5) * 6;
        f.y = (Math.random() - 0.5) * 6;
      }
    }
  }

  if (reducedMotion) {
    draw(0);
    window.addEventListener('resize', () => {
      resize();
      draw(0);
    });
    return;
  }

  function loop(time: number) {
    if (!document.hidden) {
      advance();
      draw(time);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('resize', resize);
}
