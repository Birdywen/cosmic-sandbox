export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
  trail: { x: number; y: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface SimParams {
  G: number;
  dt: number;
  massMin: number;
  massMax: number;
  trailLength: number;
  particlesPerExplosion: number;
  paused: boolean;
}

export const NEON = [
  "#00fff7",
  "#ff00e5",
  "#b026ff",
  "#f5d000",
  "#39ff14",
  "#ff3860",
  "#00a3ff",
];

let idCounter = 1;
export const nextId = () => idCounter++;

export function massToRadius(mass: number): number {
  return Math.max(2.5, Math.cbrt(mass) * 3.2);
}

export function radiusToMass(radius: number): number {
  return Math.pow(radius / 3.2, 3);
}

export function randomColor(): string {
  return NEON[Math.floor(Math.random() * NEON.length)];
}

/**
 * One physics integration step using semi-implicit Euler.
 * Gravitational acceleration: a = G * m2 / r^2  (direction toward other body)
 * Uses a softening term to avoid singularities at very small r.
 */
export function stepPhysics(bodies: Body[], params: SimParams, width: number, height: number) {
  const { G, dt } = params;
  const n = bodies.length;
  const ax = new Array(n).fill(0);
  const ay = new Array(n).fill(0);
  const soft = 4;

  // Pairwise Newtonian gravity
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy + soft * soft;
      const dist = Math.sqrt(distSq);
      const invDist3 = 1 / (distSq * dist);

      // force magnitude factor shared: G / r^3
      const f = G * invDist3;
      // a experiences pull from b (mass b), b from a (mass a)
      ax[i] += f * b.mass * dx;
      ay[i] += f * b.mass * dy;
      ax[j] -= f * a.mass * dx;
      ay[j] -= f * a.mass * dy;
    }
  }

  for (let i = 0; i < n; i++) {
    const body = bodies[i];
    body.vx += ax[i] * dt;
    body.vy += ay[i] * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;

    // Clamp velocity to a sane maximum to keep the sim stable
    const speed = Math.hypot(body.vx, body.vy);
    const maxSpeed = 60;
    if (speed > maxSpeed) {
      body.vx = (body.vx / speed) * maxSpeed;
      body.vy = (body.vy / speed) * maxSpeed;
    }
  }

  // Update trails
  for (const body of bodies) {
    body.trail.push({ x: body.x, y: body.y });
    if (body.trail.length > params.trailLength) body.trail.shift();
  }
}

export interface MergeEvent {
  x: number;
  y: number;
  mass: number;
  color: string;
}

/**
 * Detect collisions and merge conserves mass + momentum.
 * Returns surviving bodies and list of merge events for particle FX.
 */
export function resolveCollisions(bodies: Body[], params: SimParams): { bodies: Body[]; events: MergeEvent[] } {
  const events: MergeEvent[] = [];
  const removed = new Set<number>();
  const merged: Body[] = bodies.map((b) => ({ ...b, trail: [...b.trail] }));

  for (let i = 0; i < merged.length; i++) {
    if (removed.has(merged[i].id)) continue;
    for (let j = i + 1; j < merged.length; j++) {
      if (removed.has(merged[j].id)) continue;
      const a = merged[i];
      const b = merged[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < a.radius + b.radius) {
        const totalMass = a.mass + b.mass;
        // momentum conservation: v = (m1v1 + m2v2) / (m1+m2)
        const vx = (a.mass * a.vx + b.mass * b.vx) / totalMass;
        const vy = (a.mass * a.vy + b.mass * b.vy) / totalMass;
        // center of mass position
        const x = (a.mass * a.x + b.mass * b.x) / totalMass;
        const y = (a.mass * a.y + b.mass * b.y) / totalMass;

        a.x = x;
        a.y = y;
        a.vx = vx;
        a.vy = vy;
        a.mass = totalMass;
        a.radius = massToRadius(totalMass);
        a.color = totalMass > b.mass ? a.color : b.color;
        // keep the richer trail
        a.trail = a.trail.length >= b.trail.length ? a.trail : b.trail;

        removed.add(b.id);
        events.push({ x, y, mass: totalMass, color: a.color });
      }
    }
  }

  return { bodies: merged.filter((b) => !removed.has(b.id)), events };
}

export function spawnParticles(
  event: MergeEvent,
  count: number,
  particles: Particle[]
) {
  const base = Math.min(24, 6 + Math.log2(event.mass + 1) * 2);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 90 + base;
    particles.push({
      x: event.x,
      y: event.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.6 + Math.random() * 0.7,
      color: Math.random() < 0.35 ? "#ffffff" : event.color,
      size: 1 + Math.random() * 2.2,
    });
  }
}

export function stepParticles(particles: Particle[], dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= dt / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
