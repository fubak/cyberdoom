import type { Gender } from '../core/types';
import { ANALYSTS, SKIN_TONES, currentSkin, setSkin, skinTriple } from '../tools/look';
import { Face, FACE_SIZE, drawPortrait } from '../tools/portrait';
import { playTool, playVoice } from '../tools/sfx';
import { usbTool } from '../tools/usb';
import { drawToolViewmodel } from '../render/viewmodels';

/**
 * ARSENAL: character select. Two analysts with distinct procedural portraits,
 * bios, voices and viewmodel hands. A shared skin-tone picker is independent
 * of gender. Keyboard: ←/→ choose, 1-5 skin tone, Enter deploy.
 */

const CSS = `
.cs-wrap{display:flex;gap:20px;justify-content:center;flex-wrap:nowrap;margin-top:4px}
.cs-card{width:232px;padding:10px;background:#0d1018;border:3px solid #2a2f40;cursor:pointer;text-align:left;transition:transform .08s}
.cs-card.sel{border-color:#ffb000;transform:translateY(-4px);box-shadow:0 0 0 2px #000,0 0 24px rgba(255,176,0,.35)}
.cs-card canvas{image-rendering:pixelated;display:block}
.cs-card .cs-face{width:112px;height:112px;margin:0 auto 6px;border:2px solid #000}
.cs-card .cs-hands{width:208px;height:143px;image-rendering:pixelated;border:2px solid #000;background:#0a0c12;margin-top:8px}
.cs-name{color:#fff;font-size:20px;letter-spacing:2px}
.cs-call{color:#ffb000;font-size:12px}
.cs-bio{color:#9aa;font-size:12px;margin-top:4px;min-height:0;line-height:1.3}
.cs-skins{display:flex;gap:8px;justify-content:center;margin:8px 0 4px}
.cs-skin{width:26px;height:26px;border:3px solid #000;cursor:pointer}
.cs-skin.sel{border-color:#fff}
.cs-hint{color:#666;font-size:11px;margin-top:3px}
`;

function ensureCss(): void {
  if (document.getElementById('cs-css')) return;
  const s = document.createElement('style');
  s.id = 'cs-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function characterSelect(onPick: (g: Gender) => void): HTMLElement {
  ensureCss();
  const s = document.createElement('div');
  s.className = 'screen';
  s.innerHTML = '<h2>SELECT YOUR ANALYST</h2>';
  const wrap = document.createElement('div');
  wrap.className = 'cs-wrap';
  s.appendChild(wrap);

  let sel: Gender = 'male';
  const faces: Record<Gender, Face> = { male: new Face(), female: new Face() };
  const cards: Partial<Record<Gender, { el: HTMLElement; face: HTMLCanvasElement; hands: HTMLCanvasElement }>> = {};

  const render = () => {
    for (const gd of ['male', 'female'] as Gender[]) {
      const c = cards[gd]!;
      c.el.classList.toggle('sel', gd === sel);
      const fg = c.face.getContext('2d')!;
      drawPortrait(fg, 0, 0, gd, faces[gd].state(100), 1);
      const hg = c.hands.getContext('2d')!;
      hg.clearRect(0, 0, 160, 110);
      hg.save();
      hg.translate(-100, -60);
      drawToolViewmodel(hg, usbTool, 320, 168, 0, gd, 0, performance.now() / 1000, {
        sinceUse: 9, sinceConfirm: 9, confirmGood: true, time: performance.now() / 1000,
        ammo: 8, skin: skinTriple(),
      });
      hg.restore();
    }
    skins.querySelectorAll('.cs-skin').forEach((n) => n.classList.toggle('sel', (n as HTMLElement).dataset.id === currentSkin().id));
  };

  const choose = (gd: Gender) => {
    if (gd !== sel) {
      sel = gd;
      playTool('menu-move');
      playVoice(gd, 'ready');
      faces[gd].grin();
    }
    render();
  };
  const deploy = () => {
    cleanup();
    playTool('menu-pick');
    onPick(sel);
  };

  for (const gd of ['male', 'female'] as Gender[]) {
    const a = ANALYSTS[gd];
    const el = document.createElement('div');
    el.className = 'cs-card';
    const face = document.createElement('canvas');
    face.width = FACE_SIZE;
    face.height = FACE_SIZE;
    face.className = 'cs-face';
    const hands = document.createElement('canvas');
    hands.width = 160;
    hands.height = 110;
    hands.className = 'cs-hands';
    const info = document.createElement('div');
    info.innerHTML = `<div class="cs-name">${a.name}</div><div class="cs-call">CALLSIGN ${a.callsign} · SOC ANALYST</div><div class="cs-bio">${a.bio}</div>`;
    el.append(face, info, hands);
    el.addEventListener('mouseenter', () => choose(gd));
    el.addEventListener('click', () => {
      if (sel === gd) deploy();
      else choose(gd);
    });
    cards[gd] = { el, face, hands };
    wrap.appendChild(el);
  }

  const skins = document.createElement('div');
  skins.className = 'cs-skins';
  SKIN_TONES.forEach((t, i) => {
    const b = document.createElement('div');
    b.className = 'cs-skin';
    b.dataset.id = t.id;
    b.title = `Skin tone ${i + 1}`;
    b.style.background = t.base;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setSkin(t.id);
      playTool('menu-move');
      render();
    });
    skins.appendChild(b);
  });
  const skinLbl = document.createElement('div');
  skinLbl.className = 'cs-hint';
  skinLbl.textContent = 'SKIN TONE (independent of analyst)';
  s.append(skins, skinLbl);

  const go = document.createElement('button');
  go.className = 'btn';
  go.textContent = 'DEPLOY';
  go.addEventListener('click', deploy);
  s.appendChild(go);
  const hint = document.createElement('div');
  hint.className = 'cs-hint';
  hint.textContent = '←/→ choose · 1-5 skin tone · ENTER deploy';
  s.appendChild(hint);

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') choose('male');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') choose('female');
    else if (e.code === 'Enter') deploy();
    else if (/^Digit[1-5]$/.test(e.code)) {
      const t = SKIN_TONES[Number(e.code[5]) - 1];
      if (t) {
        setSkin(t.id);
        playTool('menu-move');
        render();
      }
    }
  };
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
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
