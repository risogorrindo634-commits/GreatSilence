/**
 * 程序绘制的占位画面。美学是“仪器”：玩家看到的都是读数和传回的影像，带噪点和标注。
 */
import type { BodyKind, StarKind } from '../content/systems';
import { PROBE_TARGET } from '../content/systems';
import { makeRandom } from '../core/rng';
import type { ProbeReport, PublicView, RuinsCell } from '../core/types';
import { STAR_COLORS } from './labels';
import type { FatePoint } from './store';

const BG = '#080b10';
const GRID = '#18212c';
const TEXT = '#8fa3b8';
const BRIGHT = '#dbe7f3';
const CYAN = '#7fd6e8';
const AMBER = '#f2b660';
const RED = '#ef6f5e';
const FONT = '12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface Hit {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** 按屏幕像素比设置画布，返回逻辑尺寸。 */
function setup(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  return { ctx, w, h };
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number): void {
  const random = makeRandom(seed);
  for (let i = 0; i < count; i++) {
    const x = random.uniform() * w;
    const y = random.uniform() * h;
    const a = 0.15 + random.uniform() ** 3 * 0.85;
    ctx.fillStyle = `rgba(220,232,245,${a.toFixed(2)})`;
    ctx.fillRect(x, y, a > 0.7 ? 1.6 : 1, a > 0.7 ? 1.6 : 1);
  }
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(0.3, `${color}66`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, kind: StarKind, x: number, y: number, r: number, time: number): void {
  if (kind === 'none') return;
  if (kind === 'binary') {
    glow(ctx, x - r * 0.9, y, r, STAR_COLORS.binary);
    glow(ctx, x + r * 1.1, y + r * 0.2, r * 0.65, '#ff9a5c');
    return;
  }
  if (kind === 'pulsar') {
    const a = time * 2.4;
    ctx.strokeStyle = 'rgba(190,220,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r * 9, y - Math.sin(a) * r * 4);
    ctx.lineTo(x + Math.cos(a) * r * 9, y + Math.sin(a) * r * 4);
    ctx.stroke();
    glow(ctx, x, y, r * 0.45, STAR_COLORS.pulsar);
    return;
  }
  glow(ctx, x, y, kind === 'red' ? r * 0.8 : r, STAR_COLORS[kind]);
}

const BODY_COLORS: Record<BodyKind, string> = {
  rocky: '#9a8f85',
  ocean: '#4f8fd0',
  gas: '#d9b98a',
  ringed: '#d6c08f',
  lava: '#ff6a3d',
  eyeball: '#c9a36b',
  rogue: '#4a586a',
  ice: '#cfe8f5',
};

const BODY_SIZES: Record<BodyKind, number> = { rocky: 5, ocean: 6, gas: 10, ringed: 10, lava: 6, eyeball: 6, rogue: 9, ice: 4 };

// ---------------------------------------------------------------- 星系

export function drawSystem(canvas: HTMLCanvasElement, view: PublicView, selected: string | null, time: number): Hit[] {
  const { ctx, w, h } = setup(canvas);
  const sys = view.systems.find((s) => s.current)!;
  stars(ctx, w, h, 11 + sys.pos[0] * 7, 70);

  const cx = w / 2;
  const cy = h / 2;
  const hits: Hit[] = [];
  const squash = 0.42;
  const maxR = Math.min(w * 0.46, (h * 0.46) / squash);
  const lone = sys.star === 'none';

  drawStar(ctx, sys.star, cx, cy, 9, time);

  view.bodies.forEach((body, i) => {
    const orbit = lone ? 0 : maxR * ((i + 1) / (view.bodies.length + 0.25));
    if (!lone) {
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbit, orbit * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 内侧转得快，外侧转得慢。
    const angle = 0.9 + i * 2.1 + (lone ? 0 : time * 0.9 * (i + 1) ** -1.5);
    const x = cx + Math.cos(angle) * orbit;
    const y = cy + Math.sin(angle) * orbit * squash;
    const r = BODY_SIZES[body.kind] * (lone ? 2.2 : 1);

    if (body.kind === 'ringed') {
      ctx.strokeStyle = 'rgba(214,192,143,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.9, r * 0.6, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = BODY_COLORS[body.kind];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (!lone) {
      // 背着恒星的一面是暗的。
      const away = Math.atan2(y - cy, x - cx);
      ctx.fillStyle = 'rgba(4,6,10,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r, away - Math.PI / 2, away + Math.PI / 2);
      ctx.fill();
    }

    if (body.anomaly) {
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (body.id === selected) {
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = body.id === selected ? BRIGHT : TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(body.given ?? body.name, x, y + r + 20);
    hits.push({ id: body.id, x, y, r: Math.max(26, r + 14) });
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.fillText(`${sys.code} · ${sys.starLabel}`, 10, 14);
  return hits;
}

// ---------------------------------------------------------------- 星图

export function drawMap(canvas: HTMLCanvasElement, view: PublicView, selected: string | null): Hit[] {
  const { ctx, w, h } = setup(canvas);
  stars(ctx, w, h, 5, 110);

  const points = [...view.systems.map((s) => s.pos), PROBE_TARGET.pos];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = 46;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2.2) / spanY);
  // 星图比画布扁，上下居中。
  const top = (h - spanY * scale) / 2 - 8;
  const at = (p: readonly [number, number]): [number, number] => [pad + (p[0] - minX) * scale, top + (p[1] - minY) * scale];
  /** 写一个不会超出画布左右边缘的标签。 */
  const label = (text: string, x: number, y: number): void => {
    const half = ctx.measureText(text).width / 2;
    ctx.textAlign = 'center';
    ctx.fillText(text, Math.min(w - half - 4, Math.max(half + 4, x)), y);
  };

  const here = view.systems.find((s) => s.current)!;
  const [hx, hy] = at(here.pos);
  const [kx, ky] = at(PROBE_TARGET.pos);

  // 还没有回音的探测器。
  for (const probe of view.probes) {
    if (probe.reported) continue;
    const from = view.systems.find((s) => s.id === probe.from)!;
    const [fx, fy] = at(from.pos);
    ctx.strokeStyle = 'rgba(127,214,232,0.35)';
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const hits: Hit[] = [];
  for (const sys of view.systems) {
    const [x, y] = at(sys.pos);
    if (sys.id === selected && !sys.current) {
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CYAN;
      // 标在靠近目的地的一侧，免得压住出发点。
      label(`${sys.travel?.distance ?? 0} 光年`, hx + (x - hx) * 0.62, hy + (y - hy) * 0.62 - 12);
    }

    const color = sys.star === 'none' ? '#5b6b7d' : STAR_COLORS[sys.star];
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.fillStyle = sys.visited ? color : BG;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (sys.current) {
      ctx.strokeStyle = BRIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 线索：实心是还没去，空心是还能看得更细。
    if (sys.lead === 'open') {
      ctx.fillStyle = AMBER;
      ctx.fillRect(x + 9, y - 13, 6, 6);
    } else if (sys.lead === 'partial') {
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 9.5, y - 12.5, 5, 5);
    }

    ctx.fillStyle = sys.id === selected || sys.current ? BRIGHT : TEXT;
    label(sys.code === sys.name ? sys.name : `${sys.code} ${sys.name}`, x, y + 24);
    hits.push({ id: sys.id, x, y, r: 30 });
  }

  // K-41：只能派探测器去。线索还没取得时是黄色的。
  const probeLead = view.leads.find((l) => l.id === 'probe');
  ctx.strokeStyle = probeLead && probeLead.status !== 'done' ? AMBER : TEXT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(kx, ky - 6);
  ctx.lineTo(kx + 6, ky);
  ctx.lineTo(kx, ky + 6);
  ctx.lineTo(kx - 6, ky);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = TEXT;
  label('K-41 旧信号的来源', kx, ky - 18);

  // 比例尺。
  ctx.strokeStyle = TEXT;
  ctx.beginPath();
  ctx.moveTo(12, h - 14);
  ctx.lineTo(12 + 10 * scale, h - 14);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillText('10 光年', 16 + 10 * scale, h - 14);
  return hits;
}

// ---------------------------------------------------------------- 风景

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function paintSurface(ctx: CanvasRenderingContext2D, kind: BodyKind, x: number, y: number, r: number, random: { uniform(): number }): void {
  const base: Record<BodyKind, string> = {
    rocky: '#8d8378',
    ocean: '#2f6fb5',
    gas: '#c9a877',
    ringed: '#cdb586',
    lava: '#21130f',
    eyeball: '#d8e6f0',
    rogue: '#161d27',
    ice: '#dcebf7',
  };
  ctx.fillStyle = base[kind];
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  if (kind === 'rocky') {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(40,34,30,${(0.15 + random.uniform() * 0.3).toFixed(2)})`;
      disc(ctx, x + (random.uniform() - 0.5) * 2 * r, y + (random.uniform() - 0.5) * 2 * r, 2 + random.uniform() * r * 0.14);
      ctx.fill();
    }
  } else if (kind === 'ocean') {
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.2 + random.uniform() * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(x + (random.uniform() - 0.5) * 2 * r, y + (random.uniform() - 0.5) * 2 * r, r * (0.1 + random.uniform() * 0.3), r * 0.035, random.uniform() * 0.6 - 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'gas' || kind === 'ringed') {
    const tones = ['#b8946a', '#dcc79c', '#a8845c', '#e4d3ad', '#c2a274'];
    let top = y - r;
    while (top < y + r) {
      const band = r * (0.08 + random.uniform() * 0.16);
      ctx.fillStyle = tones[Math.floor(random.uniform() * tones.length)] ?? '#c9a877';
      ctx.fillRect(x - r, top, r * 2, band);
      top += band;
    }
  } else if (kind === 'lava') {
    ctx.shadowColor = '#ff5a1f';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ff8a3c';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      let px = x + (random.uniform() - 0.5) * 2 * r;
      let py = y + (random.uniform() - 0.5) * 2 * r;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        px += (random.uniform() - 0.5) * r * 0.4;
        py += (random.uniform() - 0.5) * r * 0.4;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else if (kind === 'eyeball') {
    // 朝着恒星的一面是沙漠，一圈晨昏线，背面是冰。
    const ex = x + r * 0.42;
    const ey = y - r * 0.3;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 1.25);
    g.addColorStop(0, '#d9a45c');
    g.addColorStop(0.42, '#c98f4e');
    g.addColorStop(0.5, '#5f8f6a');
    g.addColorStop(0.58, '#3f7d8f');
    g.addColorStop(0.66, '#d8e6f0');
    g.addColorStop(1, '#eef5fa');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  } else if (kind === 'ice') {
    ctx.strokeStyle = 'rgba(70,120,170,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const px = x + (random.uniform() - 0.5) * 2 * r;
      const py = y + (random.uniform() - 0.5) * 2 * r;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (random.uniform() - 0.5) * r, py + (random.uniform() - 0.5) * r);
      ctx.stroke();
    }
  } else if (kind === 'rogue') {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, '#2a1e1c');
    g.addColorStop(1, '#10161e');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function drawScene(canvas: HTMLCanvasElement, opts: { kind: BodyKind; star: StarKind; seed: number; caption: string }): void {
  const { ctx, w, h } = setup(canvas);
  const random = makeRandom(opts.seed);
  const dark = opts.star === 'none';

  stars(ctx, w, h, opts.seed + 1, dark ? 420 : 150);
  if (dark) {
    // 没有太阳，头顶是完整的银河。
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.45);
    const band = ctx.createLinearGradient(0, -h * 0.28, 0, h * 0.28);
    band.addColorStop(0, 'rgba(160,180,220,0)');
    band.addColorStop(0.5, 'rgba(170,185,225,0.2)');
    band.addColorStop(1, 'rgba(160,180,220,0)');
    ctx.fillStyle = band;
    ctx.fillRect(-w, -h * 0.28, w * 2, h * 0.56);
    for (let i = 0; i < 500; i++) {
      const bx = (random.uniform() - 0.5) * w * 1.6;
      const by = random.gauss() * h * 0.07;
      ctx.fillStyle = `rgba(225,232,250,${(0.1 + random.uniform() * 0.5).toFixed(2)})`;
      ctx.fillRect(bx, by, 1, 1);
    }
    ctx.restore();
  }

  const sx = w * 0.8;
  const sy = h * 0.24;
  drawStar(ctx, opts.star, sx, sy, opts.star === 'red' ? 20 : 12, 0.4);

  const px = w * 0.4;
  const py = h * 0.58;
  const r = h * (opts.kind === 'ringed' ? 0.24 : 0.3);
  const ringed = opts.kind === 'ringed';

  const ring = (front: boolean): void => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.32);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(222,205,165,${(0.55 - i * 0.07).toFixed(2)})`;
      ctx.lineWidth = r * 0.085;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (1.45 + i * 0.2), r * (0.34 + i * 0.047), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  if (ringed) ring(false);

  ctx.save();
  disc(ctx, px, py, r);
  ctx.clip();
  paintSurface(ctx, opts.kind, px, py, r, random);
  // 光来自恒星的方向；没有恒星时只有微弱的余热。
  if (dark) {
    ctx.fillStyle = 'rgba(4,6,10,0.35)';
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  } else if (opts.kind !== 'lava') {
    const dx = sx - px;
    const dy = sy - py;
    const len = Math.hypot(dx, dy);
    const shade = ctx.createRadialGradient(px + (dx / len) * r * 0.9, py + (dy / len) * r * 0.9, r * 0.2, px, py, r * 1.6);
    shade.addColorStop(0, 'rgba(4,6,10,0)');
    shade.addColorStop(0.55, 'rgba(4,6,10,0.25)');
    shade.addColorStop(1, 'rgba(4,6,10,0.94)');
    ctx.fillStyle = shade;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  ctx.restore();

  if (ringed) ring(true);

  if (opts.kind === 'ice') {
    // 冰壳裂缝里喷出的水汽，在阳光里结成一道弧。
    for (let i = 0; i < 260; i++) {
      const t = random.uniform();
      const spread = (random.uniform() - 0.5) * 0.5;
      const ax = px + r * 0.55 + t * r * 0.9 + spread * t * r;
      const ay = py - r * 0.8 - Math.sin(t * Math.PI * 0.8) * r * 0.9 + spread * t * r * 0.6;
      ctx.fillStyle = `rgba(235,245,255,${(0.5 * (1 - t)).toFixed(2)})`;
      ctx.fillRect(ax, ay, 1.2, 1.2);
    }
  }
  if (opts.kind === 'rogue') {
    ctx.strokeStyle = 'rgba(190,90,60,0.35)';
    ctx.lineWidth = 2;
    disc(ctx, px, py, r);
    ctx.stroke();
  }

  // 仪器的边框、刻度和噪点。
  ctx.strokeStyle = 'rgba(143,163,184,0.5)';
  ctx.lineWidth = 1;
  const m = 8;
  const c = 14;
  for (const [x0, y0, ax, ay] of [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0 + ax * c, y0);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0, y0 + ay * c);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(random.uniform() * 0.07).toFixed(3)})`;
    ctx.fillRect(random.uniform() * w, random.uniform() * h, 1, 1);
  }
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(opts.caption, m + 6, h - m - 10);
}

// ---------------------------------------------------------------- 证据

export function drawSignal(canvas: HTMLCanvasElement, series: readonly number[]): void {
  const { ctx, w, h } = setup(canvas);
  const left = 28;
  const bottom = h - 22;
  const top = 10;
  const max = 1.6;

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + ((bottom - top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
  }

  const step = (w - 6 - left) / series.length;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = left + (i + 0.5) * step;
    const y = bottom - (Math.min(v, max) / max) * (bottom - top);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText('功率', 2, top + 6);
  ctx.fillText('最早的记录', left, h - 9);
  ctx.textAlign = 'right';
  ctx.fillText('最近', w - 6, h - 9);
}

/** 热图的配色：黑、暗红、橙、黄白。 */
function heat(v: number): string {
  const t = Math.min(1, Math.max(0, v));
  const r = Math.round(255 * Math.min(1, t * 2.2));
  const g = Math.round(255 * Math.min(1, Math.max(0, t * 1.9 - 0.45)));
  const b = Math.round(255 * Math.min(1, Math.max(0, t * 2.4 - 1.4)));
  return `rgb(${r},${g},${b})`;
}

export function drawInfrared(canvas: HTMLCanvasElement, grid: readonly (readonly number[])[]): void {
  const { ctx, w, h } = setup(canvas);
  const n = grid.length;
  const size = Math.min(w, h) - 8;
  const cell = size / n;
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  grid.forEach((row, y) => {
    row.forEach((v, x) => {
      ctx.fillStyle = heat(v * 1.25);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
    });
  });
  ctx.strokeStyle = 'rgba(143,163,184,0.6)';
  ctx.strokeRect(ox, oy, size, size);
  // 恒星的位置：它的光已经扣除。
  ctx.strokeStyle = 'rgba(219,231,243,0.8)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 5, h / 2);
  ctx.lineTo(w / 2 + 5, h / 2);
  ctx.moveTo(w / 2, h / 2 - 5);
  ctx.lineTo(w / 2, h / 2 + 5);
  ctx.stroke();
}

export function drawRuins(canvas: HTMLCanvasElement, cells: readonly (readonly RuinsCell[])[]): void {
  const { ctx, w, h } = setup(canvas);
  const n = cells.length;
  const size = Math.min(w, h) - 8;
  const cell = size / n;
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  cells.forEach((row, y) => {
    row.forEach((c, x) => {
      const px = ox + x * cell;
      const py = oy + y * cell;
      const shade = Math.round(30 + c.damage * 190);
      ctx.fillStyle = `rgb(${shade},${Math.round(shade * 0.55)},${Math.round(shade * 0.42)})`;
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      if (c.dir !== null) {
        const len = cell * 0.36;
        ctx.strokeStyle = BRIGHT;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px + cell / 2 - Math.cos(c.dir) * len, py + cell / 2 - Math.sin(c.dir) * len);
        ctx.lineTo(px + cell / 2 + Math.cos(c.dir) * len, py + cell / 2 + Math.sin(c.dir) * len);
        ctx.stroke();
        // 箭头：断口朝向。
        ctx.beginPath();
        ctx.arc(px + cell / 2 + Math.cos(c.dir) * len, py + cell / 2 + Math.sin(c.dir) * len, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = BRIGHT;
        ctx.fill();
      }
    });
  });
}

/**
 * 探测器的航迹。每艘一行，左端是出发的地方，右端是 K-41。
 * 叉号是它停止回传的位置；走到头的是顺利掠过的。几艘画在同一把尺上，位置对不对得上一眼可见。
 */
export function drawProbes(canvas: HTMLCanvasElement, reports: readonly ProbeReport[]): void {
  const { ctx, w, h } = setup(canvas);
  const left = 14;
  const right = w - 30;
  const longest = Math.max(...reports.map((r) => r.distance), 1);
  const X = (toTarget: number): number => right - ((right - left) * toTarget) / longest;
  const top = 26;
  const step = Math.min(26, (h - top - 26) / Math.max(reports.length, 1));

  // 刻度：离 K-41 的距离。
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  const tick = longest > 40 ? 20 : longest > 16 ? 5 : 2;
  for (let d = 0; d <= longest; d += tick) {
    ctx.beginPath();
    ctx.moveTo(X(d), top - 8);
    ctx.lineTo(X(d), h - 22);
    ctx.stroke();
    ctx.fillText(String(d), X(d), h - 10);
  }
  ctx.textAlign = 'left';
  ctx.fillText('离 K-41 的距离（光年）', left, 10);

  reports.forEach((r, i) => {
    const y = top + step * (i + 0.5);
    const end = r.lostAt ?? 0;
    ctx.strokeStyle = r.lostAt === null ? CYAN : AMBER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(r.distance), y);
    ctx.lineTo(X(end), y);
    ctx.stroke();
    ctx.lineWidth = 1;
    if (r.lostAt === null) {
      ctx.beginPath();
      ctx.arc(X(0), y, 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(X(end) - 4, y - 4);
      ctx.lineTo(X(end) + 4, y + 4);
      ctx.moveTo(X(end) + 4, y - 4);
      ctx.lineTo(X(end) - 4, y + 4);
      ctx.stroke();
    }
  });

  // K-41。
  ctx.strokeStyle = TEXT;
  ctx.beginPath();
  ctx.moveTo(X(0), top - 14);
  ctx.lineTo(X(0) + 5, top - 9);
  ctx.lineTo(X(0), top - 4);
  ctx.lineTo(X(0) - 5, top - 9);
  ctx.closePath();
  ctx.stroke();
}

// ---------------------------------------------------------------- 结局：命运是怎么涨起来的

const LAYERS: readonly { key: 'time' | 'conspicuity' | 'delegation' | 'signed'; color: string }[] = [
  { key: 'time', color: '#6f8296' },
  { key: 'conspicuity', color: AMBER },
  { key: 'delegation', color: CYAN },
  { key: 'signed', color: RED },
];

/** 四项叠在一起：哪一层在什么时候长高，一眼看得出来。 */
export function drawFateCurve(canvas: HTMLCanvasElement, history: readonly FatePoint[]): void {
  const { ctx, w, h } = setup(canvas);
  const left = 30;
  const right = w - 8;
  const top = 10;
  const bottom = h - 22;
  const points: FatePoint[] = [{ year: 0, time: 0, conspicuity: 0, delegation: 0, signed: 0 }, ...history];
  const lastYear = Math.max(1, points[points.length - 1]?.year ?? 1);
  const X = (year: number): number => left + ((right - left) * year) / lastYear;
  const Y = (fate: number): number => bottom - ((bottom - top) * Math.min(100, fate)) / 100;

  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  for (const level of [0, 50, 100]) {
    ctx.beginPath();
    ctx.moveTo(left, Y(level));
    ctx.lineTo(right, Y(level));
    ctx.stroke();
    ctx.fillText(String(level), left - 4, Y(level));
  }

  const below = points.map(() => 0);
  for (const layer of LAYERS) {
    const above = points.map((p, i) => (below[i] ?? 0) + p[layer.key]);
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(X(p.year), Y(above[i] ?? 0));
      else ctx.lineTo(X(p.year), Y(above[i] ?? 0));
    });
    for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(X(points[i]!.year), Y(below[i] ?? 0));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    above.forEach((v, i) => (below[i] = v));
  }

  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText('第 0 年', left, h - 9);
  ctx.textAlign = 'right';
  ctx.fillText(`第 ${lastYear} 年`, right, h - 9);
}

// ---------------------------------------------------------------- 巡航

/**
 * 巡航的快进画面。航速越高，星光越蓝，并且向正前方聚拢。
 * 这是狭义相对论的多普勒效应和光行差，这里只做了示意。
 */
export function drawCruise(canvas: HTMLCanvasElement, speed: number, time: number): void {
  const { ctx, w, h } = setup(canvas);
  const random = makeRandom(41);
  const cx = w / 2;
  const cy = h / 2;
  const beta = Math.min(0.95, speed);
  const reach = Math.hypot(w, h) / 2;
  for (let i = 0; i < 260; i++) {
    const angle = random.uniform() * Math.PI * 2;
    const phase = random.uniform();
    const base = (phase + time * (0.12 + beta * 0.9)) % 1;
    // 光行差：视角向前方压缩。
    const radius = reach * base ** (1 + beta * 1.6);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const forward = 1 - radius / reach;
    const blue = Math.min(1, beta * 2.2 * forward + beta * 0.6);
    const r = Math.round(235 - 110 * blue);
    const g = Math.round(235 - 40 * blue);
    ctx.fillStyle = `rgba(${r},${g},255,${(0.25 + base * 0.75).toFixed(2)})`;
    const len = 1 + base * 5 * (0.3 + beta * 2);
    ctx.fillRect(x, y, Math.max(1, Math.abs(Math.cos(angle)) * len), Math.max(1, Math.abs(Math.sin(angle)) * len));
  }
}
