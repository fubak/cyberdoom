/** EGGS-owned: Doom-style typed cheat codes + the title-screen Konami code.
 * Pure logic — no DOM, no engine — so tests can drive it directly.
 *
 * Like Doom's IDDQD family, codes are typed letter-by-letter during play with
 * no console and no Enter: the buffer is suffix-matched against the table.
 * Non-letter input resets the buffer (a mistyped letter in Doom still left the
 * tail of the buffer, but a clean reset is friendlier on a browser where keys
 * double as movement).
 */

export interface CheatDef {
  /** Stable id used by applyCheat and __cd.cheat(). */
  id: string;
  /** Uppercase letter sequence typed during play. */
  code: string;
  /** Short flavor shown in the m13 build-notes console. */
  doc: string;
}

export const CHEATS: CheatDef[] = [
  { id: 'god', code: 'SUDO', doc: 'SUDO — privilege escalation: god mode' },
  { id: 'keys', code: 'HUNTER2', doc: 'HUNTER2 — all access (shows as *******)' },
  { id: 'map', code: 'WIRESHARK', doc: 'WIRESHARK — full packet capture (reveal automap)' },
  { id: 'music', code: 'RICKROLL', doc: 'RICKROLL — swap the track' },
  { id: 'dns', code: 'ITSDNS', doc: 'ITSDNS — run diagnostics (it is always DNS)' },
];

export const CHEAT_MAX_CODE = 9; // 'WIRESHARK'.length

/** Rolling typed-letter buffer; suffix-matches CHEATS codes. */
export class CheatBuffer {
  private buf = '';
  /** Feed a KeyboardEvent.key; returns the matched cheat id or null. */
  push(key: string): string | null {
    if (key.length !== 1 || !/[a-z0-9]/i.test(key)) {
      this.buf = '';
      return null;
    }
    this.buf = (this.buf + key.toUpperCase()).slice(-CHEAT_MAX_CODE);
    const hit = CHEATS.find((c) => this.buf.endsWith(c.code));
    if (!hit) return null;
    this.buf = '';
    return hit.id;
  }
  /** True while the buffer is a strict prefix of a code, deep enough that
   * swallowing the key is safe: the first letter is left alone so 'w'/'s'
   * still move, but a live prefix eats hotkeys like L/M/E mid-code. */
  hot(): boolean {
    return this.buf.length > 1 && CHEATS.some((c) => c.code.startsWith(this.buf));
  }
}

/** Up up down down left right left right B A, on the title screen. */
export const KONAMI = [
  'arrowup', 'arrowup', 'arrowdown', 'arrowdown',
  'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a',
];

export class KonamiBuffer {
  private i = 0;
  /** Feed a lowercased KeyboardEvent.key; true once on the completed combo. */
  push(key: string): boolean {
    const k = key.toLowerCase();
    this.i = k === KONAMI[this.i] ? this.i + 1 : (k === KONAMI[0] ? 1 : 0);
    if (this.i === KONAMI.length) {
      this.i = 0;
      return true;
    }
    return false;
  }
}
