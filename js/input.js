// 마우스·키보드: 선택, 이동, 집중 공격, 부대 지정
(() => {
const cv = MG.canvas;
const input = MG.input = { drag: null, marks: [], pan: null, keys: new Set() };

const toScreen = ev => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
const toWorld = ev => { const s = toScreen(ev); return MG.screenToWorld(s.x, s.y); };

// 깃발은 화면 좌표, 병사는 월드 좌표로 찾는다
function squadAt(B, p, sp) {
  for (const sq of B.squads) {
    const f = sq.flagBox;
    if (f && sp.x >= f.x && sp.x <= f.x + f.w && sp.y >= f.y && sp.y <= f.y + f.h) return sq;
  }
  let best = null, bd = Math.max(9, 9 / MG.view.zoom);
  for (const sq of B.squads) for (const s of sq.soldiers) {
    const d = MG.dist(s, p);
    if (d < bd) { bd = d; best = sq; }
  }
  return best;
}

function enemyAt(B, p) {
  let best = null, bd = 14;
  for (const e of B.enemies) { const d = MG.dist(e, p) - e.r; if (d < bd) { bd = d; best = e; } }
  return best;
}

const usable = B => MG.mode === 'battle' && B && (B.phase === 'prep' || B.phase === 'battle');

// ---------- 스킬·소모품 조준 ----------
// 지점을 찍는 스킬·소모품은 조준 모드로 들어가서, 다음 좌클릭 지점에 쓴다 (우클릭·Esc로 취소)
input.aim = null;
input.mouse = { x: 0, y: 0 };
const report = why => { if (why) MG.log(why, '#ffb36b'); };
MG.beginSkill = squads => {
  const B = MG.B;
  if (!B || B.phase !== 'battle') { report('전투가 시작된 뒤에 써요'); return; }
  const aimers = [];
  for (const sq of squads) {
    const K = MG.skillOf(sq), st = MG.skillState(sq);
    if (!K || !st) continue;
    if (!st.ok) { report(`${sq.name} ${K.name}: ${st.cd ? `아직 ${st.why}` : st.why}`); continue; }
    if (K.target === 'point') aimers.push(sq); else report(MG.useSkill(sq));
  }
  if (aimers.length) input.aim = { kind: 'skill', squads: aimers, r: 60 };
  MG.ui.refresh(true);
};
MG.beginItem = k => {
  const B = MG.B, I = MG.ITEMS[k];
  if (!B || B.phase !== 'battle') { report('전투가 시작된 뒤에 써요'); return; }
  if (I.target === 'none') report(MG.useItem(k));
  else if (I.target === 'squad') report(MG.useItem(k, null, [...B.selected][0]));
  else input.aim = { kind: 'item', id: k, r: I.target === 'wall' ? 30 : 50 };
  MG.ui.refresh(true);
};
function fireAim(p) {
  const a = input.aim;
  input.aim = null;
  if (a.kind === 'amove') {
    // 적을 찍으면 그 적을 집중 공격, 땅을 찍으면 어택땅
    const e = enemyAt(MG.B, p);
    if (e) { for (const sq of MG.B.selected) MG.orderAttack(sq, e); input.marks.push({ x: e.x, y: e.y, t: 0.6, color: '#ff6b6b' }); }
    else moveSelected(MG.B, p, true);
    MG.ui.refresh(true);
    return;
  }
  if (a.kind === 'skill') for (const sq of a.squads) { if (MG.B.squads.includes(sq)) report(MG.useSkill(sq, p)); }
  else report(MG.useItem(a.id, p));
  input.marks.push({ x: p.x, y: p.y, t: 0.6, color: '#9fd4ff' });
  MG.ui.refresh(true);
}

// 여러 부대를 함께 옮길 때는 옆으로 나란히 세운다
function moveSelected(B, p, attack) {
  const sel = [...B.selected];
  if (!sel.length) return;
  const wallSide = MG.onWall(p) ? MG.side(p) : null;
  let facing, perp;
  if (wallSide) {
    facing = MG.NORMAL[wallSide];
    perp = { x: -facing.y, y: facing.x };
  } else {
    let cx = 0, cy = 0;
    for (const sq of sel) { const c = MG.centroid(sq); cx += c.x; cy += c.y; }
    cx /= sel.length; cy /= sel.length;
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    facing = d > 20 ? { x: dx / d, y: dy / d } : sel[0].facing;
    perp = { x: -facing.y, y: facing.x };
  }
  const widths = sel.map(sq => (wallSide ? MG.squadWallWidth(sq) : MG.squadWidth(sq)));
  let off = -widths.reduce((a, b) => a + b, 0) / 2;
  sel.forEach((sq, i) => {
    const o = off + widths[i] / 2;
    off += widths[i];
    (attack ? MG.orderAttackMove : MG.orderMove)(sq, p.x + perp.x * o, p.y + perp.y * o, facing);
  });
  input.marks.push({ x: p.x, y: p.y, t: 0.6, color: attack ? '#ff6b6b' : '#6bdc8f' });
}

cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('mousedown', ev => {
  const B = MG.B;
  if (ev.button === 1) {
    ev.preventDefault();
    input.pan = { sx: ev.clientX, sy: ev.clientY, vx: MG.view.x, vy: MG.view.y };
    return;
  }
  if (!usable(B)) return;
  const p = toWorld(ev);
  if (input.aim) {
    if (ev.button === 0) fireAim(p);
    else { input.aim = null; MG.log('조준을 취소했어요.'); }
    return;
  }
  if (ev.button === 0) input.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: ev.shiftKey, sx: toScreen(ev) };
  if (ev.button === 2 && B.selected.size) {
    const e = enemyAt(B, p);
    if (e) {
      for (const sq of B.selected) MG.orderAttack(sq, e);
      input.marks.push({ x: e.x, y: e.y, t: 0.6, color: '#ff6b6b' });
    } else moveSelected(B, p);
  }
});
window.addEventListener('mousemove', ev => {
  if (MG.mode === 'battle') { const r = cv.getBoundingClientRect(); input.mouse = MG.screenToWorld(ev.clientX - r.left, ev.clientY - r.top); }
  if (input.pan) {
    const v = MG.view;
    v.x = input.pan.vx - (ev.clientX - input.pan.sx) / v.zoom;
    v.y = input.pan.vy - (ev.clientY - input.pan.sy) / v.zoom;
    MG.clampView();
  }
  if (!input.drag) return;
  const p = toWorld(ev);
  input.drag.x1 = p.x; input.drag.y1 = p.y;
});
window.addEventListener('mouseup', ev => {
  if (ev.button === 1) { input.pan = null; return; }
  const d = input.drag, B = MG.B;
  if (!d || ev.button !== 0) return;
  input.drag = null;
  if (!d.shift) B.selected.clear();
  const tiny = 5 / MG.view.zoom;
  if (Math.abs(d.x1 - d.x0) < tiny && Math.abs(d.y1 - d.y0) < tiny) {
    const sq = squadAt(B, { x: d.x0, y: d.y0 }, d.sx);
    if (sq) { if (d.shift && B.selected.has(sq)) B.selected.delete(sq); else B.selected.add(sq); }
  } else {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    for (const sq of B.squads) {
      if (sq.soldiers.some(s => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1)) B.selected.add(sq);
    }
  }
  MG.ui.refresh(true);
});

window.addEventListener('keydown', ev => {
  const B = MG.B;
  if (MG.mode !== 'battle' || !B) return;
  if (ev.key >= '1' && ev.key <= '9') {
    if (ev.ctrlKey) {
      ev.preventDefault();
      B.groups[ev.key] = [...B.selected];
      MG.log(`부대 ${ev.key}번에 지정했어요.`);
    } else if (B.groups[ev.key]) {
      B.selected.clear();
      for (const sq of B.groups[ev.key]) if (B.squads.includes(sq)) B.selected.add(sq);
    }
    MG.ui.refresh(true);
  } else if (ev.key === ' ') {
    ev.preventDefault();
    MG.ui.togglePause();
  } else if ((ev.key === 'a' || ev.key === 'A') && !ev.ctrlKey) {
    // 어택땅: 다음 좌클릭 지점으로 싸우면서 이동
    if (B.selected.size) input.aim = { kind: 'amove', r: 12 };
  } else if (ev.key === 'q' || ev.key === 'Q') {
    MG.beginSkill([...B.selected]);
  } else if (ev.key === 'Escape') {
    if (input.aim) { input.aim = null; return; }
    B.selected.clear();
    MG.ui.refresh(true);
  } else if (ev.key === 'h' || ev.key === 'H') {
    MG.resetView();
  }
  if (PAN_KEYS[ev.key]) { ev.preventDefault(); input.keys.add(ev.key); }
});
window.addEventListener('keyup', ev => input.keys.delete(ev.key));
window.addEventListener('blur', () => input.keys.clear());

// 휠: 커서 위치를 기준으로 확대·축소
cv.addEventListener('wheel', ev => {
  ev.preventDefault();
  const v = MG.view, s = toScreen(ev), before = MG.screenToWorld(s.x, s.y);
  v.zoom *= Math.exp(-ev.deltaY * 0.0015);
  MG.clampView();
  v.x = before.x - (s.x - v.w / 2) / v.zoom;
  v.y = before.y - (s.y - v.h / 2) / v.zoom;
  MG.clampView();
}, { passive: false });

const PAN_KEYS = {
  // A키는 어택땅이라 WASD 대신 방향키로만 화면을 옮긴다
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};

MG.updateInput = dt => {
  for (const m of input.marks) m.t -= dt;
  input.marks = input.marks.filter(m => m.t > 0);
  if (input.keys.size) {
    const v = MG.view, sp = 700 / v.zoom * dt;
    for (const k of input.keys) { const d = PAN_KEYS[k]; if (d) { v.x += d[0] * sp; v.y += d[1] * sp; } }
    MG.clampView();
  }
};
})();
