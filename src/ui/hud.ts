import type { Gender, ToolDef, ToolHint, ViewmodelAnim } from '../core/types';
import { drawBigText, drawChunky, drawText, measureChunky, measureText, wrapText } from '../render/font';
import { VIEW_H, VIEW_W } from '../render/renderer';
import { roleColor } from '../render/textures';
import { drawToolViewmodel } from '../render/viewmodels';
import { sortedTools } from '../tools';
import { BASE_H, BASE_STATUS, BASE_W, RES } from '../render/res';
import { keyPlateRect, PROMPT_ROW_PLATE } from './keyPlate';
import { bossAlertY, drawBossBar } from './bossBar';
import { drawGlassPlate, drawKeyCap } from './overlayArt';
import { drawPowerBadges } from './powerBadges';
import { pinnedObjectiveLine, stripObjectiveLine } from './objectiveLine';
import { layoutObjectivesOverlay, overlayPageAt } from './objectivesOverlay';
import {
  P_AMMO,
  P_CRED,
  P_FACE,
  P_INT,
  resRowPlate,
  statusBarText,
  visibleResources,
  type BarText,
  type Panel,
} from './barLayout';
import { slotCells } from './slotStrip';
import { paintBarBackground } from './barArt';
import {
  EMPTY_TICKER,
  pushTicker,
  tickerRows,
  TICKER_MAX_ROWS,
  tickTicker,
  type TickerPriority,
  type TickerState,
} from './tickerQueue';
import { noteHit, type DamageAlertState, type DamageHit } from './damageAlert';
import { drawDamageOverlay, drawKeycard, drawSlotStrikes, drawSlotWells, drawStatusLamp } from './hudPaint';

export { tickerPrefix, tickerRows } from './tickerQueue';

/**
 * LOOK: Doom-style 128px native status bar + message ticker + tool viewmodel.
 * Drawn each frame on a 2D canvas overlay at 1280x800, all text in the
 * original CYBERDOOM bitmap font (no browser fonts → crisp at any scale).
 *
 * Bar layout (left → right):
 *   INTEGRITY% | AMMO | TOOLS 1-8 | analyst face | CRED keycard | RESOURCES cur/max | OBJ n/m
 */

const MSG_RAMP: Record<string, string[]> = {
  bad: ['#ffb09a', '#ff5a3a', '#d82a10'],
  good: ['#d0ffc8', '#5aff6a', '#20b830'],
  warn: ['#fff0a0', '#ffc030', '#d08a10'],
  info: ['#ffffff', '#d8e0f0', '#9aa8c0'],
};

/** Okabe-Ito-inspired color-blind-safe ramps (sky blue = good, yellow = warn, vermilion = bad). */
const MSG_RAMP_CB: Record<string, string[]> = {
  bad: ['#ffd0b0', '#ff7a20', '#d55e00'],
  good: ['#d0f0ff', '#56b4e9', '#1c86c8'],
  warn: ['#ffffc8', '#f0e442', '#c8b810'],
  info: ['#ffffff', '#d8e0f0', '#9aa8c0'],
};

export function tickerColor(kind: string, colorBlind = false): string {
  const table = colorBlind ? MSG_RAMP_CB : MSG_RAMP;
  const ramp = table[kind] ?? table.info;
  return ramp[ramp.length - 2];
}
/** Objective strip never exceeds 12% of the 168px 3D view. */
const OBJ_STRIP_MAX = 20;

let tickerPattern: CanvasPattern | null = null;

function getTickerPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (tickerPattern) return tickerPattern;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const image = c.getContext('2d')!.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const v = ((x + y) & 1) === 0 ? 0 : 8;
    image.data[i] = v; image.data[i + 1] = v; image.data[i + 2] = v; image.data[i + 3] = 255;
  }
  c.getContext('2d')!.putImageData(image, 0, 0);
  tickerPattern = g.createPattern(c, 'repeat');
  tickerPattern?.setTransform(new DOMMatrix().scale(1 / RES, 1 / RES));
  return tickerPattern;
}

/** What the last HUD frame put on screen, for e2e probes (?debug=1 only). */
export interface HudFrameDebug {
  objective: { mode: 'none' | 'strip' | 'pinned' | 'overlay'; lines: string[] };
  prompt: {
    rows: { key: string; text: string; plate: { x: number; y: number; w: number; h: number; glyphX: number; glyphY: number } | null }[];
    footer: string | null;
  };
  ticker: string[];
}

function emptyFrame(): HudFrameDebug {
  return { objective: { mode: 'none', lines: [] }, prompt: { rows: [], footer: null }, ticker: [] };
}

type ResRow = { id: string; label: string; cur: number; max: number; owned: boolean; active: boolean };
type GotFx = { k: number; slot: number; blink: boolean } | null;

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private ticker: TickerState = EMPTY_TICKER;
  private damage: DamageAlertState | null = null;
  private bar: HTMLCanvasElement;
  private time = 0;
  private lastIntegrity = 100;
  private ouchT = 0;
  private lookT = 0;
  private look = 0;
  private grinT = 0;
  private cooldown = 0;
  private tabHeld = false;
  /** Seconds TAB has been held (pages the objectives overlay). */
  private tabHeldT = 0;
  private objShowT = 0;
  private lastObjKey = '';
  private objIdx = 0;
  private colorBlind = false;
  private reducedFlash = false;
  /** e2e probe: per-frame record of the drawn objective/prompt/ticker text (null = off). */
  private frame: HudFrameDebug | null = null;

  /** Start recording what each frame draws (debug builds; see debugFrame). */
  enableDebugCapture(): void {
    this.frame ??= emptyFrame();
  }

  /** The objective line, prompt rows (with key plate geometry) and ticker rows of the last frame. */
  debugFrame(): HudFrameDebug | null {
    return this.frame ? structuredClone(this.frame) : null;
  }

  setColorBlind(enabled: boolean): void {
    this.colorBlind = enabled;
  }

  /** Dimmer directional hurt tint (wired to a settings toggle when one exists). */
  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
  }
  private pickup: { text: string; t: number } | null = null;

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
      // a fresh press starts the overlay on page 1
      if (down && !this.tabHeld) this.tabHeldT = 0;
      this.tabHeld = down;
    };
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('blur', () => (this.tabHeld = false));
  }

  /**
   * Queue a ticker message. Priority defaults from the kind (good = objective,
   * bad/warn = alert, info = tip); see tickerQueue.ts for the discipline.
   */
  pushMessage(text: string, kind = 'info', priority?: TickerPriority): void {
    this.ticker = pushTicker(this.ticker, text, kind, priority);
    if (kind === 'good') this.grinT = 1.4;
  }

  /** On-screen and queued ticker texts (e2e probe). */
  debugMessages(): string[] {
    return [...this.ticker.visible, ...this.ticker.pending].map((message) => message.text);
  }

  /** Player took a hit: refresh the timed source/direction alert and the edge tint. */
  noteDamage(hit: DamageHit): void {
    this.damage = noteHit(this.damage, hit, this.time);
  }

  /**
   * Pickup lines get their own pinned lane above the ticker: they stay up
   * for ~1.9 s no matter how much chatter lands behind them, so a tool's
   * 'PICKED UP …' or 'YOU GOT THE …' can't be displaced by the tool
   * explanation pages that arrive in the same moment.
   */
  pushPickup(text: string): void {
    this.pickup = { text, t: 1.9 };
    this.pushMessage(text, 'good');
  }

  clearMessages(): void {
    this.ticker = EMPTY_TICKER;
    this.damage = null;
    this.pickup = null;
    this.objShowT = 3.5;
    this.lastObjKey = '';
  }

  tick(dt: number): void {
    this.grinT = Math.max(0, this.grinT - dt);
    this.objShowT = Math.max(0, this.objShowT - dt);
    this.time += dt;
    if (this.tabHeld) this.tabHeldT += dt;
    this.ouchT = Math.max(0, this.ouchT - dt);
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.look = [0, -1, 0, 1][Math.floor(Math.random() * 4)];
      this.lookT = 0.8 + Math.random() * 1.6;
    }
    if (this.pickup && (this.pickup.t -= dt) <= 0) this.pickup = null;
    this.ticker = tickTicker(this.ticker, dt);
  }

  /** Cache warm-up: draw once with every gated path forced on (objective strip). */
  warmDraw(opts: Parameters<Hud['draw']>[0]): void {
    const held = this.tabHeld;
    this.tabHeld = true;
    this.draw(opts);
    this.tabHeld = held;
  }

  draw(opts: {
    integrity: number;
    armor?: number;
    overclockT?: number;
    airgapT?: number;
    /** Active boss encounter health bar (shown when a boss is awake and alive). */
    boss?: {
      name: string;
      hp: number;
      maxHp: number;
      phase?: number;
      phaseCount?: number;
      phaseLabel?: string;
      telegraph?: string | null;
    } | null;
    ammo: number | null;
    ammoName: string;
    tool: ToolDef;
    /** Passive use feedback draws its painted viewmodel without changing the held tool. */
    viewTool?: ToolDef;
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
    /**
     * FEEL: action prompt under the viewmodel clearance line. `lmbHot`
     * brightens the LMB line briefly after a fire press; `banner` overrides
     * the lines while a tool switch banner is showing; `footer` is the
     * early-mission switch reminder (only when there is no LMB/E line).
     */
    prompt?: {
      lmb: ToolHint | null;
      use: string | null;
      lmbHot?: boolean;
      banner?: { title: string; blurb: string } | null;
      footer?: string | null;
      /** Key plate for the tool line: 'LMB', or the fire key while the mouse is not captured. */
      lmbKey?: string;
    };
  }): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.setTransform(RES, 0, 0, RES, 0, 0);
    if (opts.integrity < this.lastIntegrity) this.ouchT = 0.7;
    this.lastIntegrity = opts.integrity;
    this.cooldown = opts.cooldownFrac;
    if (this.frame) this.frame = emptyFrame();

    // viewmodel sits on top of the 3D view, above the bar (like Doom's weapon)
    g.save();
    g.beginPath();
    g.rect(0, 0, BASE_W, BASE_H - BASE_STATUS);
    g.clip();
    const bob = opts.viewmodelOffset ? 0 : opts.bob;
    g.save();
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.imageSmoothingEnabled = false;
    if (opts.viewmodelOffset) {
      g.translate(Math.round(opts.viewmodelOffset.x), Math.round(opts.viewmodelOffset.y));
    }
    const viewTool = opts.viewTool ?? opts.tool;
    if (!drawToolViewmodel(g, viewTool, BASE_W, BASE_H - BASE_STATUS, bob, opts.gender, opts.cooldownFrac, this.time, opts.anim)) {
      viewTool.drawViewmodel(g, BASE_W, BASE_H - BASE_STATUS, Math.sin(bob) * 2, opts.gender, opts.cooldownFrac, opts.anim);
      if (opts.anim) viewTool.drawFx?.(g, BASE_W, BASE_H - BASE_STATUS, opts.anim);
    }
    g.restore();
    g.restore();
    if (opts.got && opts.got.k > 0) {
      g.fillStyle = `rgba(255,196,40,${(0.38 * opts.got.k).toFixed(3)})`;
      g.fillRect(0, 0, BASE_W, BASE_H - BASE_STATUS);
    }

    const states = opts.objectives.map((o) => (o.done ? 1 : o.failed ? 2 : 0));
    const objKey = opts.objectives
      .map((o, index) => `${states[index]}:${o.progress ?? 0}/${o.target ?? 1}`)
      .join('|');
    if (!this.lastObjKey) {
      if (this.objShowT > 0) this.objIdx = Math.max(0, states.indexOf(0));
    } else if (objKey !== this.lastObjKey) {
      const previous = this.lastObjKey.split('|').map((value) => Number(value.split(':')[0]));
      const changed = states.findIndex((value, index) => value !== previous[index]);
      this.objIdx = changed >= 0 ? changed : Math.max(0, states.indexOf(0));
      this.objShowT = 3.5;
    }
    this.lastObjKey = objKey;
    if (this.tabHeld) {
      if (this.frame) this.frame.objective.mode = 'overlay';
      this.drawObjectivesOverlay(opts.objectives);
    } else if (this.objShowT > 0 && opts.objectives[this.objIdx]) {
      if (this.frame) this.frame.objective.mode = 'strip';
      this.drawObjectiveStrip(opts.objectives, this.objIdx);
    } else {
      // the big strip only flashes for a few seconds on a change: between
      // flashes a slim pinned line keeps the open objective on screen, with
      // the (at most 2-message, 3-row) ticker under it
      const pinned = this.drawPinnedObjective(opts.objectives, opts.progress);
      this.drawTicker(1 + pinned, TICKER_MAX_ROWS);
    }
    const boss = opts.boss && opts.boss.hp > 0 && opts.boss.maxHp > 0 ? opts.boss : null;
    // with a boss bar up, the damage alert drops to just under it
    const alertY = boss ? bossAlertY(boss) : undefined;
    drawDamageOverlay(this.g, this.damage, this.time, this.reducedFlash, BASE_W, BASE_H - BASE_STATUS, alertY);
    if (opts.prompt) this.drawPrompt(opts.prompt);
    // tool use effects live in the aim space: drawn last so the beam/ring/
    // LED reads on top of the viewmodel and the tool's own screen flash,
    // like Doom's tracer + wall impact drawn over the gun sprite
    if (opts.anim) this.drawUseFx(viewTool, opts.anim);
    drawPowerBadges(this.g, opts.armor ?? 0, opts.overclockT ?? 0, opts.airgapT ?? 0);
    if (boss) drawBossBar(this.g, boss);
    this.drawBar(opts);
  }

  /**
   * ARSENAL: per-tool use effect drawn in the aim space itself — a USB scan
   * beam that ends in a ring on the target, a badge reader LED at the door,
   * an inspect bracket, the tap clipping onto the cable, the patch writing
   * its progress bar. Timed to the same windup->impact->recover clock as the
   * viewmodel (anim.sinceUse), tinted by the hit verdict once it lands, and
   * kept short (~0.3-0.5 s) so threats stay readable through it.
   */
  private drawUseFx(tool: ToolDef, anim: ViewmodelAnim): void {
    if ((anim.lower ?? 0) > 0) return;
    const t = anim.sinceUse - (tool.windup ?? 0);
    if (t < 0) return;
    const g = this.g;
    const cx = BASE_W / 2;
    const cy = (BASE_H - BASE_STATUS) / 2;
    g.save();
    g.beginPath();
    g.rect(0, 0, BASE_W, BASE_H - BASE_STATUS);
    g.clip();
    try {
    const px = (c: string, x: number, y: number, w: number, h: number, a = 1): void => {
      if (a <= 0) return;
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    };
    /** Stroked square ring centred at (x, y): dark underlay so it reads on the flash. */
    const ring = (c: string, r: number, thick: number, a = 1, atX = cx, atY = cy): void => {
      for (const [cc, rr, th] of [['#0a0e18', r + 2, thick + 2], [c, r, thick]] as const) {
        const rw = rr * 2, rh = rr * 1.24;
        px(cc, atX - rr, atY - rh / 2, rw, th, a);
        px(cc, atX - rr, atY + rh / 2 - th, rw, th, a);
        px(cc, atX - rr, atY - rh / 2, th, rh, a);
        px(cc, atX + rr - th, atY - rh / 2, th, rh, a);
      }
    };
    const verdict =
      anim.sinceConfirm >= 0 && anim.sinceConfirm < 0.7 ? (anim.confirmGood ? '#4aff5a' : '#ff4a3a') : null;

    switch (tool.id) {
      case 'usb': {
        // scan beam: a bright step-tracer from the stick tip up to the aim
        // point, closing in a contracting scan ring on the target
        if (t > 0.55) return;
        const u = t / 0.55;
        const fade = u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38;
        // the stick's raised tip sits centre-low; beam steps up to the aim
        const ox = cx + 8, oy = cy + 92;
        const reach = Math.min(1, u * 2.4); // beam extends over the first ~40%
        const ex = ox + (cx - ox) * reach, ey = oy + (cy - oy) * reach;
        g.globalAlpha = fade;
        g.strokeStyle = '#0a0e18';
        g.lineWidth = 7;
        g.beginPath(); g.moveTo(ox, oy); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = verdict ?? '#5ff0ff';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(ox, oy); g.lineTo(ex, ey); g.stroke();
        g.globalAlpha = 1;
        // packets riding the beam
        for (let i = 0; i < 4; i++) {
          const s = (i * 0.28 + t * 4) % 1;
          if (s > reach) continue;
          px('#e8ffff', ox + (cx - ox) * s - 2, oy + (cy - oy) * s - 2, 5, 5, fade);
        }
        if (reach >= 1) {
          const r = 34 - 18 * Math.min(1, (u - 0.4) * 2.2);
          ring(verdict ?? '#5ff0ff', r, 3, fade);
          ring('#0a0e18', r + 7, 2, 0.6 * fade);
          if (u > 0.45) px(verdict ?? '#b8ffff', cx - 2, cy - 2, 5, 5, fade);
        }
        return;
      }
      case 'mouse': {
        // inspect bracket contracting onto the target + a scan line sweep;
        // turns green/red once the verdict lands
        if (t > 0.55) return;
        const u = t / 0.55;
        const d = Math.round(44 - 22 * Math.min(1, u * 1.8));
        const c = verdict ?? '#ffd040';
        const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        // chunky corner brackets: dark underlay + bright leg
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const bx = cx + sx * d;
          const by = cy + sy * Math.round(d * 0.62);
          for (const [cc, off, w] of [['#0a0e18', 1, 12], [c, 0, 10]] as const) {
            px(cc, Math.min(bx - sx * off, bx - sx * (off + w)), by - 2, w + 2, 4, fade);
            px(cc, bx - 2, Math.min(by - sy * off, by - sy * (off + w * 0.7)), 4, w * 0.7 + 2, fade);
          }
        }
        if (u < 0.55) {
          // horizontal sweep line inside the bracket box
          const sy = Math.round(cy - d * 0.62 + 6 + (d * 1.24 - 12) * (u / 0.55));
          px('#fff0a0', cx - d + 4, sy, d * 2 - 8, 3, 0.95);
        }
        if (verdict) ring(verdict, d + 5, 2, 0.9 * fade);
        return;
      }
      case 'badge': {
        // RFID wave arcs from the card up to the reader + a reader plate at
        // the aim point whose LED flips amber -> green/red with the verdict
        if (t > 0.6) return;
        const u = t / 0.6;
        const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        // card sits raised at right-of-centre; arcs sweep up-left to the reader
        const ox = cx + 150, oy = cy + 150;
        for (let i = 0; i < 4; i++) {
          const p = (i / 4 + t * 2.4) % 1;
          const ax = ox + (cx - ox) * p, ay = oy + (cy - oy) * p;
          px(i === 0 ? '#e8ffff' : '#8fd8ff', ax - 3, ay - 3, 6, 6, (1 - p * 0.7) * fade);
        }
        // reader plate on the door at the aim point
        const led = verdict ?? (Math.floor(anim.time * 8) % 2 ? '#ffb830' : '#7a4a08');
        const pFade = fade;
        px('#0a0e18', cx - 13, cy - 17, 26, 34, pFade);
        px('#2a3038', cx - 10, cy - 14, 20, 28, pFade);
        px('#161a20', cx - 10, cy - 14, 20, 4, pFade);
        px(led, cx - 5, cy - 7, 10, 10, pFade);
        px('#0a0e18', cx - 5, cy + 6, 10, 3, pFade);
        px('#0a0e18', cx - 5, cy + 11, 10, 3, pFade);
        if (verdict) ring(verdict, 22, 3, 0.95, cx, cy);
        return;
      }
      case 'mfa': {
        // token glow: twin gold rings expanding off the aim point + a check
        // burst when the second factor confirms
        if (t > 0.65) return;
        const u = t / 0.65;
        ring('#ffd040', 8 + 34 * u, 4, 0.95 * (1 - u * 0.6));
        ring('#fff0a0', 5 + 20 * u, 2, 0.8 * (1 - u * 0.5));
        if (anim.sinceConfirm >= 0 && anim.confirmGood) {
          const k = Math.min(1, anim.sinceConfirm / 0.12);
          // chunky check mark at the aim point
          for (let i = 0; i < 7 * k; i++) px('#4aff5a', cx - 12 + i * 2.6, cy - 2 + i * 1.9, 5, 5, 1);
          for (let i = 0; i < 12 * k; i++) px('#4aff5a', cx + 6 + i * 2.1, cy + 8 - i * 2.4, 5, 5, 1);
          ring('#4aff5a', 14 + anim.sinceConfirm * 60, 3, 1 - anim.sinceConfirm * 1.4);
        }
        return;
      }
      case 'tap': {
        // the tap clips onto the trunk cable at the aim point, then packets
        // stream down toward the unit
        if (t > 0.6) return;
        const u = t / 0.6;
        const fade = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        // cable crossing the aim point
        px('#101318', cx - 48, cy + 10, 96, 10, fade);
        px('#3a3f4a', cx - 48, cy + 11, 96, 8, fade);
        px('#5a6274', cx - 48, cy + 11, 96, 2, fade);
        // clip drops on during the first 30%
        const dy = Math.round(-26 + 26 * Math.min(1, u / 0.3));
        px('#0a0e18', cx - 11, cy - 16 + dy, 22, 16, fade);
        px('#c8a020', cx - 9, cy - 14 + dy, 18, 12, fade);
        px('#ffd040', cx - 9, cy - 14 + dy, 18, 4, fade);
        px('#4aff5a', cx - 2, cy - 11 + dy, 4, 4, fade);
        // packets streaming out of the clip
        for (let i = 0; i < 5; i++) {
          const s = (i * 0.22 + t * 2.6) % 1;
          px('#5ff0ff', cx - 4 + (i % 3) * 3, cy + 20 + s * 42, 6, 4, (1 - s) * fade);
        }
        return;
      }
      case 'patch': {
        // the disk writes to the host: a big progress bar filling at the aim
        // point with rising data ticks
        if (t > 0.7) return;
        const u = t / 0.7;
        const fade = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
        const fill = Math.min(1, u / 0.75);
        px('#0a0e18', cx - 26, cy - 9, 52, 18, fade);
        px(verdict ?? '#c8c0b0', cx - 24, cy - 7, 48, 14, fade * 0.4);
        // frame
        px(verdict ?? '#c8c0b0', cx - 26, cy - 9, 52, 2, fade);
        px(verdict ?? '#c8c0b0', cx - 26, cy + 7, 52, 2, fade);
        px(verdict ?? '#c8c0b0', cx - 26, cy - 9, 2, 18, fade);
        px(verdict ?? '#c8c0b0', cx + 24, cy - 9, 2, 18, fade);
        px(verdict ?? '#4aff5a', cx - 24, cy - 7, 48 * fill, 14, 0.95 * fade);
        // rising write ticks
        for (let i = 0; i < 4; i++) {
          const s = (i * 0.3 + t * 3.4) % 1;
          px('#8aff9a', cx - 20 + i * 13, cy - 16 - s * 12, 4, 4, (1 - s) * fade);
        }
        return;
      }
      case 'keyboard': {
        // quick strike burst at the impact point
        if (t > 0.32) return;
        const u = t / 0.32;
        ring(verdict ?? '#f4f4f0', 7 + 22 * u, 3, 1 - u);
        ring(verdict ?? '#8fd8ff', 3 + 12 * u, 2, 0.8 * (1 - u));
        return;
      }
      default:
        return; // edr's containment pulse already owns its feedback
    }
    } finally {
      g.restore();
    }
  }

  /**
   * Compact Doom-style message ticker: tiny glyphs (about half the old
   * chunky height) at the top-left on a dark backing strip. The newest
   * message wraps to up to 3 lines so long pickup/refusal/corroboration
   * text is never cut; at most 4 rows total keeps the whole block in the
   * top band, clear of the view centre. Collapsed repeats show "xN" on
   * the last wrapped line.
   */
  /**
   * Slim always-on objective line (one tiny row, top-left): the status bar's done count plus
   * the current open objective, word-truncated to the ticker's 52 columns.
   * Returns the height it used (0 when the mission has no objectives).
   */
  private drawPinnedObjective(
    objs: { text: string; done: boolean; failed: boolean }[],
    progress?: { done: number; total: number },
  ): number {
    // same count as the status bar's OBJ panel when the runtime supplies it
    const line = pinnedObjectiveLine(objs, progress);
    if (!line) return 0;
    const g = this.g;
    const open = objs.some((o) => !o.done && !o.failed);
    const { head, body } = line;
    if (this.frame) this.frame.objective = { mode: 'pinned', lines: [`${head} ${body}`] };
    const headW = measureText(head, 'tiny');
    const w = 4 + headW + 5 + measureText(body, 'tiny');
    drawGlassPlate(g, { x: 1, y: 1, w: w + 3, h: 7 }, { accent: { color: '#a87a10', light: '#ffd040', w: 2 } });
    drawText(g, head, 5, 2, '#ffd040', 'tiny', null);
    drawText(g, body, 5 + headW + 5, 2, open ? '#f0ece4' : '#5aff6a', 'tiny', null);
    return 8;
  }

  private drawTicker(top = 1, maxRows = 4): void {
    let y = top;
    if (this.pickup) {
      // pinned pickup lane: gold-edged plate, holds for ~1.9 s, blink-fades out
      const p = this.pickup;
      // wrapped, never cut: a long pickup line takes a second row
      const lines = wrapText(p.text.toUpperCase(), 54, Infinity).slice(0, 2);
      if (!(p.t < 0.4 && Math.floor(p.t * 20) % 2 === 0)) {
        const w = lines.reduce((m, l) => Math.max(m, measureText(l, 'tiny')), 0);
        drawGlassPlate(this.g, { x: 1, y, w: w + 9, h: 7 * lines.length }, { fill: 'rgba(30,24,6,0.78)', accent: { color: '#d8a828', light: '#fff0a0', w: 2 } });
        lines.forEach((l, i) => drawText(this.g, l, 6, y + 1 + i * 7, '#fff0a0', 'tiny', null));
      }
      y += 7 * lines.length + 2;
    }
    // one plate width for the whole block (the widest row) so the feed reads
    // as a single panel instead of a ragged stack of per-line strips
    const rows = tickerRows(this.ticker.visible, maxRows);
    const plateW = rows.reduce((m, r) => Math.max(m, measureText(r.line, 'tiny')), 0) + 3;
    rows.forEach((row, i) => {
      if (row.t < 0.4 && Math.floor(row.t * 20) % 2 === 0) {
        y += 7;
        return;
      }
      // one panel: only the first row is lit on top, only the last is shadowed
      drawGlassPlate(this.g, { x: 1, y, w: plateW, h: 7 }, { top: i === 0, bottom: i === rows.length - 1 });
      drawText(this.g, row.line, 2, y + 1, tickerColor(row.kind, this.colorBlind), 'tiny', null);
      this.frame?.ticker.push(row.line);
      y += 7;
    });
  }

  /**
   * Action prompt in a fixed band just above the status bar (still visible
   * while aimed; never inside the centre aim box). At most two lines,
   * `[LMB]…` then `[E]…`, on a dark plate. Ammo cost is appended in
   * tool-native units ('-1 SCAN') so it can't read as a file size.
   * Left-aligned so the centre-bottom viewmodel lane stays clear at the
   * fire moment — the tool switch banner rides the same band.
   */
  private drawPrompt(p: {
    lmb: ToolHint | null;
    use: string | null;
    lmbHot?: boolean;
    banner?: { title: string; blurb: string } | null;
    footer?: string | null;
    lmbKey?: string;
  }): void {
    const g = this.g;
    const lines: { key: string; text: string; ready: boolean; hot: boolean; cost?: string | null }[] = [];
    if (p.banner) {
      lines.push({ key: 'TOOL', text: p.banner.title, ready: true, hot: false });
      lines.push({ key: '', text: p.banner.blurb, ready: true, hot: false });
    } else {
      if (p.lmb) lines.push({ key: p.lmbKey ?? 'LMB', text: p.lmb.text, ready: p.lmb.ready, hot: !!p.lmbHot, cost: p.lmb.cost });
      if (p.use) lines.push({ key: 'E', text: p.use, ready: true, hot: false });
    }
    const viewH = BASE_H - BASE_STATUS;
    const shown = lines.slice(0, 2);
    // nav strip (ESC/M/L hints): a dim corner plate at the lower left, tucked
    // just above arsenal's prompt band so the two can never overlap; with no
    // prompt it sits on the corner itself
    if (this.frame) this.frame.prompt.footer = p.footer ?? null;
    if (p.footer) {
      const w = measureText(p.footer, 'small');
      const ny = viewH - 9 - (shown.length ? shown.length * 10 + 1 : 0);
      drawGlassPlate(g, { x: 0, y: ny, w: w + 8, h: 9 }, { fill: 'rgba(6,8,12,0.76)' });
      drawText(g, p.footer, 4, ny + 1, '#aab3c2', 'small', null);
    }
    if (!lines.length) return;
    // bottom of the lowest plate sits 1px above the status bar
    let y = viewH - 9 - (shown.length - 1) * 10;
    for (const line of shown) {
      const keyW = line.key ? 4 + measureText(line.key, 'small') + 4 : 0;
      const textW = measureText(line.text, 'small');
      const costW = line.cost ? 6 + measureText(line.cost, 'small') : 0;
      const w = keyW + (keyW ? 4 : 0) + textW + costW;
      const x = 4;
      drawGlassPlate(g, { x: x - 3, y: y + PROMPT_ROW_PLATE.dy, w: w + 6, h: PROMPT_ROW_PLATE.h }, { fill: 'rgba(6,8,12,0.76)' });
      let tx = x;
      if (line.key) {
        const kw = measureText(line.key, 'small');
        const plate = keyPlateRect(tx, y, kw);
        this.frame?.prompt.rows.push({ key: line.key, text: line.text, plate: { ...plate } });
        drawKeyCap(g, plate, line.ready);
        drawText(g, line.key, plate.glyphX, plate.glyphY, line.ready ? '#1a1408' : '#9aa0ac', 'small');
        tx += kw + 8;
      }
      if (!line.key) this.frame?.prompt.rows.push({ key: '', text: line.text, plate: null });
      const col = line.hot ? '#ffffff' : line.ready ? '#e8ecf2' : '#9aa0ac';
      drawText(g, line.text, tx, y, col, 'small', '#000');
      if (line.cost) drawText(g, line.cost, tx + textW + 6, y, '#c89828', 'small', '#000');
      y += 10;
    }
  }

  /**
   * Compact objective strip (<= 20px = 12% of the 3D view). `idx` >= 0 flashes
   * that one objective (it just changed); -1 = TAB: current open objective + n/m.
   */
  private drawObjectiveStrip(objs: { text: string; done: boolean; failed: boolean }[], idx: number): void {
    const g = this.g;
    if (idx >= 0 && this.objShowT < 0.4 && Math.floor(this.objShowT * 20) % 2 === 0) return;
    const done = objs.filter((o) => o.done).length;
    const focus = idx >= 0 ? idx : objs.findIndex((o) => !o.done && !o.failed);
    const o = objs[focus < 0 ? objs.length - 1 : focus];
    if (!o) return;
    const head = idx >= 0 ? (o.failed ? 'FAILED' : o.done ? 'DONE' : 'OBJECTIVE') : `OBJ ${done}/${objs.length}`;
    const headRamp = o.failed ? MSG_RAMP.bad : o.done ? MSG_RAMP.good : MSG_RAMP.warn;
    const col = o.failed ? '#ff5a3a' : o.done ? '#5aff6a' : '#f0ece4';
    const tx = 13 + measureChunky(head) + 6;
    // one line, always: a long objective is cut by design here (full text on TAB / pause / log)
    const fitted = stripObjectiveLine(o.text, BASE_W - tx - 3);
    const chunky = fitted.font === 'chunky';
    const lines = [fitted.text];
    if (this.frame) this.frame.objective.lines = [...lines];
    const h = Math.min(OBJ_STRIP_MAX, 11);
    g.fillStyle = getTickerPattern(g) ?? '#000';
    g.fillRect(0, 0, BASE_W, h);
    g.fillStyle = o.failed ? '#a80c06' : o.done ? '#14a024' : '#a87a10';
    g.fillRect(0, h - 1, BASE_W, 1);
    // status lamp
    g.fillStyle = '#000';
    g.fillRect(3, 2, 7, 7);
    g.fillStyle = o.failed ? '#e01e10' : o.done ? '#2ad83a' : '#ffd040';
    g.fillRect(4, 3, 5, 5);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(4, 3, 5, 1 / RES);
    g.fillRect(4.5, 3.5, 1.5, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(4, 6.5, 5, 1.5);
    drawChunky(g, head, 13, 2, headRamp);
    lines.forEach((line, i) => {
      const y = chunky ? 2 : 2 + i * 8;
      const w = chunky ? drawChunky(g, line, tx, y, col) : drawText(g, line, tx, y, col, 'small', '#000');
      if (o.done || o.failed) {
        g.fillStyle = col;
        g.fillRect(tx, y + 3, w - 1, 1);
      }
    });
  }

  /** TAB: full objectives list — every objective with its status lamp, like the
   *  pause-menu 'TAB OBJECTIVES' line promises. Held only while Tab is down.
   *  Every objective is wrapped in full; a list taller than the panel pages
   *  (PAGE n/m, cycling while Tab stays down) instead of being cut. */
  private drawObjectivesOverlay(objs: { text: string; done: boolean; failed: boolean }[]): void {
    const g = this.g;
    const done = objs.filter((o) => o.done).length;
    const lineH = 8;
    const top = 13;
    const maxH = BASE_H - BASE_STATUS - 4;
    // each objective block also costs a 1px gap: budget rows conservatively
    const maxRows = Math.floor((maxH - top - 4) / (lineH + 1));
    const pages = layoutObjectivesOverlay(objs, maxRows);
    const pageIndex = overlayPageAt(this.tabHeldT, pages.length);
    const rows = pages[pageIndex] ?? [];
    const textRows = rows.reduce((n, r) => n + r.lines.length, 0);
    const h = Math.min(maxH, top + textRows * lineH + rows.length + 4);
    g.fillStyle = getTickerPattern(g) ?? 'rgba(0,0,0,0.85)';
    g.fillRect(0, 0, BASE_W, h);
    g.fillStyle = '#a87a10';
    g.fillRect(0, h - 1, BASE_W, 1);
    drawChunky(g, `OBJECTIVES ${done}/${objs.length}`, 4, 3, MSG_RAMP.warn);
    if (pages.length > 1) {
      const tag = `PAGE ${pageIndex + 1}/${pages.length}`;
      drawText(g, tag, BASE_W - measureText(tag, 'small') - 4, 3, '#ffc080', 'small', '#000');
    }
    let y = top;
    for (const row of rows) {
      const col = row.status === 'failed' ? '#ff5a3a' : row.status === 'done' ? '#5aff6a' : '#f0ece4';
      if (!row.continued) {
        g.fillStyle = '#000';
        g.fillRect(4, y + 1, 5, 5);
        g.fillStyle = row.status === 'failed' ? '#e01e10' : row.status === 'done' ? '#2ad83a' : '#ffd040';
        g.fillRect(5, y + 2, 3, 3);
      }
      row.lines.forEach((line, i) => {
        const w = drawText(g, line, 13, y, col, 'small', '#000');
        if (row.settled && i === 0 && !row.continued) {
          g.fillStyle = col;
          g.fillRect(13, y + 3, w - 1, 1);
        }
        y += lineH;
      });
      y += 1;
    }
  }

  /**
   * Low-integrity (<=25%) warning: the bar's top edge throbs red and the
   * face well gets a warning frame — kept OFF the portrait so the damage
   * ladder (the face's own hurt tiers) stays readable.
   */
  private drawCritFrame(by: number, pulse: boolean): void {
    const g = this.g;
    g.fillStyle = pulse ? '#ff2010' : '#7a0804';
    g.fillRect(0, by, BASE_W, pulse ? 2 : 1);
    const x = P_FACE[0] + 2;
    const y = by + 2;
    g.fillRect(x, y, 28, 1);
    g.fillRect(x, y + 29, 28, 1);
    g.fillRect(x, y, 1, 30);
    g.fillRect(x + 27, y, 1, 30);
  }

  private drawBar(o: {
    integrity: number;
    ammo: number | null;
    ammoName: string;
    tool: ToolDef;
    gender: Gender;
    credentials: string;
    objectives: { text?: string; done: boolean; failed: boolean; progress?: number; target?: number }[];
    progress?: { done: number; total: number; failed: boolean };
    owned?: string[];
    face?: (g: CanvasRenderingContext2D, x: number, y: number) => void;
    resources?: ResRow[];
    got?: GotFx;
  }): void {
    const g = this.g;
    const by = BASE_H - BASE_STATUS;
    g.drawImage(this.bar, 0, by, BASE_W, BASE_STATUS);

    const pulse = Math.floor(this.time * 5) % 2 === 0;
    const hp = Math.ceil(o.integrity);
    const crit = hp > 0 && hp <= 25;
    if (crit) alarmWell(g, P_INT, by, pulse);

    // AMMO / bandwidth art: status lamp for unlimited tools, alarm well when low
    const rr = o.resources?.find((x) => x.active);
    const low =
      o.ammo !== null && (o.ammo === 0 || (!!rr && rr.max > 0 && o.ammo <= Math.max(1, Math.floor(rr.max * 0.25))));
    const ready = this.cooldown <= 0.01;
    if (o.ammo === null) {
      drawStatusLamp(g, P_AMMO[0] + 13, by + 7, ready);
    } else if (low) {
      alarmWell(g, P_AMMO, by, pulse);
    }

    // TOOLS: nine uniform Doom ARMS wells (digits come with the bar text below)
    const tools = sortedTools();
    const cells = slotCells({ tools, owned: o.owned ?? [], selectedSlot: o.tool.slot, got: o.got });
    drawSlotWells(g, cells);

    // FACE
    if (o.face) {
      g.save();
      g.setTransform(RES, 0, 0, RES, 0, 0);
      g.imageSmoothingEnabled = false;
      o.face(g, P_FACE[0] + 5, by + 4);
      g.restore();
    }
    else this.drawFace(P_FACE[0] + 4, by + 2, o.gender, o.integrity);
    if (crit) this.drawCritFrame(by, pulse);

    // CRED keycard + current role
    const rc = roleColor(o.credentials);
    const cx = P_CRED[0] + Math.round((P_CRED[1] - 16) / 2);
    const cy = by + 7; // one unit lower: the "BADGE:" caption sits above it
    drawKeycard(g, cx, cy, rc.stripe, rc.light);

    // RESOURCES: gold plate behind the held tool's row (Doom RES table)
    visibleResources(o.resources ?? []).forEach((r, i) => {
      if (!r.active) return;
      const p = resRowPlate(i);
      g.fillStyle = 'rgba(255,208,64,0.14)';
      g.fillRect(p.x, p.y, p.w, p.h);
    });

    // every text run in the bar comes from the shared, test-verified layout
    const texts = statusBarText(
      {
        integrity: o.integrity,
        ammo: o.ammo,
        ammoName: o.ammoName,
        ready,
        credentials: o.credentials,
        credTint: rc.light,
        tool: o.tool,
        tools,
        owned: o.owned ?? [],
        got: o.got,
        resources: o.resources ?? [],
        objectives: o.objectives,
        progress: o.progress,
      },
      pulse,
    );
    for (const t of texts) drawBarText(g, t);
    drawSlotStrikes(g, cells);
  }

  /** 26x28 procedural analyst portrait; reacts to damage like Doom's face. */
  private drawFace(x: number, y: number, gender: Gender, integrity: number): void {
    const g = this.g;
    const px = (c: string, ax: number, ay: number, w = 1, h = 1) => {
      g.fillStyle = c;
      g.fillRect(x + ax, y + ay, w, h);
    };
    const native = (c: string, ax: number, ay: number, w = 1, h = 1) => px(c, ax, ay, w / RES, h / RES);
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
    native('#fff0c8', 7.25, 7.25);
    native(tier >= 2 ? '#8a1a10' : '#d8a078', 17.25, 14.25, 2, 1);
    if (tier >= 1) native('#7a3020', 18.25, 9.25, 1, 3);
    native('#d0c8b8', 4.25, 23.25, 2, 1);
  }
}

/** Render one laid-out bar text run (all positions/styles from barLayout.ts). */
function drawBarText(g: CanvasRenderingContext2D, t: BarText): void {
  if (t.font === 'big' || t.font === 'bigfat') {
    drawBigText(g, t.text, t.x, t.y, t.color as string[], undefined, t.font === 'bigfat');
  } else {
    drawText(g, t.text, t.x, t.y, t.color as string, t.font as 'small' | 'tiny', t.shadow === undefined ? '#000' : t.shadow);
  }
}

/** Alarm: the recessed well behind a critical number throbs dark red. */
function alarmWell(g: CanvasRenderingContext2D, p: Panel, by: number, pulse: boolean): void {
  g.fillStyle = pulse ? '#5a0804' : '#2a0402';
  g.fillRect(p[0] + 5, by + 6, p[1] - 10, BASE_STATUS - 12);
}

export { sortedTools };
