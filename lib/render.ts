import { Body, Particle } from "./physics";

/**
 * Draw the spacetime-warp grid. Each grid vertex is displaced toward
 * nearby massive bodies, approximating gravitational lensing / well distortion.
 */
export function drawWarpGrid(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  width: number,
  height: number,
  spacing: number
) {
  ctx.save();
  ctx.lineWidth = 1;

  const cols = Math.ceil(width / spacing) + 1;
  const rows = Math.ceil(height / spacing) + 1;

  const grid: [number, number][][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = distort(c * spacing, r * spacing, bodies);
    }
  }

  for (let c = 0; c < cols; c++) {
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      const [px, py] = grid[r][c];
      if (r === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(0, 255, 247, 0.10)";
    ctx.stroke();
  }

  for (let r = 0; r < rows; r++) {
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const [px, py] = grid[r][c];
      if (c === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(176, 38, 255, 0.08)";
    ctx.stroke();
  }

  ctx.restore();
}

function distort(gx: number, gy: number, bodies: Body[]): [number, number] {
  let dx = 0;
  let dy = 0;
  for (const b of bodies) {
    const vx = gx - b.x;
    const vy = gy - b.y;
    const distSq = vx * vx + vy * vy;
    const dist = Math.sqrt(distSq) || 1;
    // pull magnitude grows with mass, falls off with distance
    const pull = (b.mass * 140) / (distSq + 900);
    dx -= (vx / dist) * pull;
    dy -= (vy / dist) * pull;
  }
  return [gx + dx, gy + dy];
}

/**
 * Draw a glowing body with trail fade. Bloom is faked with layered
 * radial gradients + shadowBlur for performance.
 */
export function drawBody(ctx: CanvasRenderingContext2D, body: Body) {
  const t = body.trail;
  if (t.length > 1) {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < t.length; i++) {
      const alpha = (i / t.length) * 0.75;
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x, t[i - 1].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.strokeStyle = hexAlpha(body.color, alpha);
      ctx.lineWidth = (i / t.length) * body.radius * 0.9 + 0.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  const glowR = body.radius * 4;
  const grad = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, glowR);
  grad.addColorStop(0, hexAlpha(body.color, 0.9));
  grad.addColorStop(0.25, hexAlpha(body.color, 0.35));
  grad.addColorStop(1, hexAlpha(body.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(body.x, body.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = body.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.radius * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = hexAlpha(body.color, 0.95);
  ctx.beginPath();
  ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSpawnPreview(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  release: { x: number; y: number },
  color: string
) {
  const dx = start.x - release.x;
  const dy = start.y - release.y;
  ctx.save();

  ctx.strokeStyle = hexAlpha(color, 0.8);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(release.x, release.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + dx, start.y + dy);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = hexAlpha(color, 0.65);
  ctx.fill();

  ctx.restore();
}

/** Convert a hex color to rgba with given alpha. */
export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
