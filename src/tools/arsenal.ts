import type { EventBus } from '../core/events';
import type { Gender, Mission, ToolDef, ToolUseContext, ViewmodelAnim } from '../core/types';
import { toolRegistry } from './index';
import { playTool, playVoice, type ToolSound } from './sfx';
import { skinTriple } from './look';
import { Face, drawPortrait } from './portrait';

const LOWER = 0.13;
const RAISE = 0.16;

/** Sound at trigger (windup) and at the moment the tool takes effect. */
const SOUNDS: Record<string, { wind?: ToolSound; fire?: ToolSound; hit?: ToolSound }> = {
  keyboard: { wind: 'kb-swing', fire: 'kb-impact', hit: 'confirm' },
  mouse: { fire: 'mouse-click', hit: 'confirm' },
  usb: { fire: 'usb-fire', hit: 'usb-hit' },
  badge: { wind: 'badge-swipe' },
  tap: { fire: 'tap-sweep', hit: 'confirm' },
  edr: { wind: 'edr-charge', fire: 'edr-blast', hit: 'confirm' },
};

function sorted(): ToolDef[] {
  return toolRegistry.all().sort((a, b) => a.slot - b.slot);
}

/** Default loadout for a mission: explicit list, else everything unlocked at this difficulty. */
export function defaultLoadout(m: Pick<Mission, 'difficulty' | 'loadout'>): string[] {
  if (m.loadout) return m.loadout.filter((id) => toolRegistry.get(id));
  return sorted().filter((t) => (t.unlock?.difficulty ?? 1) <= m.difficulty).map((t) => t.id);
}

/**
 * ARSENAL runtime: owned tools, ammo, Doom-style lower/raise switching, the
 * windup → impact → recover use cycle, hit confirms, sfx, the ARMS panel and
 * the analyst's status face. main.ts drives it; it talks to the rest of the
 * game only through the event bus and ToolUseContext.
 */
const BUFFER = 0.15;

export class Arsenal {
  readonly owned = new Set<string>();
  readonly ammo = new Map<string, number>();
  readonly face = new Face();
  current: ToolDef = sorted()[0];
  gender: Gender = 'male';
  private queued = false;

  private next: ToolDef | null = null;
  private swapT = 0;
  private swapPhase: 'none' | 'lower' | 'raise' = 'none';
  private cooldown = 0;
  private windT = -1;
  private sinceUse = 9;
  private sinceConfirm = 9;
  private confirmGood = true;
  private time = 0;
  private dryMsgT = 0;

  constructor(private bus: EventBus) {
    bus.on('tool-hit', ({ toolId, good }) => this.confirm(good, toolId));
    bus.on('triage', ({ correct }) => {
      this.confirm(correct, 'mouse');
      playTool(correct ? 'mouse-flag' : 'fizzle');
    });
    bus.on('badge-door', ({ allowed }) => {
      this.confirm(allowed, 'badge');
      playTool(allowed ? 'badge-ok' : 'badge-deny');
    });
    bus.on('badge-confirm', ({ allowed }) => {
      this.confirm(allowed, 'badge');
      playTool(allowed ? 'badge-ok' : 'badge-deny');
    });
  }

  reset(mission: Pick<Mission, 'difficulty' | 'loadout'>, gender: Gender): void {
    this.queued = false;
    this.gender = gender;
    this.owned.clear();
    this.ammo.clear();
    for (const id of defaultLoadout(mission)) this.own(toolRegistry.require(id), false);
    for (const t of sorted()) if (t.ammo && !this.ammo.has(t.ammo.resource)) this.ammo.set(t.ammo.resource, 0);
    this.current = sorted().find((t) => this.owned.has(t.id)) ?? sorted()[0];
    this.next = null;
    this.swapPhase = 'raise';
    this.swapT = 0;
    this.cooldown = 0;
    this.windT = -1;
    this.sinceUse = 9;
    this.sinceConfirm = 9;
    this.face.reset();
  }

  private own(t: ToolDef, announce: boolean): void {
    const had = this.owned.has(t.id);
    this.owned.add(t.id);
    if (t.ammo) {
      const cur = this.ammo.get(t.ammo.resource) ?? 0;
      this.ammo.set(t.ammo.resource, Math.min(t.ammo.max, Math.max(cur, had ? cur : cur + t.ammo.start)));
    }
    if (announce && !had) {
      playTool('new-tool');
      playVoice(this.gender, 'pickup');
      this.face.grin();
      this.bus.emit('message', { text: `NEW TOOL: [${t.slot}] ${t.name}. ${t.control?.use ?? ''}`, kind: 'good' });
      this.switchTo(t);
    }
  }

  owns(id: string): boolean {
    return this.owned.has(id);
  }

  maxFor(resource: string): number {
    return Math.max(20, ...sorted().filter((t) => t.ammo?.resource === resource).map((t) => t.ammo!.max));
  }

  /** Apply an item grant. Returns the ticker text. */
  grant(resource: string, amount: number): string {
    if (resource.startsWith('tool:')) {
      const t = toolRegistry.get(resource.slice(5));
      if (t) {
        this.own(t, true);
        return `Picked up the ${t.name}`;
      }
      return 'Picked up an unknown tool';
    }
    const before = this.ammo.get(resource) ?? 0;
    this.ammo.set(resource, Math.min(this.maxFor(resource), before + amount));
    playTool('ammo');
    this.face.grin();
    const t = sorted().find((x) => x.ammo?.resource === resource);
    return `+${amount} ${resource.toUpperCase()}${t ? ` for ${t.name}` : ''}`;
  }

  ammoFor(t: ToolDef = this.current): number | null {
    return t.ammo ? (this.ammo.get(t.ammo.resource) ?? 0) : null;
  }

  select(slot: number): boolean {
    const t = sorted().find((x) => x.slot === slot);
    if (!t) return false;
    if (!this.owned.has(t.id)) {
      playTool('dry');
      this.bus.emit('message', { text: `Slot ${slot} empty: ${t.name} not issued yet.`, kind: 'info' });
      return false;
    }
    this.switchTo(t);
    return true;
  }

  cycle(dir: number): void {
    const owned = sorted().filter((t) => this.owned.has(t.id));
    if (owned.length < 2) return;
    const target = this.next ?? this.current;
    const i = owned.indexOf(target);
    this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }

  private switchTo(t: ToolDef): void {
    this.queued = false;
    if (t === this.current && !this.next) return;
    this.next = t;
    this.windT = -1;
    if (this.swapPhase !== 'lower') {
      this.swapPhase = 'lower';
      this.swapT = 0;
      playTool('lower');
    }
  }

  /** Is a switch in progress (tool unusable)? */
  get switching(): boolean {
    return this.swapPhase !== 'none';
  }

  get cooldownFrac(): number {
    return this.current.cooldown > 0 ? this.cooldown / this.current.cooldown : 0;
  }

  confirm(good: boolean, toolId?: string): void {
    this.sinceConfirm = 0;
    this.confirmGood = good;
    const s = toolId ? SOUNDS[toolId]?.hit : undefined;
    if (good && s) playTool(s);
    else if (!good && toolId !== 'badge' && toolId !== 'mouse') playTool('fizzle');
  }

  /**
   * Advance timers and handle the fire button. `held`/`pressed` are the
   * fire button states; auto tools repeat while held.
   */
  update(dt: number, held: boolean, pressed: boolean, ctx: () => ToolUseContext): void {
    this.time += dt;
    this.sinceUse += dt;
    this.sinceConfirm += dt;
    this.dryMsgT = Math.max(0, this.dryMsgT - dt);
    this.face.tick(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.swapPhase !== 'none') {
      this.swapT += dt;
      if (this.swapPhase === 'lower' && this.swapT >= LOWER) {
        if (this.next) this.current = this.next;
        this.next = null;
        this.swapPhase = 'raise';
        this.swapT = 0;
        playTool('raise');
      } else if (this.swapPhase === 'raise' && this.swapT >= RAISE) {
        this.swapPhase = 'none';
        this.swapT = 0;
      }
      return;
    }

    if (this.windT >= 0) {
      this.windT += dt;
      if (this.windT >= (this.current.windup ?? 0)) {
        this.windT = -1;
        const s = SOUNDS[this.current.id]?.fire;
        if (s) playTool(s);
        this.current.use(ctx());
      }
      return;
    }

    if (pressed && this.cooldown > 0 && this.cooldown <= BUFFER) this.queued = true;
    const want = pressed || this.queued || (held && this.current.auto === true);
    if (!want || this.cooldown > 0) return;
    this.queued = false;
    const spec = this.current.ammo;
    const have = this.ammoFor();
    if (spec && (have ?? 0) <= 0) {
      if (pressed) {
        playTool('dry');
        if (this.dryMsgT <= 0) {
          this.bus.emit('message', { text: `Out of ${spec.resource.toUpperCase()}: find a pickup or switch tools.`, kind: 'warn' });
          this.dryMsgT = 2;
        }
      }
      return;
    }
    if (spec) this.ammo.set(spec.resource, (have ?? 0) - 1);
    this.cooldown = Math.max(this.current.cooldown, (this.current.windup ?? 0) + 0.05);
    this.sinceUse = 0;
    this.windT = 0;
    const w = SOUNDS[this.current.id]?.wind;
    if (w) playTool(w);
    // zero-windup tools fire this same tick
    if ((this.current.windup ?? 0) <= 0) this.update(0, false, false, ctx);
  }

  /** Player took damage; dir = attacker side (-1 left, 1 right, 0 ahead). */
  hurt(dir: number): void {
    this.face.hurt(dir);
    playVoice(this.gender, 'pain');
  }

  anim(): ViewmodelAnim {
    let lower = 0;
    if (this.swapPhase === 'lower') lower = Math.min(1, this.swapT / LOWER);
    else if (this.swapPhase === 'raise') lower = Math.max(0, 1 - this.swapT / RAISE);
    return {
      sinceUse: this.sinceUse,
      sinceConfirm: this.sinceConfirm,
      confirmGood: this.confirmGood,
      time: this.time,
      ammo: this.ammoFor(),
      skin: skinTriple(),
      lower,
    };
  }

  /** Status face into the HUD's 26x28 face well (top-left x, y). */
  drawFace(g: CanvasRenderingContext2D, x: number, y: number, integrity: number): void {
    g.fillStyle = '#0a0c12';
    g.fillRect(x, y, 26, 28);
    drawPortrait(g, x + 1, y + 3, this.gender, this.face.state(integrity));
  }
}
