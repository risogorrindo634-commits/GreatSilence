/**
 * 三个亲自上手的小操作。每个不超过一分钟，把玩家的表现算成 0 到 1 的技巧值交给内核。
 * 这里用到时钟和 Math.random，所以它们只在界面里；内核只看到那个技巧值。
 */

type Finish = (skill: number | null) => void;

interface Stage {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  controls: HTMLElement;
  status: HTMLElement;
  done: Finish;
}

const CYAN = '#7fd6e8';
const AMBER = '#f2b660';
const TEXT = '#8fa3b8';
const GRID = '#18212c';

function open(title: string, intro: string, resolve: Finish): Stage {
  const root = document.createElement('div');
  root.className = 'modal game';
  root.innerHTML = `
    <div class="sheet">
      <h3>${title}</h3>
      <p>${intro}</p>
      <canvas></canvas>
      <p class="status"></p>
      <div class="controls"></div>
      <button class="btn plain cancel"><span>不做了</span><small>不花清醒日</small></button>
    </div>`;
  document.body.appendChild(root);

  const canvas = root.querySelector('canvas')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';

  let closed = false;
  const done: Finish = (skill) => {
    if (closed) return;
    closed = true;
    root.remove();
    resolve(skill);
  };
  root.querySelector('.cancel')!.addEventListener('click', () => done(null));

  return { root, canvas, ctx, w, h, controls: root.querySelector('.controls')!, status: root.querySelector('.status')!, done };
}

/** 显示成绩，等玩家确认后再交出技巧值。 */
function finish(stage: Stage, skill: number, text: string): void {
  stage.status.textContent = text;
  stage.root.querySelector('.cancel')?.remove();
  stage.controls.innerHTML = '<button class="btn self"><span>确认</span></button>';
  stage.controls.querySelector('button')!.addEventListener('click', () => stage.done(Math.min(1, Math.max(0, skill))));
}

function button(stage: Stage, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn self big';
  b.innerHTML = `<span>${label}</span>`;
  b.addEventListener('click', onClick);
  stage.controls.appendChild(b);
  return b;
}

// ---------------------------------------------------------------- 引力弹弓

/**
 * 飞船掠过行星。在离行星最近的那一刻点火，同样的燃料换来最多的速度（奥伯特效应）。
 */
export function playSlingshot(): Promise<number | null> {
  return new Promise((resolve) => {
    const s = open('引力弹弓', '飞船掠过行星。在离它最近的那一刻点火。只有一次机会。', resolve);
    const { ctx, w, h } = s;
    const px = w / 2;
    const py = h * 0.62;
    const periapsis = h * 0.2;
    const duration = 4200;
    const start = performance.now() + 700;
    let fired: number | null = null;
    let over = false;

    // 轨迹：一条开口向上的双曲线；u 从 -1 到 1，0 是最近点。
    const at = (u: number): [number, number] => [px + u * w * 0.62, py - periapsis - u * u * h * 0.34];
    // 越靠近行星飞得越快。
    const ease = (t: number): number => {
      const x = t * 2 - 1;
      return Math.sign(x) * Math.abs(x) ** 1.7;
    };

    button(s, '点火', () => {
      if (fired !== null || over) return;
      const t = (performance.now() - start) / duration;
      if (t < 0) return;
      fired = ease(Math.min(1, t));
    });

    const frame = (now: number): void => {
      if (over || !s.root.isConnected) return;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const u = ease(t);
      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = GRID;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (let k = -1; k <= 1.001; k += 0.04) {
        const [x, y] = at(k);
        if (k === -1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const glow = ctx.createRadialGradient(px, py, 4, px, py, h * 0.17);
      glow.addColorStop(0, '#d6c08f');
      glow.addColorStop(0.8, '#8a7650');
      glow.addColorStop(1, '#3a3222');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, h * 0.16, 0, Math.PI * 2);
      ctx.fill();

      const [x, y] = at(u);
      ctx.fillStyle = fired === null ? CYAN : AMBER;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (fired !== null) {
        const [fx, fy] = at(fired);
        ctx.strokeStyle = AMBER;
        ctx.beginPath();
        ctx.arc(fx, fy, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (t >= 1 || (fired !== null && t > 0.5 && now - start > duration * 0.6)) {
        over = true;
        const miss = fired === null ? 1 : Math.abs(fired);
        const skill = Math.max(0, 1 - miss / 0.5) ** 1.5;
        const text = fired === null ? '没有点火。飞船只是被行星带偏了方向。' : miss < 0.08 ? '几乎正好在最近点。' : fired < 0 ? '点早了。' : '点晚了。';
        finish(s, skill, text);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------- 信号调谐

/**
 * 调频率和相位，把信号从噪声里拉出来。没有读数可看，只能盯着波形是不是变得规整。
 */
export function playTuning(): Promise<number | null> {
  return new Promise((resolve) => {
    const s = open('信号调谐', '拖动频率和相位，让波形变得规整。没有读数可看，只能盯着波形。满意了就锁定。', resolve);
    const { ctx, w, h } = s;
    const target = { f: 0.15 + Math.random() * 0.7, p: 0.15 + Math.random() * 0.7 };
    const value = { f: 0.5, p: 0.5 };
    const limit = 30000;
    const start = performance.now();
    let over = false;

    const slider = (label: string, key: 'f' | 'p'): void => {
      const row = document.createElement('label');
      row.className = 'share';
      row.innerHTML = `${label}<input type="range" min="0" max="1000" value="500" />`;
      row.querySelector('input')!.addEventListener('input', (e) => {
        value[key] = Number((e.target as HTMLInputElement).value) / 1000;
      });
      s.controls.appendChild(row);
    };
    slider('频率', 'f');
    slider('相位', 'p');

    // 两个量各自有反馈：调对一个，波形就干净一半；两个都对才完全干净。
    const near = (a: number, b: number): number => Math.exp(-((a - b) ** 2) / (2 * 0.13 * 0.13));
    const match = (): number => {
      const f = near(value.f, target.f);
      const p = near(value.p, target.p);
      return 0.42 * f + 0.42 * p + 0.16 * f * p;
    };
    const lock = (): void => {
      if (over) return;
      over = true;
      const m = match();
      finish(s, m, m > 0.85 ? '锁定。波形很干净。' : m > 0.5 ? '锁定。还有不少噪声。' : '锁定。信号几乎淹没在噪声里。');
    };
    button(s, '锁定', lock);

    const frame = (now: number): void => {
      if (over || !s.root.isConnected) return;
      const left = Math.max(0, limit - (now - start));
      const m = match();
      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const t = x / w;
        const clean = Math.sin(t * Math.PI * 14 + now / 300) * (0.55 + 0.25 * Math.sin(t * Math.PI * 3));
        const noise = (Math.random() - 0.5) * 2;
        const y = h / 2 - (clean * m + noise * (1 - m) * 0.9) * h * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      ctx.fillStyle = TEXT;
      ctx.fillText(`剩 ${Math.ceil(left / 1000)} 秒`, 8, 14);
      if (left <= 0) {
        lock();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------- 聚变点火

/**
 * 等离子体不稳定：偏离中心越远，被推得越厉害，还有一阵阵的湍流。
 * 手指相对圆心的位置就是你施加的力：在哪一边，就往哪一边推。
 * 横向是约束磁场，纵向是加热功率。难度是用几种水平的模拟玩家调出来的：
 * 不动手约一成时间在窗口里，生手三成，一般水平九成。
 */
export function playIgnition(): Promise<number | null> {
  return new Promise((resolve) => {
    const s = open('聚变点火', '按住并拖动：手指在圆心的哪一边，就往哪一边推。把等离子体压在圆形的窗口里，它越偏越难拉回来。', resolve);
    const { ctx, w, h, canvas } = s;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) * 0.42;
    const windowR = 0.34;
    const duration = 14000;
    const PUSH = 2.6;
    const FORCE = 4;
    const DRAG = 1.5;
    const GUST = 0.5;
    const GUST_TIME = 0.6;
    const pos = { x: 0.08, y: -0.05 };
    const vel = { x: 0, y: 0 };
    const gust = { x: 0, y: 0 };
    const control = { x: 0, y: 0, on: false };
    let inside = 0;
    let total = 0;
    let started: number | null = null;
    let last = performance.now();
    let over = false;

    const gauss = (): number => Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-9))) * Math.cos(2 * Math.PI * Math.random());

    const aim = (e: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      control.x = Math.max(-1, Math.min(1, (e.clientX - rect.left - cx) / scale));
      control.y = Math.max(-1, Math.min(1, (e.clientY - rect.top - cy) / scale));
    };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      control.on = true;
      canvas.setPointerCapture(e.pointerId);
      aim(e);
      started ??= performance.now();
    });
    canvas.addEventListener('pointermove', (e) => control.on && aim(e));
    canvas.addEventListener('pointerup', () => {
      control.on = false;
    });
    s.status.textContent = '按住画面开始。';

    const frame = (now: number): void => {
      if (over || !s.root.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (started !== null) {
        for (const k of ['x', 'y'] as const) {
          // 湍流：一阵一阵的，不是每帧独立的抖动。
          gust[k] += (-gust[k] / GUST_TIME) * dt + GUST * gauss() * Math.sqrt(dt);
          const a = pos[k] * PUSH + gust[k] + (control.on ? FORCE * control[k] : 0);
          vel[k] = (vel[k] + a * dt) * (1 - DRAG * dt);
          pos[k] = Math.max(-1.1, Math.min(1.1, pos[k] + vel[k] * dt));
        }
        total += dt;
        if (Math.hypot(pos.x, pos.y) <= windowR) inside += dt;
      }

      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(cx - scale, cy);
      ctx.lineTo(cx + scale, cy);
      ctx.moveTo(cx, cy - scale);
      ctx.lineTo(cx, cy + scale);
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.fillText('约束磁场', cx + scale - 54, cy + 14);
      ctx.fillText('加热功率', cx + 6, cy - scale + 8);

      const ok = Math.hypot(pos.x, pos.y) <= windowR;
      ctx.strokeStyle = ok ? CYAN : '#3a4a5c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, windowR * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;

      const g = ctx.createRadialGradient(cx + pos.x * scale, cy + pos.y * scale, 0, cx + pos.x * scale, cy + pos.y * scale, 16);
      g.addColorStop(0, '#fff3d6');
      g.addColorStop(0.4, ok ? '#ffb347' : '#ef6f5e');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + pos.x * scale, cy + pos.y * scale, 16, 0, Math.PI * 2);
      ctx.fill();

      if (control.on) {
        // 你施加的力：从圆心指向手指。
        ctx.strokeStyle = AMBER;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + control.x * scale, cy + control.y * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + control.x * scale, cy + control.y * scale, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (started !== null) {
        const left = Math.max(0, duration - (now - started));
        s.status.textContent = `剩 ${Math.ceil(left / 1000)} 秒 · 在窗口里的时间 ${Math.round((inside / Math.max(total, 0.001)) * 100)}%`;
        if (left <= 0) {
          over = true;
          const share = inside / Math.max(total, 0.001);
          finish(s, share, share > 0.8 ? '燃烧很稳。' : share > 0.45 ? '点着了，时断时续。' : '勉强点着。');
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
