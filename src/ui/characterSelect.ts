import type { Gender } from '../core/types';
import { ANALYSTS, SKIN_TONES, currentSkin, setSkin, skinTriple } from '../tools/look';
import { Face, drawPortrait } from '../tools/portrait';
import { playTool, playVoice } from '../tools/sfx';
import { usbTool } from '../tools/usb';
import { drawBigText, drawChunky, drawText, measureBig, measureChunky, measureText, wrapText } from '../render/font';
import { drawSkull } from '../render/title';
import { drawToolViewmodel } from '../render/viewmodels';
import { BASE_H, BASE_W, RES, VIEW_H, VIEW_W } from '../render/res';

/**
 * ARSENAL: character select. Two analysts with distinct procedural portraits,
 * bios, voices and viewmodel hands. A shared skin-tone picker is independent
 * of gender. Keyboard: ←/→ choose, 1-5 skin tone, Enter deploy.
 *
 * LOOK: presented on a 1280x800 canvas with a 320x200 base layout.
 * Every clickable region is also a transparent <button data-menu-item> laid
 * over it (analyst-male, analyst-female, skin-1..5, deploy).
 */
const W = BASE_W;
const H = BASE_H;
const CARD_W = 146;
const CARD_H = 124;
const CARD_Y = 26;
const CARD_X: Record<Gender, number> = { male: 10, female: 164 };
const SKIN_Y = 156;
const SKIN_X = 118;
const DEPLOY: [number, number, number, number] = [116, 174, 88, 15];
const AMBER = ['#fff0a0', '#ffd040', '#ffa818', '#d07808', '#8a4804'];

function paintBackdrop(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const image = g.createImageData(VIEW_W, VIEW_H);
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const k = y / VIEW_H;
      const v = Math.floor(r() * 10) - (r() < 0.03 ? 10 : 0);
      const i = (y * VIEW_W + x) * 4;
      image.data[i] = Math.max(0, 26 + k * 18 + v);
      image.data[i + 1] = Math.max(0, 12 + k * 6 + v);
      image.data[i + 2] = Math.max(0, 12 + v);
      image.data[i + 3] = 255;
    }
  }
  // riveted steel header band
  for (let y = 0; y < 22 * RES; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const v = 70 + Math.floor(r() * 14);
      const i = (y * VIEW_W + x) * 4;
      image.data[i] = v + 4;
      image.data[i + 1] = v;
      image.data[i + 2] = v - 8;
    }
  }
  for (let x = 0; x < VIEW_W; x++) {
    let i = x * 4;
    image.data[i] = 0xc8; image.data[i + 1] = 0xc0; image.data[i + 2] = 0xb0;
    i = ((21 * RES) * VIEW_W + x) * 4;
    image.data[i] = 0x2a; image.data[i + 1] = 0x27; image.data[i + 2] = 0x22;
  }
  for (let x = 4 * RES; x < VIEW_W; x += 24 * RES) {
    for (const y of [3, 17]) {
      const i = ((y * RES) * VIEW_W + x) * 4;
      image.data[i] = 0xf0; image.data[i + 1] = 0xe8; image.data[i + 2] = 0xd8;
    }
  }
  g.putImageData(image, 0, 0);
  return c;
}

function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean, glow: boolean): void {
  const u = 1 / RES;
  g.fillStyle = '#000';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = lit ? (glow ? '#ffd040' : '#c08010') : '#3a3e48';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#0c0e14';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#1a1e28';
  for (let yy = y + 1; yy < y + h; yy += 2) g.fillRect(x, yy, w, 1);
  g.fillStyle = lit && glow ? '#fff0a0' : '#9aa0b0';
  g.fillRect(x + u, y + u, w - 2 * u, u);
  g.fillRect(x + u, y + u, u, h - 2 * u);
  g.fillStyle = '#05060a';
  g.fillRect(x + u, y + h - 2 * u, w - 2 * u, 2 * u);
  for (const sx of [x + 2, x + w - 4]) {
    g.fillStyle = '#101218';
    g.fillRect(sx - u, y + 2 - u, 3 * u, 3 * u);
    g.fillStyle = '#d8dce4';
    g.fillRect(sx, y + 2, u, u);
  }
}

export function characterSelect(onPick: (g: Gender) => void, onBack?: () => void): HTMLElement {
  const s = document.createElement('div');
  s.className = 'screen title';
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  c.className = 'title-px';
  s.appendChild(c);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const back = paintBackdrop();
  const hands: Record<Gender, HTMLCanvasElement> = { male: document.createElement('canvas'), female: document.createElement('canvas') };
  for (const h of Object.values(hands)) {
    h.width = 160 * RES;
    h.height = 110 * RES;
    const hg = h.getContext('2d')!;
    hg.imageSmoothingEnabled = false;
    hg.setTransform(RES, 0, 0, RES, 0, 0);
  }

  let sel: Gender = 'male';
  const faces: Record<Gender, Face> = { male: new Face(), female: new Face() };
  let t = 0;

  const render = () => {
    const pulse = Math.floor(t * 4) % 2 === 0;
    g.drawImage(back, 0, 0, W, H);
    const title = 'SELECT YOUR ANALYST';
    drawBigText(g, title, Math.round((W - measureBig(title, true)) / 2), 4, AMBER, '#200800', true);
    for (const gd of ['male', 'female'] as Gender[]) {
      const a = ANALYSTS[gd];
      const x = CARD_X[gd];
      const y = CARD_Y - (gd === sel ? 2 : 0);
      frame(g, x, y, CARD_W, CARD_H, gd === sel, pulse);
      // portrait, 2x, in a recessed well
      g.fillStyle = '#000';
      g.fillRect(x + 4, y + 4, 52, 52);
      drawPortrait(g, x + 6, y + 6, gd, faces[gd].state(100), 2);
      const name = a.name.toUpperCase();
      if (measureChunky(name) <= CARD_W - 64) drawChunky(g, name, x + 62, y + 7, gd === sel ? ['#ffffff', '#f0ece4', '#c8c0b0'] : '#9aa0b0');
      else drawText(g, name, x + 62, y + 7, '#f0ece4', 'small');
      drawText(g, `CALLSIGN ${a.callsign}`.toUpperCase(), x + 62, y + 19, '#ffb000', 'tiny');
      drawText(g, 'SOC ANALYST', x + 62, y + 27, '#8a90a0', 'tiny');
      wrapText(a.bio.toUpperCase(), 20, 3).forEach((line, i) => drawText(g, line, x + 62, y + 37 + i * 7, '#b8bcc8', 'tiny'));
      // viewmodel hands (shows the chosen skin tone)
      const hg = hands[gd].getContext('2d')!;
      hg.clearRect(0, 0, 160, 110);
      hg.save();
      hg.setTransform(RES, 0, 0, RES, 0, 0);
      hg.imageSmoothingEnabled = false;
      hg.translate(-100, -60);
      drawToolViewmodel(hg, usbTool, W, 168, 0, gd, 0, t, {
        sinceUse: 9, sinceConfirm: 9, confirmGood: true, time: t, ammo: 8, skin: skinTriple(),
      });
      hg.restore();
      g.fillStyle = '#05060a';
      g.fillRect(x + 4, y + 60, CARD_W - 8, CARD_H - 64);
      g.drawImage(hands[gd], 0, 0, 160 * RES, 110 * RES, x + 4, y + 60, CARD_W - 8, CARD_H - 64);
      if (gd === sel) drawSkull(g, x + CARD_W - 16, y + 62, pulse);
    }
    // skin tones
    drawChunky(g, 'SKIN TONE', SKIN_X - 6 - measureChunky('SKIN TONE'), SKIN_Y + 2, '#c8c0b0');
    SKIN_TONES.forEach((tone, i) => {
      const x = SKIN_X + i * 18;
      const on = tone.id === currentSkin().id;
      const u = 1 / RES;
      g.fillStyle = '#000';
      g.fillRect(x - 2, SKIN_Y - 2, 16, 14);
      g.fillStyle = on ? '#ffffff' : '#3a3e48';
      g.fillRect(x - 1, SKIN_Y - 1, 14, 12);
      g.fillStyle = tone.base;
      g.fillRect(x, SKIN_Y, 12, 10);
      g.fillStyle = tone.highlight;
      g.fillRect(x, SKIN_Y, 12, 2);
      g.fillStyle = tone.shadow;
      g.fillRect(x, SKIN_Y + 8, 12, 2);
      g.fillStyle = '#fff0c8';
      g.fillRect(x + u, SKIN_Y + u, 12 - 2 * u, u);
      g.fillStyle = '#5a3020';
      g.fillRect(x + u, SKIN_Y + 10 - 2 * u, 12 - 2 * u, u);
      drawText(g, `${i + 1}`, x + 5, SKIN_Y + 3, on ? '#ffffff' : '#d8dce4', 'tiny', '#000');
    });
    // deploy
    const [dx, dy, dw, dh] = DEPLOY;
    g.fillStyle = '#000';
    g.fillRect(dx - 1, dy - 1, dw + 2, dh + 2);
    g.fillStyle = pulse ? '#c02010' : '#a01808';
    g.fillRect(dx, dy, dw, dh);
    g.fillStyle = '#ff6a40';
    g.fillRect(dx + 1 / RES, dy + 1 / RES, dw - 2 / RES, 1 / RES);
    g.fillStyle = '#500804';
    g.fillRect(dx + 1 / RES, dy + dh - 2 / RES, dw - 2 / RES, 1 / RES);
    drawChunky(g, 'DEPLOY', dx + Math.round((dw - measureChunky('DEPLOY')) / 2), dy + 4, ['#ffffff', '#fff0a0', '#ffd040']);
    const hint = onBack
      ? 'ESC BACK  -  < > CHOOSE  -  1-5 SKIN  -  ENTER DEPLOY'
      : '< > CHOOSE  -  1-5 SKIN TONE  -  ENTER DEPLOY';
    drawText(g, hint, Math.round((W - measureText(hint, 'tiny')) / 2), H - 7, '#8a90a0', 'tiny');
  };

  const choose = (gd: Gender) => {
    if (gd !== sel) {
      sel = gd;
      playTool('menu-move');
      playVoice(gd, 'ready');
      faces[gd].grin();
    }
  };
  const pickSkin = (id: string) => {
    setSkin(id);
    playTool('menu-move');
  };
  const deploy = () => {
    cleanup();
    playTool('menu-pick');
    onPick(sel);
  };

  // transparent buttons over every clickable region: mouse + automation hooks
  const hook = (id: string, label: string, x: number, y: number, w: number, h: number, onClick: () => void, onDouble?: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.menuItem = id;
    b.textContent = label;
    b.setAttribute('aria-label', label);
    Object.assign(b.style, {
      position: 'absolute',
      left: `${(x / W) * 100}%`,
      top: `${(y / H) * 100}%`,
      width: `${(w / W) * 100}%`,
      height: `${(h / H) * 100}%`,
      opacity: '0',
      border: '0',
      padding: '0',
      margin: '0',
      background: 'transparent',
      cursor: 'pointer',
      zIndex: '2',
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    if (onDouble) b.addEventListener('dblclick', onDouble);
    s.appendChild(b);
  };
  for (const gd of ['male', 'female'] as Gender[]) {
    // click selects; double-click (or DEPLOY / Enter) deploys
    hook(`analyst-${gd}`, ANALYSTS[gd].name, CARD_X[gd] - 2, CARD_Y - 4, CARD_W + 4, CARD_H + 6, () => choose(gd), deploy);
  }
  SKIN_TONES.forEach((tone, i) => hook(`skin-${i + 1}`, `Skin tone ${i + 1}`, SKIN_X + i * 18 - 2, SKIN_Y - 2, 16, 14, () => pickSkin(tone.id)));
  hook('deploy', 'Deploy', ...DEPLOY, deploy);
  if (onBack) {
    hook('back', 'Back to title', 4, H - 14, 52, 10, () => {
      cleanup();
      playTool('menu-back');
      onBack();
    });
  }

  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'Escape' || e.key === 'Backspace') && onBack) {
      cleanup();
      playTool('menu-back');
      onBack();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') choose('male');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') choose('female');
    else if (e.code === 'Enter') deploy();
    else if (/^Digit[1-5]$/.test(e.code)) {
      const tone = SKIN_TONES[Number(e.code[5]) - 1];
      if (tone) pickSkin(tone.id);
    }
  };
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    t += dt;
    faces.male.tick(dt);
    faces.female.tick(dt);
    render();
    raf = requestAnimationFrame(loop);
  };
  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(loop);
  // stop the loop if main swaps the screen out
  new MutationObserver((_, obs) => {
    if (!s.isConnected && s.dataset.mounted) {
      cleanup();
      obs.disconnect();
    }
    if (s.isConnected) s.dataset.mounted = '1';
  }).observe(document.body, { childList: true, subtree: true });
  render();
  return s;
}
