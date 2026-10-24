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
      const r = s.isLord ? 6 : s.isGeneral ? 5 : 3.4;
      if (sel) { ctx.fillStyle = 'rgba(107,220,143,0.45)'; ctx.beginPath(); ctx.arc(s.x, s.y, r + 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = s.T.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = e.hitT > 0 ? '#fff' : e.T.color;
    ctx.beginPath();
    if (e.type === 'wolf') ctx.ellipse(e.x, e.y, e.r + 2, e.r - 1, 0, 0, Math.PI * 2);
    else ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    // 상태 이상: 얼음은 파란 테두리, 둔화는 옅은 파랑, 화상은 주황 점
    ctx.strokeStyle = e.frozenT > 0 ? '#bfe8ff' : e.slowT > 0 ? '#6cc6ff' : '#5a1010';
    ctx.lineWidth = e.frozenT > 0 ? 2.5 : 1.2; ctx.stroke();
    if (e.burnT > 0) { ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(e.x + e.r * 0.6, e.y - e.r * 0.6, 2, 0, Math.PI * 2); ctx.fill(); }
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
    else if (f.kind === 'dust') { ctx.fillStyle = '#c8b89a'; ctx.beginPath(); ctx.arc(f.x, f.y, 4 * (1.6 - a), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
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
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, (view.w / 2 - view.x * zoom) * dpr, (view.h / 2 - view.y * zoom) * dpr);
  ctx.drawImage(bg, 0, 0);
  drawFields(B);
  drawBuildings(B);
  drawWalls(B);
  drawGarrison(B);
  drawKeep(B);
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
  for (const m of input.marks) {
    ctx.globalAlpha = m.t / 0.6; ctx.strokeStyle = m.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 10 * (1.4 - m.t), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // 화면 좌표
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFlags(B);
  drawLog(B);
  if (B.paused && B.phase === 'battle') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = 'bold 26px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText('일시정지 — 명령을 내릴 수 있어요', view.w / 2, view.h - 36);
  }
};
})();
