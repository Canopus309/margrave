// 캔버스 그리기와 카메라(이동·확대)
(() => {
const C = MG.CASTLE, W = MG.WORLD;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
MG.canvas = cv;

// ---------- 카메라 ----------
const view = MG.view = { x: C.x, y: C.y, zoom: 1, dpr: 1, w: 1, h: 1, init: false };
const minZoom = () => Math.max(view.w / W.w, view.h / W.h);
MG.clampView = () => {
  view.zoom = Math.max(minZoom(), Math.min(3, view.zoom));
  const hw = view.w / 2 / view.zoom, hh = view.h / 2 / view.zoom;
  view.x = Math.max(hw, Math.min(W.w - hw, view.x));
  view.y = Math.max(hh, Math.min(W.h - hh, view.y));
};
MG.screenToWorld = (sx, sy) => ({ x: (sx - view.w / 2) / view.zoom + view.x, y: (sy - view.h / 2) / view.zoom + view.y });
MG.worldToScreen = p => ({ x: (p.x - view.x) * view.zoom + view.w / 2, y: (p.y - view.y) * view.zoom + view.h / 2 });
MG.resetView = () => {
  if (MG.B && MG.B.conquest) {
    // 정벌 전투: 들판 전체가 보이게
    view.x = W.w / 2; view.y = W.h / 2; view.zoom = 0;
    MG.clampView();
    return;
  }
  view.x = C.x; view.y = C.y;
  view.zoom = Math.min(view.w, view.h) / ((C.R + 150) * 2);
  MG.clampView();
};
function resize() {
  const r = document.getElementById('stage').getBoundingClientRect();
  view.dpr = window.devicePixelRatio || 1;
  view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
  cv.width = Math.round(view.w * view.dpr); cv.height = Math.round(view.h * view.dpr);
  if (!view.init) { view.init = true; MG.resetView(); }
  MG.clampView();
}
window.addEventListener('resize', resize);
resize();

// 배경은 한 번만 그려 둔다
const bg = document.createElement('canvas');
bg.width = W.w; bg.height = W.h;
(() => {
  const g = bg.getContext('2d');
  g.fillStyle = '#3d5e39'; g.fillRect(0, 0, W.w, W.h);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    g.beginPath(); g.arc(rnd() * W.w, rnd() * W.h, 6 + rnd() * 30, 0, Math.PI * 2); g.fill();
  }
  const pad = C.R + 60;
  g.fillStyle = '#6b5b43'; g.fillRect(C.x - pad, C.y - pad, pad * 2, pad * 2);
  g.fillStyle = '#7d6c51'; g.fillRect(C.x - C.R + C.T, C.y - C.R + C.T, (C.R - C.T) * 2, (C.R - C.T) * 2);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(C.x - pad + rnd() * pad * 2, C.y - pad + rnd() * pad * 2, 3, 3);
  }
  // 성 안 십자 큰길과 성벽 안길
  const inner = C.R - C.T, road = MG.GRID.cell;
  g.fillStyle = '#93805f';
  g.fillRect(C.x - road, C.y - inner, road * 2, inner * 2);
  g.fillRect(C.x - inner, C.y - road, inner * 2, road * 2);
  const ring = MG.GRID.half - road / 2;  // 가장자리 한 줄 칸의 가운데
  g.strokeStyle = '#93805f'; g.lineWidth = road;
  g.strokeRect(C.x - ring, C.y - ring, ring * 2, ring * 2);
})();

// 정벌 전투의 배경: 지형(숲·바위·물)은 움직이지 않으니 전투마다 한 번 그려 둔다
const BIOME_BG = { forest: '#34502f', plain: '#55703c', swamp: '#3d4d3c', stone: '#4a4848' };
MG.makeConquestBg = B => {
  const c = document.createElement('canvas');
  c.width = W.w; c.height = W.h;
  const g = c.getContext('2d'), biome = B.outpost.biome;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = BIOME_BG[biome]; g.fillRect(0, 0, W.w, W.h);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : biome === 'swamp' ? 'rgba(120,160,140,0.05)' : 'rgba(255,255,255,0.04)';
    g.beginPath(); g.arc(rnd() * W.w, rnd() * W.h, 6 + rnd() * 30, 0, Math.PI * 2); g.fill();
  }
  // 아군 출발 지역과 적 진지 바닥
  g.fillStyle = 'rgba(230,200,120,0.08)'; g.fillRect(0, 0, 330, W.h);
  const cp = B.camp;
  g.fillStyle = '#6b5638'; g.globalAlpha = 0.7;
  g.fillRect(cp.x - cp.r - 30, cp.y - cp.r - 30, (cp.r + 30) * 2, (cp.r + 30) * 2); g.globalAlpha = 1;
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(cp.x - cp.r - 30 + rnd() * (cp.r + 30) * 2, cp.y - cp.r - 30 + rnd() * (cp.r + 30) * 2, 3, 3); }
  for (const b of B.blocks) {
    if (b.struct) continue;
    const x = b.x0, y = b.y0, cx = x + 10, cy = y + 10, r = b.seed;
    if (b.kind === 'water') {
      g.fillStyle = '#2f5a6e'; g.fillRect(x - 1, y - 1, 22, 22);
      g.fillStyle = 'rgba(160,210,230,0.15)'; g.fillRect(x + 3 + r * 8, y + 4, 6, 2);
    } else if (b.kind === 'rock') {
      g.fillStyle = '#6e6a62'; g.beginPath(); g.moveTo(cx - 10, cy + 6); g.lineTo(cx - 6, cy - 9); g.lineTo(cx + 7, cy - 8); g.lineTo(cx + 11, cy + 5); g.lineTo(cx + 2, cy + 10); g.closePath(); g.fill();
      g.strokeStyle = '#3e3a34'; g.lineWidth = 1; g.stroke();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx + 3, cy + 3, 11 + r * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = r < 0.5 ? '#244a22' : '#2d5a28'; g.beginPath(); g.arc(cx, cy, 11 + r * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.arc(cx - 3, cy - 3, 5, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
};

// 진지 구조물: 목책·망루·본진
function drawStructs(B) {
  for (const e of B.enemies) {
    if (!e.struct) continue;
    const x = e.x - e.w / 2, y = e.y - e.h / 2;
    ctx.fillStyle = e.hitT > 0 ? '#d8c8a8' : e.T.color;
    ctx.fillRect(x, y, e.w, e.h);
    ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, e.w, e.h);
    if (e.struct === 'palisade' || e.struct === 'stonewall') {
      // 목책은 말뚝 무늬, 돌벽은 돌 이음새
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      const horiz = e.w > e.h, gap = e.struct === 'palisade' ? 8 : 13;
      for (let i = 4; i < (horiz ? e.w : e.h); i += gap) horiz ? ctx.fillRect(x + i, y, 2, e.h) : ctx.fillRect(x, y + i, e.w, 2);
      if (e.struct === 'stonewall') { ctx.fillRect(horiz ? x : x + e.w / 2 - 1, horiz ? y + e.h / 2 - 1 : y, horiz ? e.w : 2, horiz ? 2 : e.h); }
    } else if (e.struct === 'tower') {
      ctx.fillStyle = '#4a321e'; ctx.fillRect(x + 8, y + 8, e.w - 16, e.h - 16);
    } else {
      ctx.fillStyle = '#8a2a1a'; ctx.beginPath(); ctx.moveTo(x + 6, y + e.h - 8); ctx.lineTo(e.x, y + 8); ctx.lineTo(x + e.w - 6, y + e.h - 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e04a3a'; ctx.fillRect(e.x - 1, y - 20, 2, 22);
      ctx.beginPath(); ctx.moveTo(e.x + 1, y - 20); ctx.lineTo(e.x + 16, y - 15); ctx.lineTo(e.x + 1, y - 10); ctx.fill();
    }
    if (e.hp < e.max) {
      const w = Math.max(24, e.w);
      ctx.fillStyle = '#300'; ctx.fillRect(e.x - w / 2, y - 6, w, 3);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(e.x - w / 2, y - 6, w * e.hp / e.max, 3);
    }
  }
}

// 성 밖 들판 시설 자리 (모서리마다 2곳)
MG.fieldPos = i => {
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]][i >> 1], near = C.R + 100, far = C.R + 200;
  const [a, b] = i % 2 ? [far, near] : [near, far];
  return { x: C.x + corner[0] * a, y: C.y + corner[1] * b };
};

const lerpColor = (a, b, t) => {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const hpColor = p => (p > 0.5 ? '#6bdc8f' : p > 0.25 ? '#e6b450' : '#ff6b6b');

function segRect(w) {
  const { x, y, R, T } = C, len = w.a1 - w.a0;
  if (w.side === 'N') return [x + w.a0, y - R, len, T];
  if (w.side === 'S') return [x + w.a0, y + R - T, len, T];
  if (w.side === 'W') return [x - R, y + w.a0, T, len];
  return [x + R - T, y + w.a0, T, len];
}

function drawWalls(B) {
  for (const w of B.walls) {
    const [x, y, ww, hh] = segRect(w), horiz = w.side === 'N' || w.side === 'S', p = w.hp / w.max;
    if (w.hp <= 0) {
      let seed = w.id.charCodeAt(0) * 31 + w.id.charCodeAt(1) * 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      ctx.fillStyle = w.gate ? '#4a3524' : '#5b5248';
      for (let i = 0; i < (w.gate ? 10 : 22); i++) ctx.fillRect(x + rnd() * ww - 3, y + rnd() * hh - 3, 4 + rnd() * 6, 4 + rnd() * 6);
      continue;
    }
    ctx.fillStyle = w.gate ? lerpColor('3a2614', '6b4826', p) : lerpColor('6d5848', 'a39d90', p);
    ctx.fillRect(x, y, ww, hh);
    ctx.strokeStyle = w.gate ? '#24160a' : '#3a332b'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, ww, hh);
    const n = MG.NORMAL[w.side];
    if (w.gate) {
      // 문짝 무늬
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        if (horiz) { ctx.moveTo(x + ww * i / 4, y); ctx.lineTo(x + ww * i / 4, y + hh); }
        else { ctx.moveTo(x, y + hh * i / 4); ctx.lineTo(x + ww, y + hh * i / 4); }
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 6; i < (horiz ? ww : hh) - 6; i += 12) {
        if (horiz) ctx.fillRect(x + i, n.y < 0 ? y : y + hh - 4, 6, 4);
        else ctx.fillRect(n.x < 0 ? x : x + ww - 4, y + i, 4, 6);
      }
    }
    if (w.hp < w.max) {
      const m = MG.segMid(w, C.R + 9), len = (w.a1 - w.a0) * 0.75;
      ctx.fillStyle = '#2a1414';
      if (horiz) ctx.fillRect(m.x - len / 2, m.y - 2, len, 4); else ctx.fillRect(m.x - 2, m.y - len / 2, 4, len);
      ctx.fillStyle = hpColor(p);
      if (horiz) ctx.fillRect(m.x - len / 2, m.y - 2, len * p, 4); else ctx.fillRect(m.x - 2, m.y - len / 2, 4, len * p);
    }
  }
  ctx.fillStyle = '#8b8478'; ctx.strokeStyle = '#3a332b'; ctx.lineWidth = 1.5;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const tx = C.x + sx * (C.R - C.T / 2), ty = C.y + sy * (C.R - C.T / 2);
    ctx.fillRect(tx - 20, ty - 20, 40, 40); ctx.strokeRect(tx - 20, ty - 20, 40, 40);
  }
}

function drawFields(B) {
  ctx.font = 'bold 12px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  B.fields.forEach((f, i) => {
    const d = MG.FIELDS[f.type], p = MG.fieldPos(i), w = 96, h = 64;
    ctx.fillStyle = d.color; ctx.globalAlpha = 0.55; ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(p.x - w / 2, p.y - h / 2 + h * k / 5); ctx.lineTo(p.x + w / 2, p.y - h / 2 + h * k / 5); ctx.stroke(); }
    ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    const label = `${d.name} ${f.level}`;
    ctx.strokeText(label, p.x, p.y); ctx.fillText(label, p.x, p.y);
  });
}

function drawBuildings(B) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of B.buildings) {
    const d = MG.BUILDINGS[b.type], w = b.x1 - b.x0, h = b.y1 - b.y0, m = 4;
    if (b.hp <= 0) {
      let seed = b.id * 97;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      ctx.fillStyle = '#5b5248';
      for (let i = 0; i < 8 * (w / 40) * (h / 40); i++) ctx.fillRect(b.x0 + rnd() * w - 3, b.y0 + rnd() * h - 3, 4 + rnd() * 6, 4 + rnd() * 6);
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(b.x0 + m + 3, b.y0 + m + 3, w - m * 2, h - m * 2);
    ctx.fillStyle = d.color; ctx.fillRect(b.x0 + m, b.y0 + m, w - m * 2, h - m * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x0 + m, b.y0 + m, w - m * 2, h - m * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(b.x0 + m, b.y0 + m, w - m * 2, (h - m * 2) * 0.35);
    ctx.font = `bold ${w > 40 ? 13 : 10}px "Malgun Gothic", sans-serif`;
    ctx.fillStyle = '#111'; ctx.fillText(d.name, b.x0 + w / 2, b.y0 + h / 2 + 1);
    if (b.level > 1) { ctx.font = 'bold 9px sans-serif'; ctx.fillText('★'.repeat(b.level - 1), b.x0 + w / 2, b.y0 + h / 2 + 12); }
    if (b.hp < b.max) {
      ctx.fillStyle = '#300'; ctx.fillRect(b.x0 + 6, b.y0 + 6, w - 12, 4);
      ctx.fillStyle = b.hp / b.max > 0.5 ? '#e6b450' : '#ff6b6b'; ctx.fillRect(b.x0 + 6, b.y0 + 6, (w - 12) * b.hp / b.max, 4);
    }
  }
}

// 직할 수비대는 멀쩡한 성벽 조각에 고르게 나눠 그린다
function drawGarrison(B) {
  for (const s of MG.SIDES) {
    const g = B.garrison[s], live = B.wallBySide[s].filter(w => !w.gate && w.hp > 0);
    if (!live.length) continue;
    const rows = [[g.archer, MG.UNIT_TYPES.archer.color, C.R - C.T * 0.3], [g.infantry, MG.UNIT_TYPES.infantry.color, C.R - C.T * 0.72]];
    for (const [count, color, depth] of rows) {
      ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const w = live[i % live.length], k = Math.floor(i / live.length), per = Math.ceil(count / live.length);
        const a = w.a0 + (w.a1 - w.a0) * (k + 0.5) / per;
        const p = MG.wallPoint(s, depth, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawKeep(B) {
  const r = C.keepR;
  ctx.fillStyle = '#8f887b'; ctx.strokeStyle = '#3a332b'; ctx.lineWidth = 2;
  ctx.fillRect(C.x - r, C.y - r, r * 2, r * 2); ctx.strokeRect(C.x - r, C.y - r, r * 2, r * 2);
  ctx.fillStyle = '#7a3b2e'; ctx.beginPath(); ctx.arc(C.x, C.y, r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e6b450'; ctx.fillRect(C.x - 1, C.y - r * 0.62 - 18, 2, 18);
  ctx.beginPath(); ctx.moveTo(C.x + 1, C.y - r * 0.62 - 18); ctx.lineTo(C.x + 14, C.y - r * 0.62 - 13); ctx.lineTo(C.x + 1, C.y - r * 0.62 - 8); ctx.fill();
  const k = B.keep;
  ctx.fillStyle = '#2a1414'; ctx.fillRect(C.x - 50, C.y + r + 8, 100, 6);
  ctx.fillStyle = hpColor(k.hp / k.max); ctx.fillRect(C.x - 50, C.y + r + 8, 100 * k.hp / k.max, 6);
}

function drawSoldiers(B) {
  for (const sq of B.squads) {
    const sel = B.selected.has(sq);
    for (const s of sq.soldiers) {
      const r = (s.isLord ? 6 : s.isGeneral ? 5 : 3.4) * (s.type === 'cavalry' ? 1.3 : 1);
      if (sel) { ctx.fillStyle = 'rgba(107,220,143,0.45)'; ctx.beginPath(); ctx.arc(s.x, s.y, r + 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = s.T.color;
      ctx.beginPath();
      // 모양으로 병종 구분: 기병은 타원, 포병은 네모, 공병은 마름모
      if (s.type === 'cavalry') ctx.ellipse(s.x, s.y, r + 1.5, r - 0.5, 0, 0, Math.PI * 2);
      else if (s.type === 'artillery') ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      else if (s.type === 'engineer') { ctx.moveTo(s.x, s.y - r - 1); ctx.lineTo(s.x + r + 1, s.y); ctx.lineTo(s.x, s.y + r + 1); ctx.lineTo(s.x - r - 1, s.y); ctx.closePath(); }
      else ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = s.isGeneral || s.isLord ? 2 : 1;
      ctx.strokeStyle = s.isLord ? '#ffdf6b' : s.isGeneral ? '#e6b450' : '#1d2a4a';
      ctx.stroke();
      if (s.hp < s.max && (s.isGeneral || s.isLord)) {
        ctx.fillStyle = '#300'; ctx.fillRect(s.x - 7, s.y - r - 5, 14, 2.5);
        ctx.fillStyle = '#6bdc8f'; ctx.fillRect(s.x - 7, s.y - r - 5, 14 * s.hp / s.max, 2.5);
      }
    }
    if (sel && sq.focus && !sq.focus.dead) {
      ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sq.focus.x, sq.focus.y, sq.focus.r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (sel && sq.anchor) {
      const c = MG.centroid(sq);
      if (Math.hypot(sq.anchor.x - c.x, sq.anchor.y - c.y) > 20) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(107,220,143,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(sq.anchor.x, sq.anchor.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
}

// 깃발은 화면 좌표로 그려서 확대·축소해도 글자 크기가 그대로다
function drawFlags(B) {
  ctx.font = 'bold 12px "Malgun Gothic", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const sq of B.squads) {
    const c = MG.worldToScreen(MG.centroid(sq)), sel = B.selected.has(sq);
    const label = `${sq.name.replace(' 부대', '')} ${sq.soldiers.length}`;
    const w = ctx.measureText(label).width + 10, x = c.x + 2, y = c.y - 30;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x, y + 8); ctx.stroke();
    const color = sq.leaderDown ? '#777' : sq.isLord ? '#b8862e' : sq.isGarrison ? '#55627a' : (MG.UNIT_TYPES[sq.type] || {}).color || '#888';
    ctx.fillStyle = color; ctx.globalAlpha = 0.92; ctx.fillRect(x, y - 8, w, 16); ctx.globalAlpha = 1;
    ctx.strokeStyle = sel ? '#6bdc8f' : '#222'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(x, y - 8, w, 16);
    ctx.fillStyle = sq.isGarrison ? '#fff' : '#111'; ctx.fillText(label, x + 5, y + 1);
    sq.flagBox = { x, y: y - 8, w, h: 16 };  // 화면 좌표
  }
}

function drawEnemies(B) {
  for (const e of B.enemies) {
    if (e.struct) continue;
    if (e.T.fly) {
      // 드래곤 날개
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(e.x + 10, e.y + 16, e.r * 1.8, e.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a1414';
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(e.x + sd * e.r * 0.5, e.y - 4);
        ctx.lineTo(e.x + sd * e.r * 2.6, e.y - e.r * 1.2); ctx.lineTo(e.x + sd * e.r * 2.2, e.y + 2); ctx.lineTo(e.x + sd * e.r * 1.4, e.y + 6); ctx.closePath(); ctx.fill();
      }
    }
    if (e.boss) {
      // 보스: 금빛 테두리와 이름, 큰 체력 막대
      ctx.fillStyle = 'rgba(255,200,60,0.18)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); ctx.fill();
      if (e.buffT > 0 || e.hasteT > 0) { ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2); ctx.stroke(); }
    } else if (e.buffT > 0) { ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = e.hitT > 0 ? '#fff' : e.T.color;
    ctx.beginPath();
    if (e.type === 'wolf') ctx.ellipse(e.x, e.y, e.r + 2, e.r - 1, 0, 0, Math.PI * 2);
    else if (e.T.ranged) { ctx.moveTo(e.x, e.y - e.r - 2); ctx.lineTo(e.x + e.r + 1, e.y + e.r); ctx.lineTo(e.x - e.r - 1, e.y + e.r); ctx.closePath(); }  // 원거리 적은 세모
    else ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    // 상태 이상: 얼음은 파란 테두리, 둔화는 옅은 파랑, 화상은 주황 점
    ctx.strokeStyle = e.frozenT > 0 ? '#bfe8ff' : e.slowT > 0 ? '#6cc6ff' : '#5a1010';
    ctx.lineWidth = e.frozenT > 0 ? 2.5 : 1.2; ctx.stroke();
    if (e.burnT > 0) { ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(e.x + e.r * 0.6, e.y - e.r * 0.6, 2, 0, Math.PI * 2); ctx.fill(); }
    if (e.boss) {
      ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd36b';  // 왕관
      ctx.beginPath(); ctx.moveTo(e.x - 7, e.y - e.r - 2); ctx.lineTo(e.x - 7, e.y - e.r - 9); ctx.lineTo(e.x - 3, e.y - e.r - 5); ctx.lineTo(e.x, e.y - e.r - 11);
      ctx.lineTo(e.x + 3, e.y - e.r - 5); ctx.lineTo(e.x + 7, e.y - e.r - 9); ctx.lineTo(e.x + 7, e.y - e.r - 2); ctx.closePath(); ctx.fill();
      const w = 50;
      ctx.fillStyle = '#300'; ctx.fillRect(e.x - w / 2, e.y + e.r + 5, w, 4);
      ctx.fillStyle = '#ffb347'; ctx.fillRect(e.x - w / 2, e.y + e.r + 5, w * e.hp / e.max, 4);
      ctx.font = 'bold 11px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(e.T.name, e.x, e.y + e.r + 11);
      ctx.fillStyle = '#ffd36b'; ctx.fillText(e.T.name, e.x, e.y + e.r + 11);
      continue;
    }
    if (e.hp < e.max) {
      const w = e.r * 2.4;
      ctx.fillStyle = '#300'; ctx.fillRect(e.x - w / 2, e.y - e.r - 5, w, 2.5);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(e.x - w / 2, e.y - e.r - 5, w * e.hp / e.max, 2.5);
    }
  }
}

function drawProjectiles(B) {
  for (const p of B.projectiles) {
    if (p.kind === 'fire') {
      ctx.fillStyle = 'rgba(255,150,60,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'boulder' || p.kind === 'rock') {
      ctx.fillStyle = p.kind === 'rock' ? '#7a6a5a' : '#9aa0b0';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'rock' ? 4 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
    } else if (p.kind === 'earrow') {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = '#ff8a6a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx / d * 7, p.y - dy / d * 7); ctx.stroke();
    } else if (p.kind === 'holy') {
      ctx.fillStyle = 'rgba(255,241,168,0.4)'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx / d * 7, p.y - dy / d * 7); ctx.stroke();
    }
  }
}

function drawFx(B) {
  for (const f of B.fx) {
    const a = f.t / f.max;
    ctx.globalAlpha = a;
    if (f.kind === 'p') { ctx.fillStyle = f.color; ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); }
    else if (f.kind === 'hit') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, 6 * (1.5 - a), 0, Math.PI * 2); ctx.stroke(); }
    else if (f.kind === 'boom') { ctx.fillStyle = 'rgba(255,140,50,0.5)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - a * 0.5), 0, Math.PI * 2); ctx.fill(); }
    else if (f.kind === 'heal') { ctx.fillStyle = '#7dff9a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', f.x, f.y - 8 - (1 - a) * 10); }
    else if (f.kind === 'repair') { ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚒', f.x, f.y - (1 - a) * 8); }
    else if (f.kind === 'charge') { ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 14 * (1.4 - a), 0, Math.PI * 2); ctx.stroke(); }
    else if (f.kind === 'breath') {
      ctx.fillStyle = 'rgba(255,110,30,0.5)'; ctx.beginPath(); ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, f.r * (1.15 - a * 0.4), f.ang - 0.62, f.ang + 0.62); ctx.closePath(); ctx.fill();
    }
    else if (f.kind === 'shout') { ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - a * 0.7), 0, Math.PI * 2); ctx.stroke(); }
    else if (f.kind === 'dust') { ctx.fillStyle = '#c8b89a'; ctx.beginPath(); ctx.arc(f.x, f.y, 4 * (1.6 - a), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

// ---------- 연출 ----------
// 쓰러진 자리의 흔적: 90초에 걸쳐 옅어진다
function drawDecals(B) {
  for (const d of B.decals || []) {
    const a = 0.45 * (1 - (B.time - d.born) / 90);
    if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// 피해 숫자 (화면 좌표: 확대해도 같은 크기)
function drawNumbers(B) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of B.fx) {
    if (f.kind !== 'num') continue;
    const a = f.t / f.max, p = MG.worldToScreen({ x: f.x, y: f.y }), y = p.y - (1 - a) * 26;
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.font = `bold ${f.text >= 100 ? 16 : 13}px "Malgun Gothic", sans-serif`;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(f.text, p.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}
// 배너: 가운데 위에 큰 글씨, 들어올 때 커졌다가 줄어들고 끝에 사라진다
function drawBanner(B) {
  const b = B.banner;
  if (!b) return;
  const el = b.max - b.t, a = Math.min(1, el * 4, b.t * 2), sc = el < 0.25 ? 1.3 - el * 1.2 : 1;
  const y = view.h * 0.22;
  ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#000'; ctx.fillRect(0, y - 38, view.w, b.sub ? 76 : 56);
  ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(view.w / 2, y - 6); ctx.scale(sc, sc);
  ctx.font = 'bold 34px "Malgun Gothic", sans-serif'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
  ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
  ctx.restore();
  if (b.sub) { ctx.font = '15px "Malgun Gothic", sans-serif'; ctx.fillStyle = '#e8ecf4'; ctx.fillText(b.sub, view.w / 2, y + 26); }
  ctx.globalAlpha = 1;
}
// 계절 날씨 (화면 효과만): 겨울 눈, 가을 낙엽, 늪 안개
MG.weatherOf = B => {
  if (B.conquest) return B.outpost.biome === 'swamp' ? 'fog' : B.outpost.biome === 'stone' ? 'ash' : season();
  return season();
};
const season = () => {
  const s = MG.S ? MG.SEASON(MG.S.month) : '봄';
  return s === '겨울' ? 'snow' : s === '가을' ? 'leaves' : 'none';
};
// 겨울이면 땅에 옅게 눈이 덮인다 (월드 좌표)
function drawGround(B) {
  const w = MG.weatherOf(B);
  if (w === 'snow') { ctx.fillStyle = 'rgba(235,240,250,0.16)'; ctx.fillRect(0, 0, W.w, W.h); }
  if (w === 'ash') { ctx.fillStyle = 'rgba(20,10,10,0.15)'; ctx.fillRect(0, 0, W.w, W.h); }
}
let flakes = [], flakeKind = null, lastW = 0;
function drawWeather(B) {
  const w = MG.weatherOf(B), now = performance.now(), dt = Math.min(0.05, (now - (lastW || now)) / 1000);
  lastW = now;
  if (w === 'none') return;
  if (w === 'fog') {
    // 천천히 흐르는 안개 덩어리
    const t = now / 1000;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 0.37 + t * 0.012 * (1 + i % 3)) % 1.4 - 0.2) * view.w, y = (0.15 + (i * 0.29) % 0.8) * view.h, r = view.w * 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(200,215,205,0.16)'); g.addColorStop(1, 'rgba(200,215,205,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return;
  }
  const n = w === 'snow' ? 140 : w === 'ash' ? 70 : 45;
  if (flakeKind !== w) { flakes = []; flakeKind = w; }
  while (flakes.length < n) flakes.push({ x: Math.random() * view.w, y: Math.random() * view.h, s: Math.random(), a: Math.random() * 6 });
  const paused = B.paused || B.phase !== 'battle' ? 0.3 : 1;
  for (const f of flakes) {
    if (w === 'snow') { f.y += (30 + f.s * 40) * dt * paused; f.x += Math.sin(f.a += dt) * 12 * dt; }
    else if (w === 'ash') { f.y -= (10 + f.s * 15) * dt * paused; f.x += Math.sin(f.a += dt * 0.7) * 10 * dt; }
    else { f.y += (35 + f.s * 30) * dt * paused; f.x += (25 + Math.sin(f.a += dt * 2) * 30) * dt * paused; }
    if (f.y > view.h + 10) { f.y = -10; f.x = Math.random() * view.w; }
    if (f.y < -10) { f.y = view.h + 10; f.x = Math.random() * view.w; }
    if (f.x > view.w + 10) f.x = -10;
    if (w === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(f.x, f.y, 1.2 + f.s * 1.6, 0, Math.PI * 2); ctx.fill(); }
    else if (w === 'ash') { ctx.fillStyle = f.s < 0.3 ? 'rgba(255,140,60,0.7)' : 'rgba(80,70,70,0.6)'; ctx.fillRect(f.x, f.y, 2, 2); }
    else {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.fillStyle = ['#c8742a', '#d89a3a', '#a8502a'][(f.s * 3) | 0]; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

// 스킬이 남기는 구역: 화살비, 불바다, 포격 예고
function drawZones(B) {
  for (const z of B.zones || []) {
    if (z.kind === 'fire') {
      ctx.fillStyle = 'rgba(255,110,30,0.28)'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    } else if (z.kind === 'arrows') {
      ctx.strokeStyle = 'rgba(240,230,200,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#f0e6c8';
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r, x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
        ctx.beginPath(); ctx.moveTo(x - 3, y - 8); ctx.lineTo(x, y); ctx.stroke();
      }
    } else if (z.kind === 'barrage') {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,150,80,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 30, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // 방패벽·축복·깃발 표시
  for (const sq of B.squads) {
    if (!(sq.shieldT > 0)) continue;
    ctx.strokeStyle = 'rgba(120,190,255,0.8)'; ctx.lineWidth = 1.5;
    for (const s of sq.soldiers) { ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2); ctx.stroke(); }
  }
  for (const b of B.blessings || []) {
    ctx.strokeStyle = 'rgba(255,241,168,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.s.x, b.s.y, 130, 0, Math.PI * 2); ctx.stroke();
  }
  if (B.flagT > 0 && B.lord && !B.lord.dead) {
    const l = B.lord;
    ctx.fillStyle = '#e6b450'; ctx.fillRect(l.x + 6, l.y - 26, 2, 22);
    ctx.fillStyle = '#b8282a'; ctx.fillRect(l.x + 8, l.y - 26, 14, 9);
  }
}
// 조준 중: 커서 원, 부대에서 닿는 거리 밖이면 빨갛게
function drawAim(B, input) {
  const a = input.aim, m = input.mouse;
  let ok = true;
  if (a.kind === 'skill') {
    for (const sq of a.squads) {
      const c = MG.centroid(sq), far = MG.dist(c, m) > MG.SKILL_RANGE;
      if (far) ok = false;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = far ? 'rgba(255,107,107,0.7)' : 'rgba(159,212,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.strokeStyle = ok ? '#9fd4ff' : '#ff6b6b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(m.x, m.y, a.r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ok ? 'rgba(159,212,255,0.12)' : 'rgba(255,107,107,0.12)'; ctx.fill();
}

// 준비 단계: 정찰된 습격 방향 표시
function drawScout(B) {
  ctx.font = 'bold 20px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of B.dirs) {
    const n = MG.NORMAL[d], x = C.x + n.x * (C.R + 230), y = C.y + n.y * (C.R + 230);
    ctx.fillStyle = 'rgba(255,80,80,0.85)';
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(-n.y, -n.x)); ctx.scale(1.4, 1.4);
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-12, -18); ctx.lineTo(-4, 0); ctx.lineTo(-12, 18); ctx.closePath(); ctx.fill();
    ctx.restore();
    const label = `${MG.SIDE_NAME[d]}쪽 습격 예상`, ly = y + (n.y === 0 ? 44 : n.y < 0 ? -42 : 42);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.strokeText(label, x, ly); ctx.fillText(label, x, ly);
  }
}

function drawLog(B) {
  ctx.font = 'bold 15px "Malgun Gothic", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  B.log.forEach((l, i) => {
    ctx.globalAlpha = Math.min(1, l.t);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(l.text).width;
    ctx.fillRect(14, 14 + i * 24, w + 16, 22);
    ctx.fillStyle = l.color; ctx.fillText(l.text, 22, 17 + i * 24);
    ctx.globalAlpha = 1;
  });
}

MG.render = function (B, input) {
  const { dpr, zoom } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d1016'; ctx.fillRect(0, 0, view.w, view.h);
  // 월드 좌표
  // 화면 흔들림: 화면 좌표로 흔든다
  const sh = B.shake || 0, ox = sh ? (Math.random() - 0.5) * 2 * sh : 0, oy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, (view.w / 2 - view.x * zoom + ox) * dpr, (view.h / 2 - view.y * zoom + oy) * dpr);
  if (B.conquest) {
    if (!B.bg) B.bg = MG.makeConquestBg(B);
    ctx.drawImage(B.bg, 0, 0);
    drawStructs(B);
  } else {
    ctx.drawImage(bg, 0, 0);
    drawFields(B);
    drawBuildings(B);
    drawWalls(B);
    drawGarrison(B);
    drawKeep(B);
  }
  drawGround(B);
  drawDecals(B);
  drawEnemies(B);
  drawSoldiers(B);
  drawProjectiles(B);
  drawFx(B);
  if (B.phase === 'prep') drawScout(B);
  if (input.drag) {
    const d = input.drag;
    ctx.strokeStyle = '#6bdc8f'; ctx.lineWidth = 1 / zoom; ctx.fillStyle = 'rgba(107,220,143,0.1)';
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); ctx.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  drawZones(B);
  if (input.aim) drawAim(B, input);
  for (const m of input.marks) {
    ctx.globalAlpha = m.t / 0.6; ctx.strokeStyle = m.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 10 * (1.4 - m.t), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // 화면 좌표
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFlags(B);
  drawWeather(B);
  drawNumbers(B);
  drawBanner(B);
  drawLog(B);
  if (input.aim) {
    const name = input.aim.kind === 'amove' ? '어택땅' : input.aim.kind === 'skill' ? input.aim.squads.map(sq => MG.skillOf(sq).name).filter((v, i, a) => a.indexOf(v) === i).join('·') : MG.ITEMS[input.aim.id].name;
    ctx.font = 'bold 16px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(view.w / 2 - 230, view.h - 64, 460, 28);
    ctx.fillStyle = '#9fd4ff'; ctx.fillText(`${name}: 쓸 곳을 클릭하세요 · 우클릭/Esc 취소`, view.w / 2, view.h - 50);
  }
  if (B.paused && B.phase === 'battle') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = 'bold 26px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText('일시정지 — 명령을 내릴 수 있어요', view.w / 2, view.h - 36);
  }
};
})();
