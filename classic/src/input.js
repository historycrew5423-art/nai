// 双摇杆输入。
// 手机：左半屏控制移动，右半屏控制瞄准；手指按下的地方就是摇杆中心。
// 电脑：WASD 或方向键移动，鼠标指向哪里就往哪里打。

const RADIUS = 60; // 摇杆能拉开的最大距离（像素）

function makeStick() {
  const el = document.createElement('div');
  el.className = 'stick';
  el.appendChild(document.createElement('div')).className = 'knob';
  document.body.appendChild(el);
  return el;
}

export class Input {
  constructor() {
    this.touchMove = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0, active: false }; // 右摇杆，active 表示正在用它瞄准
    this.mouse = { x: 0, y: 0, active: false };
    this.keys = new Set();
    this.touches = new Map(); // 手指编号 → { side, ox, oy, el }
    this.sticks = { left: makeStick(), right: makeStick() };

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true;
    });
    const opts = { passive: false };
    addEventListener('touchstart', (e) => this.onStart(e), opts);
    addEventListener('touchmove', (e) => this.onMove(e), opts);
    addEventListener('touchend', (e) => this.onEnd(e), opts);
    addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  onStart(e) {
    this.mouse.active = false;
    let onButton = false;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('button, [data-ui]:not(.hide)')) { onButton = true; continue; } // 按钮和对话框、选卡这些界面：照常点击，不当成摇杆
      const side = 'left';   // 10-31 第 55 轮：只用一根手指走，在屏幕哪里按下都行；唱歌全自动（朝走路的方向）
      if ([...this.touches.values()].some((s) => s.side === side)) continue;
      const el = this.sticks[side];
      el.style.display = 'block';
      el.style.left = t.clientX + 'px';
      el.style.top = t.clientY + 'px';
      el.firstChild.style.transform = '';
      this.touches.set(t.identifier, { side, ox: t.clientX, oy: t.clientY, el });
    }
    if (!onButton) e.preventDefault(); // 不让页面滚动、缩放；按钮的点击要保留
  }

  onMove(e) {
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      s.el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
      const v = { x: dx / RADIUS, y: dy / RADIUS };
      if (s.side === 'left') this.touchMove = v;
      else this.aim = { ...v, active: Math.hypot(v.x, v.y) > 0.25 };
    }
    e.preventDefault();
  }

  onEnd(e) {
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      s.el.style.display = 'none';
      if (s.side === 'left') this.touchMove = { x: 0, y: 0 };
      else this.aim = { x: 0, y: 0, active: false };
      this.touches.delete(t.identifier);
    }
  }

  // 移动方向：x 向右为正，y 向屏幕下方为正（对应游戏里的 +Z，镜头那一侧）。长度 0 到 1。
  getMove() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    return this.touchMove;
  }
}
