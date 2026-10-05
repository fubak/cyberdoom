import type { Gender, ToolDef, ViewmodelAnim } from '../core/types';
import { drawBigText, drawText, measureBig, measureText, wrapText } from '../render/font';
import { STATUS_H, VIEW3D_H, VIEW_H, VIEW_W } from '../render/renderer';
import { roleColor } from '../render/textures';
import { drawToolViewmodel } from '../render/viewmodels';
import { sortedTools } from '../tools';

/**
 * LOOK: Doom-style 32px status bar + message ticker + tool viewmodel.
 * Drawn each frame on a 2D canvas overlay at 320x200, all text in the
 * original CYBERDOOM bitmap font (no browser fonts → crisp at any scale).
 *
 * Bar layout (left → right):
 *   INTEGRITY% | AMMO | TOOLS 1-8 | analyst face | CRED keycard | RESOURCES cur/max | OBJ n/m
 */
const RED = ['#ff9a7a', '#ff4a2a', '#e01e10', '#a80c06', '#700604'];
const AMBER = ['#fff0a0', '#ffd040', '#ffa818', '#d07808', '#8a4804'];
const GREEN = ['#c8ffb0', '#6aff5a', '#2ad83a', '#14a024', '#0a6014'];
const MSG_COL: Record<string, string> = { bad: '#ff5a3a', good: '#5aff6a', warn: '#ffc030', info: '#d8e0f0' };

type Panel = [x: number, w: number];
const P_INT: Panel = [0, 54];
const P_AMMO: Panel = [54, 42];
const P_TOOLS: Panel = [96, 54];
const P_FACE: Panel = [150, 34];
const P_CRED: Panel = [184, 42];
const P_RES: Panel = [226, 54];
const P_OBJ: Panel = [280, 40];

type ResRow = { id: string; label: string; cur: number; max: number; owned: boolean; active: boolean };
type GotFx = { k: number; slot: number; blink: boolean } | null;

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private messages: { text: string; kind: string; t: number }[] = [];
  private bar: HTMLCanvasElement;
  private time = 0;
  private lastIntegrity = 100;
  private ouchT = 0;
  private lookT = 0;
  private look = 0;
  private grinT = 0;
  private cooldown = 0;
  private tabHeld = false;
  private objShowT = 0;
  private lastObjKey = '';

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud';
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    container.appendChild(this.canvas);
    this.bar = paintBarBackground();
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      this.tabHeld = down;
    };
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('blur', () => (this.tabHeld = false));
  }

  pushMessage(text: string, kind = 'info'): void {
    const dup = this.messages.find((m) => m.text === text);
    if (dup) {
      dup.t = 5;
      return;
    }
    this.messages.push({ text, kind, t: 5 });
    if (kind === 'good') this.grinT = 1.4;
    if (this.messages.length > 3) this.messages.shift();
  }

  clearMessages(): void {
    this.messages = [];
    this.objShowT = 3.5;
    this.lastObjKey = '';
  }

  tick(dt: number): void {
    this.grinT = Math.max(0, this.grinT - dt);
    this.objShowT = Math.max(0, this.objShowT - dt);
    this.time += dt;
    this.ouchT = Math.max(0, this.ouchT - dt);
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.look = [0, -1, 0, 1][Math.floor(Math.random() * 4)];
      this.lookT = 0.8 + Math.random() * 1.6;
    }
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter((m) => m.t > 0);
  }

  draw(opts: {
    integrity: number;
    ammo: number | null;
    ammoName: string;
    tool: ToolDef;
    bob: number;
    cooldownFrac: number;
    gender: Gender;
    viewmodelOffset?: { x: number; y: number };
    credentials: string;
    objectives: { text: string; done: boolean; failed: boolean; progress?: number; target?: number }[];
    progress?: { done: number; total: number; failed: boolean };
    /** ARSENAL: use-cycle/switch animation state for the held tool. */
    anim?: ViewmodelAnim;
    /** ARSENAL: ids of tools the player currently owns (ARMS grid). */
    owned?: string[];
    /** ARSENAL: status-face painter (portrait + damage/direction states). */
    face?: (g: CanvasRenderingContext2D, x: number, y: number) => void;
    /** ARSENAL: every resource as current/max (Doom's AMMO table). */
    resources?: ResRow[];
    /** ARSENAL: new-tool pickup moment (gold flash, ARMS slot blink). */
    got?: GotFx;
  }): void {
    const g = this.g;
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    if (opts.integrity < this.lastIntegrity) this.ouchT = 0.7;
    this.lastIntegrity = opts.integrity;
    this.cooldown = opts.cooldownFrac;

    // viewmodel sits on top of the 3D view, above the bar (like Doom's weapon)
    g.save();
    g.beginPath();
    g.rect(0, 0, VIEW_W, VIEW3D_H);
    g.clip();
    if (opts.viewmodelOffset) {
      g.translate(Math.round(opts.viewmodelOffset.x), Math.round(opts.viewmodelOffset.y));
    }
    const bob = opts.viewmodelOffset ? 0 : opts.bob;
    if (!drawToolViewmodel(g, opts.tool, VIEW_W, VIEW3D_H, bob, opts.gender, opts.cooldownFrac, this.time, opts.anim)) {
      opts.tool.drawViewmodel(g, VIEW_W, VIEW3D_H, Math.sin(bob) * 2, opts.gender, opts.cooldownFrac, opts.anim);
      if (opts.anim) opts.tool.drawFx?.(g, VIEW_W, VIEW3D_H, opts.anim);
    }
    g.restore();
    if (opts.got && opts.got.k > 0) {
      g.fillStyle = `rgba(255,196,40,${(0.38 * opts.got.k).toFixed(3)})`;
      g.fillRect(0, 0, VIEW_W, VIEW3D_H);
    }

    const objKey = opts.objectives
      .map((o) => `${o.done ? 1 : o.failed ? 2 : 0}:${o.progress ?? 0}/${o.target ?? 1}`)
      .join('|');
    if (this.lastObjKey && objKey !== this.lastObjKey) this.objShowT = 3.5;
    this.lastObjKey = objKey;
    if (this.tabHeld || this.objShowT > 0) this.drawObjectives(opts.objectives);
    else this.drawTicker();
    this.drawBar(opts);
  }

  /** Doom-style ticker, top-left: newest message only (wraps to 2 lines). */
  private drawTicker(): void {
    const m = this.messages[this.messages.length - 1];
    if (!m) return;
    if (m.t < 0.4 && Math.floor(m.t * 20) % 2 === 0) return;
    // up to two lines so tool teaching text (MFA, patch, tap) isn't cut mid-sentence
    wrapText(m.text.toUpperCase(), 52, 2).forEach((line, i) =>
      drawText(this.g, line, 2, 2 + i * 8, MSG_COL[m.kind] ?? MSG_COL.info, 'small', '#000'));
  }

  /** Objectives overlay (hold TAB; also flashes up at mission start / on change). */
  private drawObjectives(objs: { text: string; done: boolean; failed: boolean }[]): void {
    const g = this.g;
    const rows = objs.map((o) => ({ o, lines: wrapText(o.text.toUpperCase(), 46, 3) }));
    const h = 14 + rows.reduce((n, r) => n + r.lines.length * 7 + 3, 0);
    const w = 214;
    const x0 = Math.round((VIEW_W - w) / 2);
    const y0 = 6;
    // dithered smoke backing (no alpha blending: stays crisp under the palette)
    g.fillStyle = '#000';
    for (let y = y0; y < y0 + h; y++) for (let x = x0 + ((y & 1) ? 1 : 0); x < x0 + w; x += 2) g.fillRect(x, y, 1, 1);
    g.fillStyle = '#6a665e';
    g.fillRect(x0, y0, w, 1);
    g.fillRect(x0, y0 + h - 1, w, 1);
    drawText(g, 'OBJECTIVES', x0 + 4, y0 + 3, '#ffd040', 'small', '#000');
    drawText(g, 'HOLD TAB', x0 + w - 4 - measureText('HOLD TAB', 'tiny'), y0 + 4, '#8a90a0', 'tiny', '#000');
    let y = y0 + 13;
    for (const { o, lines } of rows) {
      const col = o.failed ? '#ff5a3a' : o.done ? '#5aff6a' : '#e8e4dc';
      g.fillStyle = '#000';
      g.fillRect(x0 + 4, y, 6, 6);
      g.fillStyle = o.failed ? '#e01e10' : o.done ? '#2ad83a' : '#5a6070';
      g.fillRect(x0 + 5, y + 1, 4, 4);
      for (const line of lines) {
        drawText(g, line, x0 + 14, y, col, 'tiny', '#000');
        if (o.done || o.failed) {
          g.fillStyle = col;
          g.fillRect(x0 + 14, y + 2, measureText(line, 'tiny'), 1);
        }
        y += 7;
      }
      y += 3;
    }
  }

  private drawBar(o: {
    integrity: number;
    ammo: number | null;
    ammoName: string;
    tool: ToolDef;
    gender: Gender;
    credentials: string;
    objectives: { done: boolean; failed: boolean }[];
    progress?: { done: number; total: number; failed: boolean };
    owned?: string[];
    face?: (g: CanvasRenderingContext2D, x: number, y: number) => void;
    resources?: ResRow[];
    got?: GotFx;
  }): void {
    const g = this.g;
    const by = VIEW_H - STATUS_H;
    g.drawImage(this.bar, 0, by);

    // INTEGRITY
    const hp = Math.ceil(o.integrity);
    const crit = hp < 25 && Math.floor(this.time * 4) % 2 === 0;
    const hpRamp = hp >= 50 ? RED : crit ? AMBER : RED;
    bigCentered(g, `${hp}%`, P_INT, by + 6, hpRamp);
    label(g, 'INTEGRITY', P_INT, by + 21);

    // AMMO / bandwidth
    if (o.ammo === null) {
      // unlimited tool: show a READY lamp instead of a meaningless ammo count
      const ready = this.cooldown <= 0.01;
      const lx = P_AMMO[0] + 17;
      g.fillStyle = '#000';
      g.fillRect(lx, by + 7, 16, 12);
      g.fillStyle = ready ? '#14a024' : '#5a4008';
      g.fillRect(lx + 1, by + 8, 14, 10);
      g.fillStyle = ready ? '#8aff9a' : '#ffa818';
      g.fillRect(lx + 2, by + 9, 12, 3);
      label(g, ready ? 'READY' : 'BUSY', P_AMMO, by + 21, ready ? '#5aff6a' : '#ffc030');
    } else {
      bigCentered(g, `${o.ammo}`, P_AMMO, by + 6, o.ammo === 0 ? RED : AMBER);
      const rr = o.resources?.find((x) => x.active);
      label(g, rr ? `${rr.label}/${rr.max}` : o.ammoName.toUpperCase().slice(0, 9), P_AMMO, by + 21);
    }

    // TOOLS grid (Doom ARMS): 4x2, slots 1-8, lit when owned, boxed when held,
    // blinking gold right after a tool is found
    const tools = sortedTools();
    for (let i = 0; i < 8; i++) {
      const slot = i + 1;
      const t = tools.find((tt) => tt.slot === slot);
      const owned = !!t && (o.owned ? o.owned.includes(t.id) : true);
      const x = P_TOOLS[0] + 4 + (i % 4) * 12;
      const y = by + 6 + Math.floor(i / 4) * 10;
      const active = !!t && t.slot === o.tool.slot;
      const fresh = !!o.got && o.got.slot === slot && o.got.blink;
      g.fillStyle = fresh ? '#ffd040' : active ? '#3a3010' : '#0c0e12';
      g.fillRect(x, y, 11, 7);
      g.fillStyle = active || fresh ? '#ffd040' : '#2a2e38';
      g.fillRect(x, y, 11, 1);
      drawText(g, `${slot}`, x + 3, y + 1, fresh ? '#000' : active ? '#fff0a0' : owned ? '#ffa818' : '#3a3e48', 'small', fresh ? null : '#000');
    }

    // FACE
    if (o.face) o.face(g, P_FACE[0] + 4, by + 2);
    else this.drawFace(P_FACE[0] + 4, by + 2, o.gender, o.integrity);

    // CRED keycard + current role
    const rc = roleColor(o.credentials);
    const cx = P_CRED[0] + Math.round((P_CRED[1] - 16) / 2);
    const cy = by + 6;
    g.fillStyle = '#000';
    g.fillRect(cx + 1, cy + 1, 16, 12);
    g.fillStyle = '#d8dce4';
    g.fillRect(cx, cy, 16, 12);
    g.fillStyle = rc.stripe;
    g.fillRect(cx, cy + 2, 16, 3);
    g.fillStyle = rc.light;
    g.fillRect(cx, cy + 2, 16, 1);
    g.fillStyle = '#8a90a0';
    g.fillRect(cx + 2, cy + 6, 5, 5);
    g.fillStyle = '#3a404c';
    g.fillRect(cx + 9, cy + 7, 5, 1);
    g.fillRect(cx + 9, cy + 9, 4, 1);
    label(g, o.credentials.toUpperCase().slice(0, 9), P_CRED, by + 21, rc.light);

    // RESOURCES: every ammo type as current/max, like Doom's BULL/SHEL/RCKT/CELL
    (o.resources ?? []).slice(0, 4).forEach((r, i) => {
      const y = by + 5 + i * 6;
      const col = !r.owned ? '#3a3e48' : r.cur === 0 ? '#ff4a2a' : r.active ? '#fff0a0' : '#ffa818';
      const lab = r.active ? '#ffd040' : r.owned ? '#8a90a0' : '#3a3e48';
      drawText(g, r.label, P_RES[0] + 3, y, lab, 'tiny', '#000');
      const v = `${r.cur}/${r.max}`;
      drawText(g, v, P_RES[0] + P_RES[1] - 3 - measureText(v, 'tiny'), y, col, 'tiny', '#000');
    });

    // OBJECTIVES n/m
    const done = o.progress?.done ?? o.objectives.filter((x) => x.done).length;
    const total = o.progress?.total ?? o.objectives.length;
    const failed = o.progress?.failed ?? o.objectives.some((x) => x.failed);
    bigCentered(g, `${done}/${total}`, P_OBJ, by + 6, failed ? RED : done === total ? GREEN : GREEN.slice(1));
    label(g, failed ? 'FAILED' : 'OBJ  TAB', P_OBJ, by + 21, failed ? '#ff5a3a' : undefined);
  }

  /** 26x28 procedural analyst portrait; reacts to damage like Doom's face. */
  private drawFace(x: number, y: number, gender: Gender, integrity: number): void {
    const g = this.g;
    const px = (c: string, ax: number, ay: number, w = 1, h = 1) => {
      g.fillStyle = c;
      g.fillRect(x + ax, y + ay, w, h);
    };
    const tier = integrity <= 0 ? 4 : integrity < 20 ? 3 : integrity < 45 ? 2 : integrity < 75 ? 1 : 0;
    const ouch = this.ouchT > 0 && tier < 4;
    const look = ouch || tier === 4 ? 0 : this.look;
    px(ouch ? '#4a0c08' : '#0a0c12', 0, 0, 26, 28);
    const skin = gender === 'female' ? ['#ffd8b0', '#f0b888', '#c88860', '#8a5838'] : ['#f8c898', '#e0a070', '#b07848', '#704828'];
    const pale = tier >= 3 ? ['#e8c8b0', '#d0a890', '#a07868', '#604038'] : skin;
    const hair = gender === 'female' ? ['#8a3a14', '#5a2008', '#2a0c04'] : ['#4a3420', '#2a1c10', '#140c06'];
    // shoulders / shirt
    px('#1a3a7a', 3, 23, 20, 5);
    px('#2a5ab8', 3, 23, 20, 1);
    px('#d8dce4', 11, 23, 4, 5);
    px('#ffd040', 7, 25, 2, 2); // badge
    // neck
    px(pale[2], 10, 20, 6, 3);
    // head
    px(pale[1], 6, 5, 14, 16);
    px(pale[0], 7, 6, 8, 13);
    px(pale[2], 18, 6, 2, 14);
    px(pale[2], 7, 19, 12, 2);
    px(pale[3], 8, 21, 10, 1);
    // ears
    px(pale[2], 5, 10, 1, 4);
    px(pale[2], 20, 10, 1, 4);
    // hair
    px(hair[0], 5, 2, 16, 4);
    px(hair[1], 5, 5, 2, 4);
    px(hair[1], 19, 5, 2, 4);
    px(hair[0], 7, 1, 12, 1);
    px(hair[2], 6, 5, 14, 1);
    if (gender === 'female') {
      // long hair falling past the shoulders, side-swept fringe
      px(hair[0], 2, 4, 4, 22);
      px(hair[0], 20, 4, 4, 22);
      px(hair[1], 2, 20, 4, 6);
      px(hair[1], 20, 20, 4, 6);
      px(hair[2], 5, 8, 1, 14);
      px(hair[2], 20, 8, 1, 14);
      px(hair[0], 6, 5, 9, 3);
      px(hair[0], 6, 8, 3, 2);
      px('#c8a050', 9, 3, 4, 1); // highlight
      px('#ffd040', 5, 15, 1, 2); // earring
      px('#ffd040', 20, 15, 1, 2);
    } else {
      px(hair[0], 14, 5, 5, 1);
    }
    // eyes
    const ey = 11;
    if (tier === 4) {
      for (const ex of [8, 15]) {
        px('#3a0804', ex, ey - 1, 1, 1);
        px('#3a0804', ex + 1, ey, 1, 1);
        px('#3a0804', ex + 2, ey + 1, 1, 1);
        px('#3a0804', ex + 2, ey - 1, 1, 1);
        px('#3a0804', ex, ey + 1, 1, 1);
      }
    } else {
      const wide = ouch;
      for (const ex of [8, 15]) {
        px('#f8f8f8', ex, ey - (wide ? 1 : 0), 3, wide ? 3 : 2);
        px('#1a2a5a', ex + 1 + look, ey, 1, wide ? 1 : 2);
        px(hair[1], ex - (ex === 8 ? 0 : 0), ey - 2 - (tier >= 2 ? 0 : 0), 3, 1); // brows
      }
      if (tier >= 2 && !wide) {
        px(hair[1], 8, ey - 2, 3, 1);
        px(hair[1], 16, ey - 3, 2, 1); // furrowed
      }
    }
    if (gender === 'female' && tier < 4) {
      px('#1a0c08', 7, ey - 1, 1, 1);
      px('#1a0c08', 18, ey - 1, 1, 1);
      px('#1a0c08', 8, ey - 1, 3, 1);
      px('#1a0c08', 15, ey - 1, 3, 1);
    }
    // nose
    px(pale[2], 12, 13, 2, 3);
    px(pale[3], 12, 16, 2, 1);
    // mouth
    if (tier === 4) px('#3a0804', 10, 18, 6, 1);
    else if (this.grinT > 0 && !ouch) {
      px('#3a0804', 9, 17, 8, 3);
      px('#f8f8f8', 10, 17, 6, 2);
      px('#3a0804', 8, 16, 1, 1);
      px('#3a0804', 17, 16, 1, 1);
    } else if (ouch) {
      px('#3a0804', 10, 17, 6, 3);
      px('#f8f8f8', 10, 17, 6, 1);
    } else if (tier >= 2) {
      px('#5a1a10', 10, 18, 6, 1);
      px('#5a1a10', 9, 19, 1, 1);
      px('#5a1a10', 16, 19, 1, 1);
    } else if (gender === 'female') {
      px('#c8283a', 10, 18, 6, 1);
      px('#e85a6a', 11, 17, 4, 1);
      px('#8a1020', 11, 19, 4, 1);
    } else px('#8a3020', 10, 18, 6, 1);
    // damage marks by tier
    if (tier >= 1) {
      px('#d83a2a', 16, 7, 3, 2); // scrape
      px('#8a1a10', 17, 9, 1, 2);
    }
    if (tier >= 2) {
      px('#c01810', 7, 6, 3, 4); // cut brow, blood runs down
      px('#9a120a', 8, 10, 1, 5);
      px('#6a4a8a', 15, 9, 4, 1); // bruise under eye
      px('#6a4a8a', 15, 13, 4, 1);
      px('#7ab8ff', 19, 12, 1, 3); // sweat
    }
    if (tier >= 3) {
      px('#b01008', 9, 14, 2, 6); // bloodied cheek + nose
      px('#d02010', 12, 16, 2, 3);
      px('#b01008', 16, 14, 3, 6);
      px('#7a0a06', 10, 20, 7, 2);
      px('#4a2a6a', 14, 9, 5, 5); // swollen eye
      px('#e8e8e8', 15, 11, 3, 1);
      px('#c01810', 4, 21, 18, 2); // blood on collar
    }
    if (tier === 4) px('#000', 0, 0, 26, 1);
  }
}

function bigCentered(g: CanvasRenderingContext2D, text: string, p: Panel, y: number, ramp: string[]): void {
  drawBigText(g, text, p[0] + Math.round((p[1] - measureBig(text)) / 2), y, ramp);
}

function label(g: CanvasRenderingContext2D, text: string, p: Panel, y: number, col = '#8a90a0'): void {
  drawText(g, text, p[0] + Math.round((p[1] - measureText(text, 'tiny')) / 2), y, col, 'tiny', '#000');
}

/** Static bar art: bold Doom-grey stone/steel plate, thick bevels, recessed wells. */
function paintBarBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = STATUS_H;
  const g = c.getContext('2d')!;
  let s = 1337;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < STATUS_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const v = 104 + Math.floor(r() * 18) - (r() < 0.04 ? 26 : 0);
      g.fillStyle = `rgb(${v + 4},${v},${v - 8})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  // outer bevel: 2px light top, 2px dark bottom
  g.fillStyle = '#e4dccc';
  g.fillRect(0, 0, VIEW_W, 1);
  g.fillStyle = '#b8b0a2';
  g.fillRect(0, 1, VIEW_W, 1);
  g.fillStyle = '#3a362e';
  g.fillRect(0, STATUS_H - 1, VIEW_W, 1);
  g.fillStyle = '#5a554a';
  g.fillRect(0, STATUS_H - 2, VIEW_W, 1);
  for (const [x, w] of [P_INT, P_AMMO, P_TOOLS, P_FACE, P_CRED, P_RES, P_OBJ]) {
    // raised ridge between panels
    g.fillStyle = '#d8d0c0';
    g.fillRect(x, 2, 1, STATUS_H - 4);
    g.fillStyle = '#4a463c';
    g.fillRect(x + 1, 2, 1, STATUS_H - 4);
    // recessed well: dark top/left, light bottom/right, 2px each
    const wx = x + 3;
    const ww = w - 6;
    g.fillStyle = '#2a2722';
    g.fillRect(wx, 4, ww, STATUS_H - 8);
    for (let yy = 5; yy < STATUS_H - 5; yy++) {
      for (let xx = wx + 1; xx < wx + ww - 1; xx++) {
        if (r() < 0.12) {
          g.fillStyle = '#34302a';
          g.fillRect(xx, yy, 1, 1);
        }
      }
    }
    g.fillStyle = '#151310';
    g.fillRect(wx, 4, ww, 2);
    g.fillRect(wx, 4, 2, STATUS_H - 8);
    g.fillStyle = '#cfc6b4';
    g.fillRect(wx, STATUS_H - 5, ww, 1);
    g.fillRect(wx + ww - 1, 4, 1, STATUS_H - 8);
    g.fillStyle = '#8a8476';
    g.fillRect(wx + 1, STATUS_H - 6, ww - 1, 1);
    // rivets
    for (const [rx, ry] of [[x + 3, 2], [x + w - 4, 2]]) {
      g.fillStyle = '#f0e8d8';
      g.fillRect(rx, ry, 1, 1);
      g.fillStyle = '#2a2722';
      g.fillRect(rx + 1, ry + 1, 1, 1);
    }
  }
  return c;
}

export { sortedTools };
