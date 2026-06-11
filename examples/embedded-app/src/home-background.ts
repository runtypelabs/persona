/**
 * Wireframe-tunnel background for the home page: rectangle outlines drift
 * toward the camera, fading with distance. Reproduces the mockup's three.js
 * scene with plain canvas 2D (a perspective divide on four corners) so the
 * demo doesn't ship a WebGL library for ~20 stroked rectangles.
 */

interface Frame {
  x: number;
  y: number;
  z: number;
  rot: number;
  teal: boolean;
}

const FRAME_COUNT = 20;
const TUNNEL_DEPTH = 100;
const SPEED = 0.02;
const FRAME_W = 16;
const FRAME_H = 10;
const NEAR_Z = 1.2;
const BASE_OPACITY = 0.18;
const COLOR_TEAL = '0, 223, 193';
const COLOR_COBALT = '0, 66, 154';

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
      ctx!.strokeRect(-w / 2, -h / 2, w, h);
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
