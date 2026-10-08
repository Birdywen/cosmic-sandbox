"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Body,
  Particle,
  SimParams,
  massToRadius,
  nextId,
  randomColor,
  resolveCollisions,
  spawnParticles,
  stepParticles,
  stepPhysics,
} from "@/lib/physics";
import { drawBody, drawParticles, drawSpawnPreview, drawWarpGrid } from "@/lib/render";

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  color: string;
  mass: number;
}

const DEFAULT_PARAMS: SimParams = {
  G: 220,
  dt: 0.16,
  massMin: 40,
  massMax: 260,
  trailLength: 60,
  particlesPerExplosion: 80,
  paused: false,
};

export function CosmicSandbox() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const paramsRef = useRef<SimParams>({ ...DEFAULT_PARAMS });
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ width: 0, height: 0 });

  const [params, setParams] = useState<SimParams>({ ...DEFAULT_PARAMS });
  const [bodyCount, setBodyCount] = useState(0);
  const [mergeCount, setMergeCount] = useState(0);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    sizeRef.current = { width: w, height: h };
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Seed a starter system (sun + orbiting planets) once sized.
  useEffect(() => {
    const { width, height } = sizeRef.current;
    const cx = width / 2 || 640;
    const cy = height / 2 || 400;
    const sunMass = 1600;
    const sun: Body = {
      id: nextId(),
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      mass: sunMass,
      radius: massToRadius(sunMass),
      color: "#ff00e5",
      trail: [],
    };
    const seed: Body[] = [sun];
    for (let i = 0; i < 3; i++) {
      const r = 150 + i * 95;
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      const m = 60 + i * 40;
      const speed = Math.sqrt((DEFAULT_PARAMS.G * sunMass) / r);
      const tx = -Math.sin(angle);
      const ty = Math.cos(angle);
      seed.push({
        id: nextId(),
        x: px,
        y: py,
        vx: tx * speed,
        vy: ty * speed,
        mass: m,
        radius: massToRadius(m),
        color: randomColor(),
        trail: [],
      });
    }
    bodiesRef.current = seed;
    setBodyCount(seed.length);
  }, []);

  // Main animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const { width, height } = sizeRef.current;
      if (width === 0) return;
      const p = paramsRef.current;
      const realDt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!p.paused) {
        const steps = 2;
        for (let s = 0; s < steps; s++) {
          stepPhysics(bodiesRef.current, p, width, height);
        }

        const { bodies, events } = resolveCollisions(bodiesRef.current, p);
        if (events.length) {
          bodiesRef.current = bodies;
          for (const ev of events) {
            spawnParticles(ev, p.particlesPerExplosion, particlesRef.current);
          }
          setBodyCount(bodies.length);
          setMergeCount((c) => c + events.length);
        }

        const margin = 4000;
        const before = bodiesRef.current.length;
        bodiesRef.current = bodiesRef.current.filter(
          (b) =>
            b.x > -margin &&
            b.x < width + margin &&
            b.y > -margin &&
            b.y < height + margin
        );
        if (bodiesRef.current.length !== before) {
          setBodyCount(bodiesRef.current.length);
        }

        stepParticles(particlesRef.current, realDt);
      }

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      drawWarpGrid(ctx, bodiesRef.current, width, height, 48);
      for (const b of bodiesRef.current) drawBody(ctx, b);
      drawParticles(ctx, particlesRef.current);

      const drag = dragRef.current;
      if (drag && drag.active) {
        drawSpawnPreview(
          ctx,
          { x: drag.startX, y: drag.startY },
          { x: drag.lastX, y: drag.lastY },
          drag.color
        );
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    const { massMin, massMax } = paramsRef.current;
    const mass = massMin + Math.random() * (massMax - massMin);
    dragRef.current = {
      active: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      color: randomColor(),
      mass,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;
    const { x, y } = pointerPos(e);
    drag.lastX = x;
    drag.lastY = y;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = pointerPos(e);
    const vScale = 2.2;
    const vx = (drag.startX - x) * vScale;
    const vy = (drag.startY - y) * vScale;
    const body: Body = {
      id: nextId(),
      x: drag.startX,
      y: drag.startY,
      vx,
      vy,
      mass: drag.mass,
      radius: massToRadius(drag.mass),
      color: drag.color,
      trail: [],
    };
    bodiesRef.current.push(body);
    setBodyCount(bodiesRef.current.length);
    dragRef.current = null;
  };

  const reset = () => {
    bodiesRef.current = [];
    particlesRef.current = [];
    setBodyCount(0);
    setMergeCount(0);
  };

  const togglePause = () => setParams((p) => ({ ...p, paused: !p.paused }));

  const update = <K extends keyof SimParams>(key: K, value: SimParams[K]) =>
    setParams((p) => ({ ...p, [key]: value }));

  return (
    <div className="flex h-screen w-full flex-col bg-black text-neutral-200 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <div className="pointer-events-none absolute left-4 top-4 select-none font-mono text-xs tracking-widest text-cyan-300/80">
          <div className="text-sm font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(0,255,247,0.8)]">
            COSMIC SANDBOX
          </div>
          <div className="mt-1 text-cyan-500/70">
            点击放置天体 · 按住拖拽设初速度 · 松手发射
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 select-none font-mono text-xs text-fuchsia-400/70">
          <span className="text-cyan-400">{bodyCount}</span> BODIES ·{" "}
          <span className="text-fuchsia-400">{mergeCount}</span> MERGES
        </div>
      </div>

      <ControlPanel
        params={params}
        update={update}
        reset={reset}
        togglePause={togglePause}
        bodyCount={bodyCount}
      />
    </div>
  );
}

interface ControlPanelProps {
  params: SimParams;
  update: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  reset: () => void;
  togglePause: () => void;
  bodyCount: number;
}

function ControlPanel({ params, update, reset, togglePause, bodyCount }: ControlPanelProps) {
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-t border-cyan-500/20 bg-gradient-to-b from-neutral-950 to-black p-5 font-mono lg:w-80 lg:border-l lg:border-t-0">
      <h2 className="mb-4 text-sm font-bold tracking-widest text-cyan-300 drop-shadow-[0_0_6px_rgba(0,255,247,0.7)]">
        ▸ CONTROL PANEL
      </h2>

      <div className="space-y-5">
        <Slider
          label="引力常数 G"
          value={params.G}
          min={0}
          max={800}
          step={10}
          accent="cyan"
          onChange={(v) => update("G", v)}
        />
        <Slider
          label="时间步长 dt"
          value={params.dt}
          min={0.01}
          max={0.5}
          step={0.01}
          accent="fuchsia"
          onChange={(v) => update("dt", v)}
        />
        <Slider
          label="最小质量"
          value={params.massMin}
          min={5}
          max={800}
          step={5}
          accent="cyan"
          onChange={(v) => update("massMin", v)}
        />
        <Slider
          label="最大质量"
          value={params.massMax}
          min={10}
          max={2000}
          step={10}
          accent="fuchsia"
          onChange={(v) => update("massMax", v)}
        />
        <Slider
          label="轨迹长度 (帧)"
          value={params.trailLength}
          min={0}
          max={200}
          step={5}
          accent="cyan"
          onChange={(v) => update("trailLength", v)}
        />
        <Slider
          label="爆炸粒子数"
          value={params.particlesPerExplosion}
          min={0}
          max={300}
          step={10}
          accent="fuchsia"
          onChange={(v) => update("particlesPerExplosion", v)}
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={togglePause}
            className="flex-1 rounded-md border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-xs font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/25 hover:shadow-[0_0_16px_rgba(0,255,247,0.6)]"
          >
            {params.paused ? "▶ RESUME" : "❚❚ PAUSE"}
          </button>
          <button
            onClick={reset}
            className="flex-1 rounded-md border border-fuchsia-400/60 bg-fuchsia-500/10 px-4 py-2 text-xs font-bold tracking-widest text-fuchsia-300 transition-all hover:bg-fuchsia-500/25 hover:shadow-[0_0_16px_rgba(255,0,229,0.6)]"
          >
            ⟲ RESET
          </button>
        </div>

        <div className="rounded-md border border-neutral-800 bg-neutral-900/50 p-3 text-[11px] leading-relaxed text-neutral-400">
          <div className="text-neutral-500">STATUS</div>
          <div className="mt-1 flex justify-between">
            <span>天体数</span>
            <span className="text-cyan-300">{bodyCount}</span>
          </div>
          <div className="flex justify-between">
            <span>状态</span>
            <span className={params.paused ? "text-fuchsia-400" : "text-cyan-300"}>
              {params.paused ? "PAUSED" : "RUNNING"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: "cyan" | "fuchsia";
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, accent, onChange }: SliderProps) {
  const accentClass =
    accent === "cyan"
      ? "accent-cyan-400 text-cyan-300"
      : "accent-fuchsia-400 text-fuchsia-300";
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-neutral-400">{label}</span>
        <span className={accentClass}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 ${accentClass}`}
      />
    </div>
  );
}
