// 소리: 파일 없이 Web Audio로 합성한다. 효과음(MG.sfx)과 배경음(MG.music), 음량 설정.
(() => {
const KEY = 'margrave_audio';
let cfg = { sfx: 0.6, music: 0.35, mute: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 기본값 */ }
const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 무시 */ } };

let ctx = null, sfxGain = null, musicGain = null, noiseBuf = null;
// 브라우저는 사용자가 한 번 누르거나 키를 쳐야 소리를 낼 수 있다
function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  sfxGain = ctx.createGain(); musicGain = ctx.createGain();
  sfxGain.connect(ctx.destination); musicGain.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolume();
  if (wantMusic) startMusic(wantMusic);
  return true;
}
window.addEventListener('pointerdown', ensure);
window.addEventListener('keydown', ensure);
function applyVolume() {
  if (!ctx) return;
  sfxGain.gain.value = cfg.mute ? 0 : cfg.sfx;
  musicGain.gain.value = cfg.mute ? 0 : cfg.music * 0.5;
}

// ---------- 소리 재료 ----------
function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, out = sfxGain, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, at = 0, freq = 1000, q = 1, type = 'bandpass', slide = 0, out = sfxGain } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

// 효과음. 같은 소리가 너무 자주 겹치지 않게 최소 간격을 둔다
const SFX = {
  hit:    { gap: 0.07, play: () => { noise(0.07, { vol: 0.25, freq: 2400 + Math.random() * 800, q: 4 }); tone(900 + Math.random() * 300, 0.05, { type: 'square', vol: 0.05 }); } },
  arrow:  { gap: 0.09, play: () => noise(0.12, { vol: 0.12, freq: 5000, q: 2, slide: 0.4 }) },
  boom:   { gap: 0.12, play: () => { noise(0.5, { vol: 0.55, freq: 400, type: 'lowpass', slide: 0.2 }); tone(90, 0.4, { type: 'sine', vol: 0.4, slide: 0.4 }); } },
  wall:   { gap: 0.3, play: () => { noise(1.1, { vol: 0.6, freq: 260, type: 'lowpass', slide: 0.3 }); tone(55, 0.9, { type: 'triangle', vol: 0.35, slide: 0.6 }); } },
  horn:   { gap: 1, play: () => { for (const [f, a] of [[196, 0], [196, 0.35], [262, 0.7]]) tone(f, 0.5, { type: 'sawtooth', vol: 0.12, at: a, attack: 0.05 }); } },
  shout:  { gap: 1, play: () => { for (const f of [110, 139, 165]) tone(f, 0.7, { type: 'sawtooth', vol: 0.1, slide: 1.3, attack: 0.03 }); noise(0.6, { vol: 0.15, freq: 700, q: 1 }); } },
  breath: { gap: 1, play: () => { noise(1.0, { vol: 0.5, freq: 900, q: 0.7, slide: 0.35 }); tone(70, 0.9, { type: 'sawtooth', vol: 0.15, slide: 0.7 }); } },
  skill:  { gap: 0.15, play: () => { tone(660, 0.18, { vol: 0.15 }); tone(990, 0.25, { vol: 0.12, at: 0.06 }); } },
  heal:   { gap: 0.3, play: () => { for (const [f, a] of [[523, 0], [659, 0.08], [784, 0.16]]) tone(f, 0.35, { vol: 0.1, at: a }); } },
  item:   { gap: 0.15, play: () => { tone(440, 0.12, { type: 'triangle', vol: 0.18 }); tone(587, 0.15, { type: 'triangle', vol: 0.15, at: 0.07 }); } },
  win:    { gap: 2, play: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.2, at: i * 0.15 })); tone(784, 1.2, { type: 'triangle', vol: 0.15, at: 0.6 }); } },
  lose:   { gap: 2, play: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.18, at: i * 0.25 })); } },
  click:  { gap: 0.04, play: () => tone(1200, 0.03, { type: 'square', vol: 0.04 }) },
  coin:   { gap: 0.1, play: () => { tone(1320, 0.08, { type: 'square', vol: 0.06 }); tone(1760, 0.12, { type: 'square', vol: 0.05, at: 0.06 }); } },
};
const last = {};
MG.sfx = name => {
  if (!ctx || cfg.mute || !cfg.sfx) return;
  const S = SFX[name], now = ctx.currentTime;
  if (!S || now - (last[name] || -1) < S.gap) return;
  last[name] = now;
  S.play();
};

// ---------- 배경음 ----------
// 전투: 북 장단과 낮은 울림. 내정: 느리게 바뀌는 잔잔한 화음.
let wantMusic = null, timer = null, step = 0, nextT = 0;
const CHORDS = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
function startMusic(kind) {
  stopMusic();
  if (!ctx) return;
  step = 0; nextT = ctx.currentTime + 0.1;
  timer = setInterval(() => {
    while (nextT < ctx.currentTime + 0.3) {
      if (kind === 'battle') {
        const beat = step % 8, t = nextT - ctx.currentTime;
        if (beat === 0 || beat === 3 || beat === 4) tone(60, 0.35, { vol: 0.5, at: t, slide: 0.5, out: musicGain });
        if (beat === 2 || beat === 6) noise(0.15, { vol: 0.25, at: t, freq: 300, q: 2, out: musicGain });
        if (beat === 7) tone(110, 0.2, { vol: 0.25, at: t, slide: 0.7, out: musicGain });
        if (step % 32 === 0) tone(55, 3.6, { type: 'sawtooth', vol: 0.05, at: t, attack: 0.8, out: musicGain });
        nextT += 0.3;
      } else {
        const t = nextT - ctx.currentTime, ch = CHORDS[step % CHORDS.length];
        for (const f of ch) tone(f, 4.2, { vol: 0.06, at: t, attack: 1.2, out: musicGain });
        tone(ch[0] / 2, 4.2, { type: 'triangle', vol: 0.05, at: t, attack: 1.2, out: musicGain });
        if (step % 2) tone(ch[2] * 2, 0.8, { vol: 0.03, at: t + 2, out: musicGain });
        nextT += 4;
      }
      step++;
    }
  }, 100);
}
function stopMusic() { if (timer) clearInterval(timer); timer = null; }
MG.music = kind => {
  if (wantMusic === kind) return;
  wantMusic = kind;
  if (ctx) { if (kind) startMusic(kind); else stopMusic(); }
};

// ---------- 음량 설정 (화면 왼쪽 아래 버튼) ----------
const box = document.createElement('div');
box.id = 'audioCtl';
document.body.appendChild(box);
let open = false;
function drawCtl() {
  box.innerHTML = `<button id="audioBtn" title="소리 설정">${cfg.mute ? '🔇' : '🔊'}</button>
    ${open ? `<div class="audioPanel">
      <label>효과음 <input type="range" min="0" max="1" step="0.05" value="${cfg.sfx}" id="sfxVol"></label>
      <label>배경음 <input type="range" min="0" max="1" step="0.05" value="${cfg.music}" id="musicVol"></label>
      <label class="tog"><input type="checkbox" id="muteChk" ${cfg.mute ? 'checked' : ''}> 소리 끄기</label></div>` : ''}`;
  box.querySelector('#audioBtn').onclick = () => { ensure(); open = !open; drawCtl(); };
  if (!open) return;
  box.querySelector('#sfxVol').oninput = ev => { cfg.sfx = +ev.target.value; applyVolume(); saveCfg(); };
  box.querySelector('#sfxVol').onchange = () => MG.sfx('hit');
  box.querySelector('#musicVol').oninput = ev => { cfg.music = +ev.target.value; applyVolume(); saveCfg(); };
  box.querySelector('#muteChk').onchange = ev => { cfg.mute = ev.target.checked; applyVolume(); saveCfg(); drawCtl(); };
}
drawCtl();
// 내정 화면의 버튼 소리
document.addEventListener('click', ev => { if (ev.target.closest('#camp button, #side button, #result button')) MG.sfx('click'); });
})();
