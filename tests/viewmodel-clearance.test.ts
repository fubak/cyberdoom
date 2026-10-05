import { describe, expect, it } from 'vitest';
import type { Gender, ToolDef, ViewmodelAnim } from '../src/core/types';
import { drawToolViewmodel } from '../src/render/viewmodels';
import { useDuration, vmLine } from '../src/tools/anim';
import { toolRegistry } from '../src/tools';

/**
 * Renders every held tool (rest, bob, and each windup/impact/recover frame, with its
 * fx) into a tiny software 2D canvas and checks that nothing covers the aim area:
 * no opaque pixel above the clearance line (62% of the 3D view) and none in the
 * centre 20%x20% aim box.
 */

type RGBA = [number, number, number, number];

function parse(c: string): RGBA {
  const s = c.trim().toLowerCase();
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'black') return [0, 0, 0, 1];
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`fake canvas: unsupported colour ${c}`);
}

class Grad {
  stops: [number, RGBA][] = [];
  constructor(private x: number, private y: number, private r0: number, private r1: number) {}
  addColorStop(o: number, c: string): void {
    this.stops.push([o, parse(c)]);
    this.stops.sort((a, b) => a[0] - b[0]);
  }
  at(px: number, py: number): RGBA {
    const t = Math.max(0, Math.min(1, (Math.hypot(px - this.x, py - this.y) - this.r0) / Math.max(1e-6, this.r1 - this.r0)));
    let [o0, c0] = this.stops[0];
    for (const [o1, c1] of this.stops) {
      if (t <= o1) {
        const k = o1 > o0 ? (t - o0) / (o1 - o0) : 0;
        return c0.map((v, i) => v + (c1[i] - v) * k) as RGBA;
      }
      [o0, c0] = [o1, c1];
    }
    return c0;
  }
}

class FakeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

class FakeCanvas {
  width = 300;
  height = 150;
  private ctx?: FakeCtx;
  getContext(): FakeCtx {
    return (this.ctx ??= new FakeCtx(this));
  }
}

type Shape = { k: 'rect'; x: number; y: number; w: number; h: number } | { k: 'ell'; cx: number; cy: number; rx: number; ry: number };

/** Premultiplied float RGBA software canvas: just the 2D API the viewmodels use. */
class FakeCtx {
  fillStyle: string | Grad = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  private d = new Float32Array(0);
  private dw = 0;
  private dh = 0;
  private tx = 0;
  private ty = 0;
  private clipR: [number, number, number, number] | null = null;
  private path: Shape[] = [];
  private stack: unknown[] = [];
  constructor(public canvas: FakeCanvas) {}

  buf(): Float32Array {
    if (this.dw !== this.canvas.width || this.dh !== this.canvas.height) {
      this.dw = this.canvas.width;
      this.dh = this.canvas.height;
      this.d = new Float32Array(this.dw * this.dh * 4);
    }
    return this.d;
  }
  save(): void {
    this.stack.push([this.tx, this.ty, this.clipR, this.fillStyle, this.strokeStyle, this.lineWidth, this.globalCompositeOperation, this.globalAlpha]);
  }
  restore(): void {
    const s = this.stack.pop() as never[] | undefined;
    if (s) [this.tx, this.ty, this.clipR, this.fillStyle, this.strokeStyle, this.lineWidth, this.globalCompositeOperation, this.globalAlpha] = s;
  }
  translate(x: number, y: number): void {
    this.tx += x;
    this.ty += y;
  }
  beginPath(): void {
    this.path = [];
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.path.push({ k: 'rect', x: x + this.tx, y: y + this.ty, w, h });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    this.path.push({ k: 'ell', cx: cx + this.tx, cy: cy + this.ty, rx, ry });
  }
  clip(): void {
    for (const p of this.path) {
      if (p.k !== 'rect') throw new Error('fake canvas: only rect clips');
      const r: [number, number, number, number] = [p.x, p.y, p.x + p.w, p.y + p.h];
      const c = this.clipR;
      this.clipR = c ? [Math.max(c[0], r[0]), Math.max(c[1], r[1]), Math.min(c[2], r[2]), Math.min(c[3], r[3])] : r;
    }
  }
  fill(): void {
    for (const p of this.path) {
      if (p.k === 'rect') this.paint(p.x, p.y, p.w, p.h, this.fillStyle);
      else {
        for (let y = Math.floor(p.cy - p.ry); y <= Math.ceil(p.cy + p.ry); y++) {
          const dy = (y + 0.5 - p.cy) / p.ry;
          if (Math.abs(dy) > 1) continue;
          const hw = p.rx * Math.sqrt(1 - dy * dy);
          this.paint(p.cx - hw, y, hw * 2, 1, this.fillStyle);
        }
      }
    }
  }
  stroke(): void {
    for (const p of this.path) {
      if (p.k === 'rect') this.strokeRect(p.x - this.tx, p.y - this.ty, p.w, p.h);
      else {
        const n = Math.ceil(Math.max(p.rx, p.ry) * 8) + 8;
        const lw = this.lineWidth;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.paint(p.cx + Math.cos(a) * p.rx - lw / 2, p.cy + Math.sin(a) * p.ry - lw / 2, lw, lw, this.strokeStyle);
        }
      }
    }
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    const l = this.lineWidth;
    const s = this.strokeStyle;
    const X = x + this.tx;
    const Y = y + this.ty;
    this.paint(X - l / 2, Y - l / 2, w + l, l, s);
    this.paint(X - l / 2, Y + h - l / 2, w + l, l, s);
    this.paint(X - l / 2, Y + l / 2, l, h - l, s);
    this.paint(X + w - l / 2, Y + l / 2, l, h - l, s);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.paint(x + this.tx, y + this.ty, w, h, this.fillStyle);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const d = this.buf();
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.dh, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.dw, Math.round(x + w)); xx++) d.fill(0, (yy * this.dw + xx) * 4, (yy * this.dw + xx) * 4 + 4);
  }
  createRadialGradient(x0: number, y0: number, r0: number, _x1: number, _y1: number, r1: number): Grad {
    return new Grad(x0, y0, r0, r1);
  }
  getImageData(x: number, y: number, w: number, h: number): FakeImageData {
    const d = this.buf();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const sx = x + xx;
        const sy = y + yy;
        if (sx < 0 || sy < 0 || sx >= this.dw || sy >= this.dh) continue;
        const i = (sy * this.dw + sx) * 4;
        const o = (yy * w + xx) * 4;
        const a = d[i + 3];
        if (a <= 0) continue;
        out[o] = (d[i] / a) * 255;
        out[o + 1] = (d[i + 1] / a) * 255;
        out[o + 2] = (d[i + 2] / a) * 255;
        out[o + 3] = a * 255;
      }
    return new FakeImageData(out, w, h);
  }
  putImageData(img: FakeImageData, x: number, y: number): void {
    const d = this.buf();
    for (let yy = 0; yy < img.height; yy++)
      for (let xx = 0; xx < img.width; xx++) {
        const sx = x + xx;
        const sy = y + yy;
        if (sx < 0 || sy < 0 || sx >= this.dw || sy >= this.dh) continue;
        const i = (sy * this.dw + sx) * 4;
        const o = (yy * img.width + xx) * 4;
        const a = img.data[o + 3] / 255;
        d[i] = (img.data[o] / 255) * a;
        d[i + 1] = (img.data[o + 1] / 255) * a;
        d[i + 2] = (img.data[o + 2] / 255) * a;
        d[i + 3] = a;
      }
  }
  drawImage(src: FakeCanvas, ...n: number[]): void {
    const [sx, sy, sw, sh, dx, dy, dw, dh] =
      n.length === 2 ? [0, 0, src.width, src.height, n[0], n[1], src.width, src.height]
      : n.length === 4 ? [0, 0, src.width, src.height, n[0], n[1], n[2], n[3]]
      : n;
    const s = src.getContext().buf();
    const X = dx + this.tx;
    const Y = dy + this.ty;
    for (let y = Math.round(Y); y < Math.round(Y + dh); y++)
      for (let x = Math.round(X); x < Math.round(X + dw); x++) {
        const u = Math.floor(sx + ((x - X + 0.5) * sw) / dw);
        const v = Math.floor(sy + ((y - Y + 0.5) * sh) / dh);
        if (u < 0 || v < 0 || u >= src.width || v >= src.height) continue;
        const i = (v * src.width + u) * 4;
        if (s[i + 3] <= 0) continue;
        this.blendPx(x, y, s[i], s[i + 1], s[i + 2], s[i + 3]);
      }
  }

  private paint(x: number, y: number, w: number, h: number, style: string | Grad): void {
    if (w < 0) [x, w] = [x + w, -w];
    if (h < 0) [y, h] = [y + h, -h];
    const solid = typeof style === 'string' ? parse(style) : null;
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        const [r, g, b, a] = solid ?? (style as Grad).at(xx + 0.5 - this.tx, yy + 0.5 - this.ty);
        const A = a * this.globalAlpha;
        this.blendPx(xx, yy, (r / 255) * A, (g / 255) * A, (b / 255) * A, A);
      }
  }

  private blendPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
    this.buf();
    if (x < 0 || y < 0 || x >= this.dw || y >= this.dh || a <= 0) return;
    const c = this.clipR;
    if (c && (x + 0.5 < c[0] || x + 0.5 > c[2] || y + 0.5 < c[1] || y + 0.5 > c[3])) return;
    const d = this.d;
    const i = (y * this.dw + x) * 4;
    if (this.globalCompositeOperation === 'lighter') {
      d[i] = Math.min(1, d[i] + r);
      d[i + 1] = Math.min(1, d[i + 1] + g);
      d[i + 2] = Math.min(1, d[i + 2] + b);
      d[i + 3] = Math.min(1, d[i + 3] + a);
    } else {
      const k = 1 - a;
      d[i] = r + d[i] * k;
      d[i + 1] = g + d[i + 1] * k;
      d[i + 2] = b + d[i + 2] * k;
      d[i + 3] = a + d[i + 3] * k;
    }
  }
}

const g0 = globalThis as unknown as Record<string, unknown>;
g0.document = { createElement: () => new FakeCanvas() };
g0.ImageData = FakeImageData;

// VIEW_W x VIEW3D_H (render/renderer.ts)
const W = 320;
const H = 168;
const LINE = vmLine(H);
/** "Opaque enough to hide a target": anything above ~16% alpha. */
const MAX_A = 40 / 255;
const SKIN: [string, string, string] = ['#c8885a', '#9a6038', '#e8b080'];

type Sample = { label: string; bob: number; cd: number; sinceUse: number; sinceConfirm: number };

function samples(t: ToolDef): Sample[] {
  const wind = t.windup ?? 0;
  const out: Sample[] = [];
  for (let i = 0; i < 8; i++) out.push({ label: `rest bob=${i}`, bob: (i * Math.PI) / 4, cd: 0, sinceUse: 9, sinceConfirm: 9 });
  for (let s = 0; s <= useDuration(wind) + 0.05; s += 0.01) {
    out.push({ label: `use t=${s.toFixed(2)}`, bob: 0, cd: Math.max(0, 1 - s / t.cooldown), sinceUse: s, sinceConfirm: s - wind });
  }
  return out;
}

function render(tool: ToolDef, gender: Gender, s: Sample, good: boolean): FakeCtx {
  const c = new FakeCanvas();
  c.width = W;
  c.height = H;
  const g = c.getContext();
  const anim: ViewmodelAnim = {
    sinceUse: s.sinceUse,
    sinceConfirm: s.sinceConfirm,
    confirmGood: good,
    time: s.sinceUse,
    ammo: tool.ammo ? 3 : null,
    skin: SKIN,
    lower: 0,
  };
  drawToolViewmodel(g as unknown as CanvasRenderingContext2D, tool, W, H, s.bob, gender, s.cd, s.sinceUse, anim);
  return g;
}

describe('held tools never hide the target', () => {
  const tools = toolRegistry.all();
  it('covers all 8 tools', () => expect(tools.length).toBeGreaterThanOrEqual(8));

  for (const tool of tools) {
    it(`${tool.id}: nothing above ${Math.round(0.62 * 100)}% of view height or in the aim box, at rest/bob/every use frame`, () => {
      const bad: string[] = [];
      let restCoverage = 0;
      for (const gender of ['male', 'female'] as Gender[]) {
        for (const s of samples(tool)) {
          for (const good of [true, false]) {
            const img = render(tool, gender, s, good).getImageData(0, 0, W, H).data;
            let worst: string | null = null;
            for (let y = 0; y < H && !worst; y++) {
              const inBoxY = y >= H * 0.4 && y < H * 0.6;
              if (y >= LINE && !inBoxY) continue;
              for (let x = 0; x < W; x++) {
                const inBox = inBoxY && x >= W * 0.4 && x < W * 0.6;
                if ((y < LINE || inBox) && img[(y * W + x) * 4 + 3] / 255 > MAX_A) {
                  worst = `${gender} ${s.label} good=${good}: pixel (${x},${y}) a=${img[(y * W + x) * 4 + 3]}`;
                  break;
                }
              }
            }
            if (worst) bad.push(worst);
            if (s.label === 'rest bob=0' && good) {
              for (let i = 3; i < img.length; i += 4) if (img[i] > 200) restCoverage++;
            }
          }
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
      // and the tool is actually on screen, not pushed out of view
      expect(restCoverage).toBeGreaterThan(2 * 600);
    });
  }
});
