import type { Gender, ToolDef } from '../core/types';
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
 *   INTEGRITY% | AMMO | TOOLS 1-4 | analyst face | CRED keycard | OBJ n/m
 */
const RED = ['#ff9a7a', '#ff4a2a', '#e01e10', '#a80c06', '#700604'];
const AMBER = ['#fff0a0', '#ffd040', '#ffa818', '#d07808', '#8a4804'];
const GREEN = ['#c8ffb0', '#6aff5a', '#2ad83a', '#14a024', '#0a6014'];
const MSG_COL: Record<string, string> = { bad: '#ff5a3a', good: '#5aff6a', warn: '#ffc030', info: '#d8e0f0' };

type Panel = [x: number, w: number];
const P_INT: Panel = [0, 58];
const P_AMMO: Panel = [58, 50];
const P_TOOLS: Panel = [108, 52];
const P_FACE: Panel = [160, 34];
const P_CRED: Panel = [194, 72];
const P_OBJ: Panel = [266, 54];

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

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud';
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    container.appendChild(this.canvas);
    this.bar = paintBarBackground();
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
  }

  tick(dt: number): void {
    this.grinT = Math.max(0, this.grinT - dt);
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
    credentials: string;
    objectives: { text: string; done: boolean; failed: boolean }[];
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
    if (!drawToolViewmodel(g, opts.tool, VIEW_W, VIEW3D_H, opts.bob, opts.gender, opts.cooldownFrac, this.time)) {
      opts.tool.drawViewmodel(g, VIEW_W, VIEW3D_H, Math.sin(opts.bob) * 2, opts.gender, opts.cooldownFrac);
    }
    g.restore();

    this.drawTicker();
    this.drawObjectives(opts.objectives);
    this.drawBar(opts);
  }

  private drawTicker(): void {
    const g = this.g;
    let y = 2;
    for (const m of this.messages) {
      const col = MSG_COL[m.kind] ?? MSG_COL.info;
      // fade by stepping the colour off in the last half second (no alpha blur)
      if (m.t < 0.4 && Math.floor(m.t * 20) % 2 === 0) {
        y += wrapText(m.text, 30, 3).length * 8 + 1;
        continue;
      }
      for (const line of wrapText(m.text, 30, 3)) {
        drawText(g, line, 3, y, col, 'small', '#000');
        y += 8;
      }
      y += 1;
    }
  }

  private drawObjectives(objs: { text: string; done: boolean; failed: boolean }[]): void {
    const g = this.g;
    let y = 3;
    for (const o of objs) {
      const col = o.failed ? '#ff5a3a' : o.done ? '#5aff6a' : '#c8ccd8';
      const lines = wrapText(o.text.toUpperCase(), 30, 2);
      const w = Math.max(...lines.map((l) => measureText(l, 'tiny')));
      const x = VIEW_W - 4 - w;
      g.fillStyle = '#000';
      g.fillRect(x - 7, y, 5, 5);
      g.fillStyle = o.failed ? '#e01e10' : o.done ? '#2ad83a' : '#5a6070';
      g.fillRect(x - 6, y + 1, 3, 3);
      for (const line of lines) {
        drawText(g, line, x, y, col, 'tiny', '#000');
        if (o.done || o.failed) {
          g.fillStyle = col;
          g.fillRect(x, y + 2, measureText(line, 'tiny'), 1);
        }
        y += 6;
      }
      y += 2;
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
  }): void {
    const g = this.g;
    const by = VIEW_H - STATUS_H;
    g.drawImage(this.bar, 0, by);

    // INTEGRITY
    const hp = Math.ceil(o.integrity);
    const crit = hp < 25 && Math.floor(this.time * 4) % 2 === 0;
    const hpRamp = hp >= 50 ? RED : crit ? AMBER : RED;
    bigCentered(g, `${hp}%`, P_INT, by + 6, hpRamp);
    label(g, 'INTEGRITY', P_INT, by + 24);

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
      label(g, ready ? 'READY' : 'BUSY', P_AMMO, by + 24, ready ? '#5aff6a' : '#ffc030');
    } else {
      bigCentered(g, `${o.ammo}`, P_AMMO, by + 6, o.ammo === 0 ? RED : AMBER);
      label(g, o.ammoName.toUpperCase().slice(0, 11), P_AMMO, by + 24);
    }

    // TOOLS grid (Doom ARMS)
    const tools = sortedTools();
    for (let i = 0; i < 4; i++) {
      const t = tools[i];
      const x = P_TOOLS[0] + 5 + i * 11;
      const y = by + 5;
      const active = t && t.slot === o.tool.slot;
      g.fillStyle = active ? '#3a3010' : '#0c0e12';
      g.fillRect(x, y, 10, 11);
      g.fillStyle = active ? '#ffd040' : '#2a2e38';
      g.fillRect(x, y, 10, 1);
      drawText(g, `${t ? t.slot : i + 1}`, x + 3, y + 2, active ? '#fff0a0' : t ? '#8a90a0' : '#3a3e48', 'small', '#000');
    }
    label(g, o.tool.name.toUpperCase().slice(0, 12), P_TOOLS, by + 22, '#ffd040');

    // FACE
    this.drawFace(P_FACE[0] + 4, by + 2, o.gender, o.integrity);

    // CRED keycard
    const rc = roleColor(o.credentials);
    const cx = P_CRED[0] + 6;
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
    drawText(g, o.credentials.toUpperCase().slice(0, 7), cx + 20, cy + 3, rc.light, 'small', '#000');
    label(g, 'CREDENTIAL', P_CRED, by + 24);

    // OBJECTIVES n/m
    const done = o.objectives.filter((x) => x.done).length;
    const failed = o.objectives.some((x) => x.failed);
    bigCentered(g, `${done}/${o.objectives.length}`, P_OBJ, by + 6, failed ? RED : done === o.objectives.length ? GREEN : GREEN.slice(1));
    label(g, failed ? 'FAILED' : 'OBJECTIVES', P_OBJ, by + 24, failed ? '#ff5a3a' : undefined);
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
      px(hair[0], 3, 5, 3, 16);
      px(hair[0], 20, 5, 3, 16);
      px(hair[1], 3, 18, 3, 3);
      px(hair[1], 20, 18, 3, 3);
      px(hair[0], 8, 5, 6, 2);
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
    } else px('#8a3020', 10, 18, 6, 1);
    // damage marks by tier
    if (tier >= 1) px('#c83a2a', 17, 8, 2, 2); // scrape
    if (tier >= 2) {
      px('#a01a10', 7, 7, 2, 3);
      px('#7ab8ff', 19, 12, 1, 3); // sweat
    }
    if (tier >= 3) {
      px('#a01a10', 9, 14, 1, 4);
      px('#a01a10', 16, 15, 2, 4);
      px('#5a1a10', 6, 16, 2, 2);
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

/** Static bar art: riveted gunmetal panels with bevelled insets. */
function paintBarBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = STATUS_H;
  const g = c.getContext('2d')!;
  // base plate with subtle procedural grain
  let s = 1337;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < STATUS_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const v = 46 + Math.floor(r() * 10) - (y > STATUS_H - 3 ? 14 : 0);
      g.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = '#8a92a8';
  g.fillRect(0, 0, VIEW_W, 1);
  g.fillStyle = '#5a6278';
  g.fillRect(0, 1, VIEW_W, 1);
  for (const [x, w] of [P_INT, P_AMMO, P_TOOLS, P_FACE, P_CRED, P_OBJ]) {
    // inset well
    g.fillStyle = '#14161c';
    g.fillRect(x + 2, 3, w - 4, STATUS_H - 5);
    g.fillStyle = '#0a0b0e';
    g.fillRect(x + 2, 3, w - 4, 1);
    g.fillRect(x + 2, 3, 1, STATUS_H - 5);
    g.fillStyle = '#6a7288';
    g.fillRect(x + 2, STATUS_H - 2, w - 4, 1);
    g.fillRect(x + w - 2, 3, 1, STATUS_H - 4);
    // rivets between panels
    g.fillStyle = '#9aa2b8';
    g.fillRect(x, 4, 1, 1);
    g.fillRect(x, STATUS_H - 4, 1, 1);
  }
  return c;
}

export { sortedTools };
