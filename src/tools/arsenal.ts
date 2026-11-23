import type { EventBus } from '../core/events';
import type { Gender, Mission, ToolDef, ToolUseContext, ViewmodelAnim } from '../core/types';
import { toolRegistry } from './index';
import { playTool, playVoice, type ToolSound } from './sfx';
import { skinTriple } from './look';
import { Face, drawPortrait } from './portrait';
import { wrapText } from '../render/font';

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
  mfa: { fire: 'mfa-beep', hit: 'confirm' },
  patch: { wind: 'patch-insert', fire: 'patch-fire', hit: 'confirm' },
  firewall: { fire: 'firewall-blast', hit: 'usb-hit' },
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

const RES_NAME: Record<string, string> = {
  'usb-charge': 'SCAN SESSIONS',
  pcap: 'PCAP',
  'edr-cell': 'EDR CELLS',
  'patch-disk': 'PATCH DISKS',
};
/** Doom-style pickup lines: [singular, plural] per ammo resource. */
const PICKUP_NAME: Record<string, [string, string]> = {
  'usb-charge': ['SCAN SESSION', 'SCAN SESSIONS'],
  pcap: ['CAPTURE BUFFER', 'CAPTURE BUFFERS'],
  'edr-cell': ['EDR CELL', 'EDR CELLS'],
  'patch-disk': ['PATCH DISK', 'PATCH DISKS'],
};
/** Column width when paging long tool explanations into ticker pages (matches tickerRows' 52-col tiny-glyph wrap). */
const TICKER_COLS = 52;
const RES_LABEL: Record<string, string> = { 'usb-charge': 'SCAN', pcap: 'PCAP', 'edr-cell': 'CELL', 'patch-disk': 'DISK' };

/** Ticker rows an explanation page aims for, and the most one whole sentence may take (the ticker shows a 3-line message in full). */
const PAGE_LINES = 2;
const SENTENCE_LINES = 3;

/**
 * Split a long tool explanation into ticker pages that end on a full stop instead of mid-phrase: sentences
 * are packed together up to PAGE_LINES wrapped lines, and one sentence of up to SENTENCE_LINES gets a page
 * to itself. Only a sentence longer than that is split by lines (as every page used to be).
 */
export function explanationPages(text: string, cols = TICKER_COLS): string[] {
  const linesOf = (s: string) => wrapText(s, cols, Infinity);
  const sentences = text.toUpperCase().trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  for (const sentence of sentences) {
    const joined = cur ? `${cur} ${sentence}` : sentence;
    if (linesOf(joined).length <= PAGE_LINES) {
      cur = joined;
      continue;
    }
    if (cur) pages.push(cur);
    const lines = linesOf(sentence);
    // an over-long sentence: full pages by line, its tail starts the next page
    while (lines.length > SENTENCE_LINES) pages.push(lines.splice(0, PAGE_LINES).join(' '));
    cur = lines.join(' ');
  }
  if (cur) pages.push(cur);
  return pages;
}

export interface ArsenalSnapshot {
  owned: string[];
  ammo: [string, number][];
  currentId: string;
}

function toolIntroduction(t: ToolDef): string {
  return `${t.passive ? '' : `[${t.slot}] `}${t.name}: ${t.control?.use ?? ''}`;
}

/** Tool-native unit name for an ammo resource ('-1 SCAN', '-1 PCAP', ...). */
export function ammoUnit(resource: string): string {
  return RES_LABEL[resource] ?? resource.slice(0, 4).toUpperCase();
}

export class Arsenal {
  readonly owned = new Set<string>();
  readonly ammo = new Map<string, number>();
  readonly face = new Face();
  /** Seconds since the last new-tool pickup (gold flash + ARMS slot blink). */
  gotT = 9;
  gotSlot = 0;
  current: ToolDef = sorted()[0];
  gender: Gender = 'male';
  private pages: string[] = [];
  private pageT = 0;
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
  private flashId: string | null = null;
  private flashElapsed = 0;
  private flashQueue: string[] = [];

  constructor(private bus: EventBus) {
    bus.on('tool-hit', ({ toolId, good }) => this.confirm(good, toolId));
    bus.on('triage', ({ correct }) => {
      this.confirm(correct, 'mouse');
      playTool(correct ? 'mouse-flag' : 'fizzle');
    });
    bus.on('badge-door', ({ allowed }) => {
      this.confirm(allowed, 'badge');
      playTool(allowed ? 'badge-ok' : 'badge-deny');
      if (allowed) playTool('door-clunk'); // the bolt itself, a beat after the beep
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
    this.flashId = null;
    this.flashElapsed = 0;
    this.flashQueue = [];
    for (const id of defaultLoadout(mission)) this.own(toolRegistry.require(id), false);
    for (const t of sorted()) if (t.ammo && !this.ammo.has(t.ammo.resource)) this.ammo.set(t.ammo.resource, 0);
    const activeTools = sorted().filter((t) => !t.passive);
    this.current = activeTools.find((t) => this.owned.has(t.id)) ?? activeTools[0];
    this.next = null;
    this.swapPhase = 'raise';
    this.swapT = 0;
    this.cooldown = 0;
    this.windT = -1;
    this.sinceUse = 9;
    this.sinceConfirm = 9;
    this.face.reset();
  }

  snapshot(): ArsenalSnapshot {
    return { owned: [...this.owned], ammo: [...this.ammo], currentId: this.current.id };
  }

  restore(snapshot: ArsenalSnapshot): void {
    this.owned.clear();
    for (const id of snapshot.owned) this.owned.add(id);
    this.ammo.clear();
    for (const [resource, amount] of snapshot.ammo) this.ammo.set(resource, amount);
    const savedTool = toolRegistry.get(snapshot.currentId);
    this.current = savedTool && !savedTool.passive ? savedTool : sorted().find((tool) => !tool.passive) ?? sorted()[0];
    this.next = null;
    this.swapT = 0;
    this.swapPhase = 'none';
    this.cooldown = 0;
    this.windT = -1;
    this.queued = false;
    this.sinceUse = 9;
    this.sinceConfirm = 9;
    this.confirmGood = true;
    this.time = 0;
    this.dryMsgT = 0;
    this.flashId = null;
    this.flashElapsed = 0;
    this.flashQueue = [];
    this.gotT = 9;
    this.gotSlot = 0;
    this.pages = [];
    this.pageT = 0;
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
      this.face.talk();
      this.gotT = 0;
      this.gotSlot = t.slot;
      this.say(toolIntroduction(t));
      if (!t.passive) this.switchTo(t);
    }
  }

  private queuePages(texts: string[]): void {
    this.pages = texts.flatMap((text) => explanationPages(text));
    // let "YOU GOT THE ...!" read first
    this.pageT = 1.2;
  }

  /** Queue a long explanation as 2-line ticker pages so it is never cut off mid-sentence. */
  private say(text: string): void {
    this.face.talk();
    this.queuePages([text]);
  }

  introduce(tools: ToolDef[]): void {
    if (!tools.length) return;
    this.face.talk();
    this.queuePages(tools.map(toolIntroduction));
  }

  owns(id: string): boolean {
    return this.owned.has(id);
  }

  maxFor(resource: string): number {
    const caps = sorted().filter((t) => t.ammo?.resource === resource).map((t) => t.ammo!.max);
    return caps.length ? Math.max(...caps) : 20;
  }

  /** Apply an item grant. Returns the ticker text. */
  grant(resource: string, amount: number): string {
    if (resource.startsWith('tool:')) {
      const t = toolRegistry.get(resource.slice(5));
      if (t) {
        if (this.owned.has(t.id)) {
          // already carrying it: a duplicate tool converts to its ammo
          if (t.ammo) {
            const before = this.ammo.get(t.ammo.resource) ?? 0;
            this.ammo.set(t.ammo.resource, Math.min(this.maxFor(t.ammo.resource), before + t.ammo.start));
            playTool('ammo');
            this.face.grin();
            return this.pickupLine(t.ammo.resource, t.ammo.start);
          }
          return `ALREADY CARRYING THE ${t.name}.`;
        }
        this.own(t, true);
        return `YOU GOT THE ${t.name}!`;
      }
      return 'Picked up an unknown tool';
    }
    const before = this.ammo.get(resource) ?? 0;
    this.ammo.set(resource, Math.min(this.maxFor(resource), before + amount));
    playTool('ammo');
    this.face.grin();
    return this.pickupLine(resource, amount);
  }

  /** Short Doom-style pickup line: "PICKED UP 2 PATCH DISKS." */
  private pickupLine(resource: string, amount: number): string {
    const names = PICKUP_NAME[resource];
    const plural = names?.[1] ?? (RES_NAME[resource] ?? `${resource.toUpperCase()}S`);
    const single = names?.[0] ?? plural;
    if (amount === 1) {
      const article = /^[AEIOU]/.test(single) ? 'AN' : 'A';
      return `PICKED UP ${article} ${single}.`;
    }
    return `PICKED UP ${amount} ${plural}.`;
  }

  ammoFor(t: ToolDef = this.current): number | null {
    return t.ammo ? (this.ammo.get(t.ammo.resource) ?? 0) : null;
  }

  select(slot: number): boolean {
    const t = sorted().find((x) => x.slot === slot);
    if (!t) return false;
    if (t.passive) {
      this.bus.emit('message', {
        text: 'BADGE and TOKEN work automatically: press E at a reader.',
        kind: 'info',
      });
      return false;
    }
    if (!this.owned.has(t.id)) {
      playTool('dry');
      this.bus.emit('message', { text: `Slot ${slot} empty: ${t.name} not issued yet.`, kind: 'info' });
      return false;
    }
    this.switchTo(t);
    return true;
  }

  cycle(dir: number): void {
    const owned = sorted().filter((t) => !t.passive && this.owned.has(t.id));
    if (owned.length < 2) return;
    const target = this.next ?? this.current;
    const i = owned.indexOf(target);
    this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }

  private switchTo(t: ToolDef): void {
    if (t.passive) return;
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

  get viewTool(): ToolDef {
    return this.flashId ? toolRegistry.require(this.flashId) : this.current;
  }

  flash(toolId: string): void {
    const tool = toolRegistry.get(toolId);
    if (!tool) return;
    if (this.flashId) {
      this.flashQueue.push(tool.id);
      return;
    }
    this.flashId = tool.id;
    this.flashElapsed = 0;
  }

  private tickFlash(dt: number): void {
    if (!this.flashId) return;
    this.flashElapsed += dt;
    if (this.flashElapsed < 0.6) return;
    this.flashId = this.flashQueue.shift() ?? null;
    this.flashElapsed = 0;
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
    this.gotT += dt;
    this.sinceUse += dt;
    this.sinceConfirm += dt;
    this.tickFlash(dt);
    this.dryMsgT = Math.max(0, this.dryMsgT - dt);
    this.pageT -= dt;
    if (this.pages.length && this.pageT <= 0) {
      this.bus.emit('message', { text: this.pages.shift()!, kind: 'info' });
      this.pageT = 3;
    }
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
        const spec = this.current.ammo;
        if (this.current.use(ctx()) === false && spec) {
          this.ammo.set(spec.resource, Math.min(spec.max, (this.ammo.get(spec.resource) ?? 0) + 1));
        }
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
          this.bus.emit('message', { text: `Out of ${RES_NAME[spec.resource] ?? spec.resource.toUpperCase()}: find a pickup or switch tools.`, kind: 'warn' });
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

  /** Every resource any tool uses, as current/max (Doom's AMMO table). */
  resources(): { id: string; label: string; cur: number; max: number; owned: boolean; active: boolean }[] {
    const out: { id: string; label: string; cur: number; max: number; owned: boolean; active: boolean }[] = [];
    for (const t of sorted()) {
      if (!t.ammo || out.some((r) => r.id === t.ammo!.resource)) continue;
      const id = t.ammo.resource;
      out.push({
        id,
        label: RES_LABEL[id] ?? id.slice(0, 4).toUpperCase(),
        cur: this.ammo.get(id) ?? 0,
        max: this.maxFor(id),
        owned: sorted().some((x) => x.ammo?.resource === id && this.owned.has(x.id)),
        active: this.current.ammo?.resource === id,
      });
    }
    return out;
  }

  /** New-tool pickup moment: k fades 1→0 over the gold flash; slot blinks longer. */
  got(): { k: number; slot: number; blink: boolean } | null {
    if (this.gotT > 1.6) return null;
    return { k: Math.max(0, 1 - this.gotT / 0.45), slot: this.gotSlot, blink: Math.floor(this.gotT * 8) % 2 === 0 };
  }

  anim(): ViewmodelAnim {
    let lower = 0;
    if (this.swapPhase === 'lower') lower = Math.min(1, this.swapT / LOWER);
    else if (this.swapPhase === 'raise') lower = Math.max(0, 1 - this.swapT / RAISE);
    const flashing = this.flashId !== null;
    return {
      sinceUse: flashing ? this.flashElapsed : this.sinceUse,
      sinceConfirm: this.sinceConfirm,
      confirmGood: this.confirmGood,
      time: this.time,
      ammo: this.ammoFor(this.viewTool),
      skin: skinTriple(),
      lower: flashing ? 0 : lower,
    };
  }

  /** Status face into the HUD's 26x28 face well (top-left x, y). */
  drawFace(g: CanvasRenderingContext2D, x: number, y: number, integrity: number): void {
    g.fillStyle = '#0a0c12';
    g.fillRect(x, y, 26, 28);
    drawPortrait(g, x + 1, y + 3, this.gender, this.face.state(integrity));
  }
}
