// 전투 시뮬레이션: 성벽 통과 판정, 경로, 부대·적 AI, 직할 수비대, 승패.
(() => {
const C = MG.CASTLE;
let B = null;  // 현재 전투

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const cheb = p => Math.max(Math.abs(p.x - C.x), Math.abs(p.y - C.y));
const cls = p => (cheb(p) > C.R ? 'out' : 'in');
const side = p => {
  const dx = p.x - C.x, dy = p.y - C.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
};
const along = (p, s) => (s === 'N' || s === 'S' ? p.x - C.x : p.y - C.y);
const onWall = p => { const d = cheb(p); return d <= C.R && d >= C.R - C.T; };
// 이 지점이 속한 성벽 조각 (성문 포함)
const segAt = p => {
  const s = side(p), a = along(p, s), list = B.wallBySide[s];
  return list.find(w => a >= w.a0 && a <= w.a1) || (a < 0 ? list[0] : list[list.length - 1]);
};
const segMid = (w, depth) => {
  const n = MG.NORMAL[w.side], m = (w.a0 + w.a1) / 2;
  return { x: C.x + n.x * depth + -n.y * m, y: C.y + n.y * depth + n.x * m };
};
Object.assign(MG, { dist, cheb, cls, side, along, onWall, segAt, segMid });

// ---------- 길찾기 격자 (20px) ----------
const NC = 20, NX = Math.ceil(MG.WORLD.w / NC), NY = Math.ceil(MG.WORLD.h / NC), NN = NX * NY;
const cellIdx = p => Math.min(NX - 1, Math.max(0, (p.x / NC) | 0)) + Math.min(NY - 1, Math.max(0, (p.y / NC) | 0)) * NX;
const cellCenter = k => ({ x: (k % NX) * NC + NC / 2, y: ((k / NX) | 0) * NC + NC / 2 });
const NEI = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// 성 안 건물: 칸마다 건물 번호(+1)를 적어 둔다. 부서진 건물은 지나갈 수 있다.
function buildingAt(p) {
  const v = B.bgrid[cellIdx(p)];
  return v ? B.buildings[v - 1] : null;
}
function markBuilding(b, idx) {
  for (let y = b.y0; y < b.y1; y += NC) for (let x = b.x0; x < b.x1; x += NC) B.bgrid[cellIdx({ x: x + 1, y: y + 1 })] = idx;
}
MG.buildingAt = p => buildingAt(p);

// 성벽 경계(바깥 테두리)를 넘을 수 있는지: 무너진 조각은 누구나, 멀쩡한 성문은 아군만
function wallOK(a, b, enemy) {
  const ca = cls(a), cb = cls(b);
  if (ca === cb) return true;
  const w = segAt(ca === 'in' ? a : b);
  if (w.hp <= 0) return true;
  return !enemy && w.gate;
}
// 건물 안으로는 못 들어간다 (이미 안에 있으면 빠져나오는 건 허용)
function canStep(a, b, enemy) {
  const bb = buildingAt(b);
  if (bb && bb !== buildingAt(a)) return false;
  return wallOK(a, b, enemy);
}

function segOK(a, b, enemy) {
  const n = Math.max(1, Math.ceil(dist(a, b) / 6));
  let px = a.x, py = a.y;
  for (let i = 1; i <= n; i++) {
    const nx = a.x + (b.x - a.x) * i / n, ny = a.y + (b.y - a.y) * i / n;
    if (!canStep({ x: px, y: py }, { x: nx, y: ny }, enemy)) return false;
    px = nx; py = ny;
  }
  return true;
}

// 최소 힙 (길찾기용)
function heapPush(h, k, f) {
  h.push([f, k]);
  let i = h.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top;
}

// 아군 길찾기: 격자 A* 후, 곧게 갈 수 있는 구간은 이어 붙인다
function planPath(a, b) {
  if (segOK(a, b, false)) return [{ x: b.x, y: b.y }];
  const goal = freeSpot(b), s = cellIdx(a), t = cellIdx(goal);
  const g = new Float32Array(NN).fill(Infinity), prev = new Int32Array(NN).fill(-1), closed = new Uint8Array(NN);
  const tc = cellCenter(t), h = k => { const c = cellCenter(k), dx = Math.abs(c.x - tc.x), dy = Math.abs(c.y - tc.y); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) / NC; };
  const open = [];
  g[s] = 0; heapPush(open, s, h(s));
  let found = false;
  while (open.length) {
    const [, u] = heapPop(open);
    if (closed[u]) continue;
    if (u === t) { found = true; break; }
    closed[u] = 1;
    const ux = u % NX, uy = (u / NX) | 0, cu = cellCenter(u);
    for (const [dx, dy, w] of NEI) {
      const vx = ux + dx, vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= NX || vy >= NY) continue;
      const v = vx + vy * NX;
      if (closed[v] || B.bgrid[v]) continue;
      if (dx && dy && (B.bgrid[ux + dx + uy * NX] || B.bgrid[ux + (uy + dy) * NX])) continue;  // 모서리 끼어들기 금지
      const cv = cellCenter(v);
      if (!wallOK(cu, cv, false)) continue;
      const ng = g[u] + w;
      if (ng < g[v]) { g[v] = ng; prev[v] = u; heapPush(open, v, ng + h(v)); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = t; k !== -1 && k !== s; k = prev[k]) cells.unshift(cellCenter(k));
  cells.push({ x: goal.x, y: goal.y });
  const out = [];
  let cur = a, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !segOK(cur, cells[j], false)) j--;
    out.push(cells[j]); cur = cells[j]; i = j + 1;
  }
  return out;
}

// 건물 안쪽 지점이면 가까운 빈 곳으로 옮긴다
function freeSpot(p) {
  if (!buildingAt(p)) return p;
  for (let r = 10; r <= 140; r += 10) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (!buildingAt(q) && cls(q) === cls(p)) return q;
    }
  }
  return p;
}

// 적의 흐름장: 본성에서 바깥으로 퍼지는 거리. 건물 칸은 비싸지만 부수고 지나갈 수 있다.
const BUILDING_COST = 4;
function computeField() {
  const d = new Float32Array(NN).fill(Infinity), open = [];
  for (let k = 0; k < NN; k++) if (dist(cellCenter(k), C) <= C.keepR + 18) { d[k] = 0; heapPush(open, k, 0); }
  while (open.length) {
    const [du, u] = heapPop(open);
    if (du > d[u]) continue;
    const ux = u % NX, uy = (u / NX) | 0, cu = cellCenter(u);
    for (const [dx, dy, w] of NEI) {
      const vx = ux + dx, vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= NX || vy >= NY) continue;
      const v = vx + vy * NX;
      if (!wallOK(cu, cellCenter(v), true)) continue;
      const nd = du + w * (B.bgrid[v] ? BUILDING_COST : 1);
      if (nd < d[v]) { d[v] = nd; heapPush(open, v, nd); }
    }
  }
  B.field = d;
  B.fieldDirty = false;
}
// 흐름장을 따라 한 칸 나아갈 지점 (닿을 수 없으면 null)
function fieldNext(e) {
  const k = cellIdx(e);
  if (B.field[k] === Infinity) return null;
  const kx = k % NX, ky = (k / NX) | 0;
  let best = -1, bv = B.field[k];
  for (const [dx, dy] of NEI) {
    const vx = kx + dx, vy = ky + dy;
    if (vx < 0 || vy < 0 || vx >= NX || vy >= NY) continue;
    const v = vx + vy * NX;
    if (B.field[v] < bv && wallOK(e, cellCenter(v), true)) { bv = B.field[v]; best = v; }
  }
  return best < 0 ? null : cellCenter(best);
}

// 목표 쪽으로 한 걸음. 아군은 막히면 축 방향으로 미끄러져 본다.
function stepToward(o, tx, ty, step, enemy) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return true;
  const k = Math.min(step, d) / d;
  const n = { x: o.x + dx * k, y: o.y + dy * k };
  if (canStep(o, n, enemy)) { o.x = n.x; o.y = n.y; return true; }
  if (enemy) return false;
  const nx = { x: n.x, y: o.y }, ny = { x: o.x, y: n.y };
  if (Math.abs(dx) > 0.1 && canStep(o, nx, false)) { o.x = nx.x; return true; }
  if (Math.abs(dy) > 0.1 && canStep(o, ny, false)) { o.y = ny.y; return true; }
  return false;
}

// ---------- 생성 ----------
// 능력치 = 병종 기본값 × 장수 레벨의 부대 보너스 × 전직·무기 보정 (장수는 본인 레벨과 무기 등급까지)
function makeSoldier(squad, type, x, y, opts = {}) {
  const T = MG.UNIT_TYPES[type], m = squad.mods, lv = squad.lvBonus;
  let max = T.hp * lv * m.hp, atk = T.atk * lv * m.atk;
  if (opts.general) {
    const gl = (opts.genLevel || 1) - 1;
    // 나이가 많으면 장수 본인의 능력이 떨어진다
    const age = opts.ageMul || 1;
    max *= MG.GENERAL_MULT.hp * (1 + MG.LEVEL_BONUS.genHp * gl) * age;
    atk *= MG.GENERAL_MULT.atk * (1 + MG.LEVEL_BONUS.genAtk * gl) * (opts.weaponAtk || 1) * age;
  }
  if (opts.hp) max = opts.hp;
  if (opts.atk) atk = opts.atk;
  let hp = max;
  if (opts.injured) hp = max * MG.INJURED_GENERAL_HP;
  if (opts.wound) hp = max * MG.WOUND_HP[opts.wound.sev];
  const s = { id: B.nextId++, squad, type, T, x, y, hp, max, atk,
    cd: T.cd * m.cd, range: T.range * m.range, splash: (T.splash || 0) * m.splash, heal: atk * m.heal,
    cdT: rand(0, T.cd), retT: rand(0, 0.3), target: null, path: [], slotX: x, slotY: y,
    moving: false, stuckT: 0, replanT: 0, isGeneral: !!opts.general, isLord: !!opts.lord, name: opts.name || null,
    wound: opts.wound || null, injuredStart: !!opts.injured, dead: false };
  squad.soldiers.push(s);
  B.soldiers.push(s);
  return s;
}

const NO_MODS = MG.combineMods([]);
function makeSquad(name, type, opts = {}) {
  const sq = { id: B.nextId++, name, type, soldiers: [], general: null, focus: null, anchor: null,
    facing: { x: 0, y: -1 }, leaderDown: false, isLord: !!opts.lord, isGarrison: !!opts.garrison, initial: 0,
    gid: opts.gid || null, title: opts.title || null, mods: opts.mods || NO_MODS, lvBonus: opts.lvBonus || 1, xp: 0, kills: 0 };
  B.squads.push(sq);
  B.allSquads.push(sq);
  return sq;
}

// roster: 캠페인에서 만든 출전 부대 구성 (MG.buildRoster)
MG.createBattle = function (level, roster) {
  const waves = MG.buildWaves(level, roster.dirs);
  B = MG.B = {
    level, phase: 'prep', time: 0, speed: 1, paused: false, nextId: 1,
    keep: { hp: roster.keep != null ? roster.keep : MG.KEEP_HP, max: MG.KEEP_HP }, morale: roster.morale || 1,
    squads: [], allSquads: [], soldiers: [], enemies: [], projectiles: [], fx: [], log: [], auras: [], roster,
    garrison: {}, garrisonSquads: {}, garrisonPool: { archer: 0, infantry: 0 }, groups: {}, selected: new Set(),
    waves: waves.groups, dirs: waves.dirs, spawnQueue: [], wave: 0, fields: roster.fields || [],
    stats: { kills: 0, fallen: [], spawned: 0 }, lordDead: false, lord: null, result: null,
  };
  // 성벽: 지난 전투에서 받은 피해가 남아 있다
  B.walls = []; B.wallBySide = {};
  const g = C.gateHalf, spans = [[-C.R, -C.R / 2], [-C.R / 2, -g], [-g, g], [g, C.R / 2], [C.R / 2, C.R]];
  const prevWalls = roster.walls || {};
  for (const s of MG.SIDES) {
    B.wallBySide[s] = spans.map(([a0, a1], i) => {
      const gate = i === 2, max = gate ? MG.GATE_HP : MG.WALL_SEG_HP, id = s + i;
      const w = { id, side: s, a0, a1, gate, hp: prevWalls[id] != null ? prevWalls[id] : max, max };
      B.walls.push(w);
      return w;
    });
    B.garrison[s] = { archer: 0, infantry: 0, archT: rand(0, 1), infT: rand(0, 1) };
  }
  // 성 안 건물
  B.bgrid = new Int16Array(NN);
  B.buildings = (roster.buildings || []).map(b => {
    const d = MG.BUILDINGS[b.type], r0 = MG.cellRect(b.i, b.j), r1 = MG.cellRect(b.i + d.w - 1, b.j + d.h - 1);
    return { ...b, x0: r0.x0, y0: r0.y0, x1: r1.x1, y1: r1.y1 };
  });
  B.buildings.forEach((b, i) => { if (b.hp > 0) markBuilding(b, i + 1); });
  computeField();
  // 직할 병력은 네 면에 고르게 (나머지는 앞쪽 면부터)
  for (const kind of ['archer', 'infantry']) {
    const n = roster.garrison[kind];
    MG.SIDES.forEach((s, i) => { B.garrison[s][kind] = Math.floor(n / 4) + (i < n % 4 ? 1 : 0); });
  }
  for (const rs of roster.squads) {
    const sq = makeSquad(`${rs.name} 부대`, rs.type, { gid: rs.gid, title: rs.title, mods: rs.mods,
      lvBonus: (1 + MG.LEVEL_BONUS.squad * (rs.level - 1)) * (rs.train || 1) });
    const x = C.x + rs.slot.x, y = C.y + rs.slot.y;
    if (rs.general) {
      sq.general = makeSoldier(sq, rs.type, x, y, { general: true, name: rs.general.name, genLevel: rs.level,
        weaponAtk: rs.weaponAtk, injured: rs.general.injured, ageMul: rs.general.ageMul });
    } else sq.leaderDown = true;
    for (let i = 0; i < rs.healthy; i++) makeSoldier(sq, rs.type, x, y);
    for (const m of rs.mob) makeSoldier(sq, rs.type, x, y, { wound: m });
    sq.initial = sq.soldiers.length;
    MG.orderMove(sq, x, y, { x: 0, y: -1 }, true);
  }
  // 성주: 장수 출신이면 그 레벨만큼 강하다. 어린 성주는 전투에 나가지 않고 근위대만 싸운다.
  const L = MG.LORD, RL = roster.lord, lsq = makeSquad('성주 근위대', 'guard', { lord: true, gid: 'lord' });
  const lx = C.x + L.at.x, ly = C.y + L.at.y, lv = (RL.level || 1) - 1, age = RL.ageMul || 1;
  if (!RL.minor) {
    B.lord = lsq.general = makeSoldier(lsq, 'guard', lx, ly, { lord: true, name: RL.name,
      hp: L.hp * (1 + MG.LEVEL_BONUS.genHp * lv) * age, atk: L.atk * (1 + MG.LEVEL_BONUS.genAtk * lv) * age });
  } else lsq.leaderDown = false;
  for (let i = 0; i < L.guards; i++) makeSoldier(lsq, 'guard', lx, ly);
  lsq.initial = lsq.soldiers.length;
  MG.orderMove(lsq, lx, ly, { x: 0, y: -1 }, true);

  const hpScale = Math.pow(1.1, level - 1);
  for (const g of B.waves) {
    const lane = rand(-C.R * 0.6, C.R * 0.6);
    for (let i = 0; i < g.count; i++) {
      const atGate = Math.random() < MG.GATE_TARGET[g.type];
      const l = atGate ? rand(-C.gateHalf * 0.7, C.gateHalf * 0.7) : lane + rand(-C.R * 0.5, C.R * 0.5);
      B.spawnQueue.push({ t: g.t + i * 0.35 + rand(0, 0.3), type: g.type, dir: g.dir, wave: g.wave,
        lane: Math.max(-C.R * 0.92, Math.min(C.R * 0.92, l)), hpScale,
        raider: g.type !== 'orc' && Math.random() < MG.RAIDER_SHARE });
    }
  }
  B.spawnQueue.sort((a, b) => a.t - b.t);
  return B;
};

// ---------- 명령 ----------
function formationSlots(n, tx, ty, facing, wallSide) {
  const slots = [];
  if (wallSide) {
    const nrm = MG.NORMAL[wallSide], perp = { x: -nrm.y, y: nrm.x };
    const rows = n > 12 ? 2 : 1, cols = Math.ceil(n / rows), sp = 10;
    const half = (cols - 1) / 2 * sp, lim = C.R - 8;
    const a0 = Math.max(-lim + half, Math.min(lim - half, along({ x: tx, y: ty }, wallSide)));
    const depth = [C.R - C.T * 0.3, C.R - C.T * 0.72];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const a = Math.max(-lim, Math.min(lim, a0 + (c - (cols - 1) / 2) * sp));
      slots.push({ x: C.x + nrm.x * depth[r] + perp.x * a, y: C.y + nrm.y * depth[r] + perp.y * a });
    }
    return slots;
  }
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.8))), rows = Math.ceil(n / cols), sp = 12;
  const p = { x: -facing.y, y: facing.x };
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const oc = (c - (inRow - 1) / 2) * sp, or = -r * sp;
    slots.push({ x: tx + p.x * oc + facing.x * or, y: ty + p.y * oc + facing.y * or });
  }
  return slots;
}

MG.squadWidth = sq => {
  const n = sq.soldiers.length;
  return Math.max(1, Math.round(Math.sqrt(n * 1.8))) * 12 + 16;
};
MG.squadWallWidth = sq => { const n = sq.soldiers.length; return Math.ceil(n / (n > 12 ? 2 : 1)) * 10 + 14; };

MG.centroid = sq => {
  let x = 0, y = 0;
  for (const s of sq.soldiers) { x += s.x; y += s.y; }
  const n = sq.soldiers.length || 1;
  return { x: x / n, y: y / n };
};

// teleport: 준비 단계의 초기 배치처럼 즉시 자리 잡기
MG.orderMove = function (sq, tx, ty, facing, teleport) {
  const alive = sq.soldiers;
  if (!alive.length) return;
  const wallSide = onWall({ x: tx, y: ty }) ? side({ x: tx, y: ty }) : null;
  const ordered = alive.slice().sort((a, b) => (b.isGeneral || b.isLord) - (a.isGeneral || a.isLord));
  const slots = formationSlots(ordered.length, tx, ty, facing, wallSide);
  const via = teleport ? [] : (planPath(MG.centroid(sq), { x: tx, y: ty }, false) || [{ x: tx, y: ty }]).slice(0, -1);
  ordered.forEach((s, i) => {
    const slot = freeSpot(slots[i]);
    s.slotX = slot.x; s.slotY = slot.y;
    s.target = null; s.stuckT = 0;
    if (teleport) { s.x = s.slotX; s.y = s.slotY; s.path = []; s.moving = false; return; }
    s.path = via.map(p => ({ x: p.x + rand(-6, 6), y: p.y + rand(-6, 6) }));
    s.path.push({ x: s.slotX, y: s.slotY });
    s.moving = true;
  });
  sq.anchor = { x: tx, y: ty };
  sq.facing = facing;
  sq.focus = null;
};

MG.orderAttack = function (sq, enemy) {
  sq.focus = enemy;
  for (const s of sq.soldiers) { s.target = null; s.retT = 0; s.moving = false; s.path = []; }
};

// ---------- 전투 처리 ----------
function log(text, color) { B.log.push({ text, color: color || '#e8ecf4', t: 6 }); if (B.log.length > 6) B.log.shift(); }
MG.log = log;

function spawnEnemy(q) {
  const T = MG.ENEMY_TYPES[q.type], W = MG.WORLD;
  let x, y;
  if (q.dir === 'N') { x = C.x + q.lane; y = 8; }
  else if (q.dir === 'S') { x = C.x + q.lane; y = W.h - 8; }
  else if (q.dir === 'E') { x = W.w - 8; y = C.y + q.lane; }
  else { x = 8; y = C.y + q.lane; }
  const hp = Math.round(T.hp * q.hpScale);
  B.enemies.push({ id: B.nextId++, type: q.type, T, x, y, hp, max: hp, r: T.r, lane: q.lane, dir: q.dir, raider: q.raider, prey: null,
    cdT: rand(0, T.cd), retT: rand(0, 0.3), planT: rand(0, 1), target: null, path: null, hitT: 0, dead: false,
    slowT: 0, slowF: 0, burnT: 0, burnDps: 0, burnSrc: null, frozenT: 0 });
  B.stats.spawned++;
}

// 장수가 내는 오라(전투사제: 공격력, 수호기사: 받는 피해 감소)
const AURA_R = 120;
function auraBonus(s, key) {
  let best = 0;
  for (const a of B.auras) if (a[key] > best && dist(s, a.s) < AURA_R) best = a[key];
  return best;
}

function atkMult(s) {
  let m = (1 + auraBonus(s, 'atk')) * B.morale;
  if (s.squad.leaderDown && !s.isGeneral) m *= MG.LEADER_DOWN_MULT;
  if (B.lordDead) m *= MG.LORD_DEAD_MULT;
  else if (B.lord && !s.isLord && dist(s, B.lord) < MG.LORD.aura) m *= 1 + MG.LORD.auraBonus;
  return m;
}

// sq: 피해를 준 부대(경험치와 전직·무기 효과의 주인). 직할 수비대의 화살은 null.
function hitEnemy(e, dmg, sq) {
  const m = sq ? sq.mods : NO_MODS;
  if (m.crit && Math.random() < m.crit) dmg *= 2;
  damageEnemy(e, dmg, sq);
  if (e.dead) return;
  if (m.slow) { e.slowF = Math.max(e.slowT > 0 ? e.slowF : 0, m.slow); e.slowT = 2; }
  if (m.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, m.burn); e.burnSrc = sq; }
  if (m.freeze && Math.random() < m.freeze) e.frozenT = 1;
}

function damageEnemy(e, dmg, sq) {
  if (e.dead) return;
  e.hp -= dmg; e.hitT = 0.1;
  if (e.hp <= 0) {
    e.dead = true; B.stats.kills++;
    if (sq) { sq.kills++; sq.xp += MG.ENEMY_XP[e.type] || 1; }
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      B.fx.push({ kind: 'p', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.45, max: 0.45, color: e.T.color });
    }
  }
}

function damageFriendly(s, dmg) {
  if (s.dead) return;
  s.hp -= dmg * s.squad.mods.dmgTaken * (1 - auraBonus(s, 'def'));
  if (s.hp > 0) return;
  s.dead = true;
  const sq = s.squad;
  B.stats.fallen.push({ name: s.name, type: s.type, squad: sq.name, gid: sq.gid, garrison: sq.isGarrison,
    general: s.isGeneral, lord: s.isLord, wound: s.wound, injured: s.injuredStart });
  B.fx.push({ kind: 'p', x: s.x, y: s.y, vx: 0, vy: -20, t: 0.6, max: 0.6, color: '#ff8080' });
  if (s.isLord) {
    B.lordDead = true; B.lord = null;
    log(`${s.name}이(가) 전사했어요! 전군의 사기가 떨어져요.`, '#ff6b6b');
  } else if (s.isGeneral) {
    sq.leaderDown = true;
    log(`${s.name}이(가) 쓰러졌어요. ${sq.name}의 공격력이 떨어져요.`, '#ffb36b');
  }
}

// 적이 이 병사를 노릴 수 있는가: 멀쩡한 성벽 위는 안전, 성 안은 무너진 틈을 통해서만
function reachable(e, s) {
  if (s.dead) return false;
  if (onWall(s) && segAt(s).hp > 0) return false;
  if (cls(e) === cls(s)) return true;
  return segAt(s).hp <= 0 || B.wallBySide[side(e)].some(w => w.hp <= 0);
}

// 간단한 격자 공간 분할
const CELL = 40;
function buildGrid(list) {
  const g = new Map();
  for (const o of list) {
    const k = ((o.x / CELL) | 0) + ',' + ((o.y / CELL) | 0);
    let a = g.get(k); if (!a) g.set(k, a = []); a.push(o);
  }
  return g;
}
function nearby(g, p, r, fn) {
  const x0 = ((p.x - r) / CELL) | 0, x1 = ((p.x + r) / CELL) | 0, y0 = ((p.y - r) / CELL) | 0, y1 = ((p.y + r) / CELL) | 0;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const a = g.get(x + ',' + y); if (a) for (const o of a) fn(o);
  }
}

function effRange(s) {
  return s.range * (s.T.kind !== 'melee' && onWall(s) ? 1.3 : 1);
}

// 돌려주는 대상이 아군이면 회복, 적이면 공격
function pickTarget(s, eGrid) {
  const T = s.T, m = s.squad.mods, f = s.squad.focus;
  if (T.kind === 'heal') {
    let best = null, bp = 0.95;
    for (const o of B.soldiers) {
      if (o.dead || o.hp / o.max >= bp || dist(s, o) > s.range) continue;
      bp = o.hp / o.max; best = o;
    }
    if (best || !m.canAttack) return best;
  }
  const slot = { x: s.slotX, y: s.slotY };
  if (f && !f.dead) {
    if (T.kind === 'melee' ? dist(f, slot) < 300 : dist(s, f) <= effRange(s)) return f;
  }
  if (s.moving) return null;
  const r = T.kind === 'melee' ? 90 : effRange(s);
  let best = null, score = Infinity;
  nearby(eGrid, s, r, e => {
    if (e.dead) return;
    const d = dist(s, e);
    if (d > r) return;
    // 근접병은 같은 쪽(성 안/밖)의 적을 쫓고, 성벽 너머 적은 손이 닿을 때만 친다
    if (T.kind === 'melee' && (dist(e, slot) > 150 || (cls(e) !== cls(s) && d > s.range + e.r))) return;
    const sc = m.tough && T.kind !== 'melee' ? -e.hp : d;  // 저격수는 체력 높은 적부터
    if (sc < score) { score = sc; best = e; }
  });
  // 본성이 공격받으면 근처 근접병은 자리를 벗어나서라도 막으러 간다
  if (!best && T.kind === 'melee') {
    let bd = 260;
    for (const e of B.enemies) {
      if (e.dead || dist(e, C) > C.keepR + 30 || cls(s) !== 'in') continue;
      const d = dist(s, e);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

function heal(s, t) {
  const amt = s.heal, m = s.squad.mods;
  t.hp = Math.min(t.max, t.hp + amt);
  s.squad.xp += amt * MG.HEAL_XP;
  B.fx.push({ kind: 'heal', x: t.x, y: t.y, t: 0.5, max: 0.5 });
  if (m.healAoe) for (const o of B.soldiers) if (o !== t && !o.dead && dist(o, t) < m.healAoe) o.hp = Math.min(o.max, o.hp + amt * 0.5);
}

function attack(s, t) {
  const T = s.T, sq = s.squad, m = sq.mods, dmg = s.atk * atkMult(s);
  if (T.kind === 'melee') {
    hitEnemy(t, dmg, sq);
    B.fx.push({ kind: 'hit', x: t.x, y: t.y, t: 0.15, max: 0.15 });
    if (m.cleave) for (const o of B.enemies) if (o !== t && !o.dead && dist(o, t) < 22) hitEnemy(o, dmg * m.cleave, sq);
    return;
  }
  const kind = T.kind === 'magic' ? 'fire' : T.kind === 'heal' ? 'holy' : 'arrow';
  const shoot = e => B.projectiles.push({ x: s.x, y: s.y, target: e, tx: e.x, ty: e.y, kind, src: sq,
    dmg: kind === 'holy' ? dmg * 0.6 : dmg, speed: kind === 'fire' ? 260 : kind === 'holy' ? 380 : 520, splash: s.splash });
  shoot(t);
  // 폭풍궁수: 다른 적에게 한 발 더
  for (let i = 1; i < m.multishot; i++) {
    const others = B.enemies.filter(o => o !== t && !o.dead && dist(s, o) <= effRange(s));
    if (others.length) shoot(others[(Math.random() * others.length) | 0]);
  }
}

function updateSoldier(s, dt, eGrid) {
  const T = s.T;
  s.cdT -= dt; s.retT -= dt; s.replanT -= dt;
  if (s.target && s.target.dead) s.target = null;
  if (s.retT <= 0) { s.retT = rand(0.25, 0.4); s.target = pickTarget(s, eGrid); }
  const t = s.target, sp = T.speed * dt;
  if (t) {
    const d = dist(s, t);
    if (t.squad) {
      if (d <= s.range && s.cdT <= 0) { s.cdT = s.cd; heal(s, t); }
    } else if (d <= effRange(s) + (t.r || 0)) {
      if (s.cdT <= 0) { s.cdT = s.cd; attack(s, t); }
      return;
    } else if (T.kind === 'melee' && !s.moving) {
      const leash = s.squad.focus === t || dist(t, C) < C.keepR + 40 ? 320 : 170;
      if (dist(t, { x: s.slotX, y: s.slotY }) < leash && stepToward(s, t.x, t.y, sp, false)) return;
      s.target = null;
    }
  }
  // 이동 경로 / 제자리 복귀
  if (s.path.length) {
    const p = s.path[0];
    if (dist(s, p) < 4) { s.path.shift(); s.stuckT = 0; }
    else if (stepToward(s, p.x, p.y, sp, false)) s.stuckT = 0;
    else if ((s.stuckT += dt) > 1) { s.path = planPath(s, { x: s.slotX, y: s.slotY }, false) || []; s.stuckT = 0; }
    if (!s.path.length) s.moving = false;
  } else {
    s.moving = false;
    const slot = { x: s.slotX, y: s.slotY };
    if (dist(s, slot) > 5 && s.replanT <= 0) {
      s.replanT = 0.6;
      s.path = planPath(s, slot, false) || [];
    }
  }
}

function attackWall(e, w) {
  if (e.cdT > 0) return;
  e.cdT = e.T.cd;
  if (w.hp <= 0) return;
  w.hp -= e.T.wallDmg;
  if (Math.random() < 0.3) B.fx.push({ kind: 'dust', x: e.x + rand(-4, 4), y: e.y + rand(-4, 4), t: 0.4, max: 0.4 });
  if (w.hp <= 0) breach(w);
}

function attackBuilding(e, b) {
  if (e.cdT > 0) return;
  e.cdT = e.T.cd;
  if (b.hp <= 0) return;
  b.hp -= e.T.wallDmg;
  if (Math.random() < 0.3) B.fx.push({ kind: 'dust', x: e.x + rand(-4, 4), y: e.y + rand(-4, 4), t: 0.4, max: 0.4 });
  if (b.hp > 0) return;
  b.hp = 0;
  markBuilding(b, 0);
  B.fieldDirty = true;
  log(`${MG.BUILDINGS[b.type].name}이(가) 부서졌어요!`, b.type === 'house' ? '#ff6b6b' : '#ffb36b');
}

// 성 안에 들어온 약탈자는 가장 가까운 건물을 노린다
function nearestBuilding(e) {
  let best = null, bd = 260;
  for (const b of B.buildings) {
    if (b.hp <= 0) continue;
    const dx = Math.max(b.x0 - e.x, 0, e.x - b.x1), dy = Math.max(b.y0 - e.y, 0, e.y - b.y1), d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function breach(w) {
  w.hp = 0;
  B.fieldDirty = true;
  const s = w.side;
  log(`${MG.SIDE_NAME[s]}쪽 ${w.gate ? '성문' : '성벽'}이 부서졌어요!`, '#ff6b6b');
  if (w.gate) return;
  // 직할 수비대는 멀쩡한 성벽 조각에 고르게 서 있다. 무너진 조각에 있던 몫이 성 안쪽 부대가 된다.
  const g = B.garrison[s], n = MG.NORMAL[s];
  const pieces = B.wallBySide[s].filter(x => !x.gate && x.hp > 0).length + 1;
  const ar = Math.round(g.archer / pieces), inf = Math.round(g.infantry / pieces);
  if (ar + inf <= 0) return;
  g.archer -= ar; g.infantry -= inf;
  const k = (B.garrisonSquads[s] = (B.garrisonSquads[s] || 0) + 1);
  const sq = makeSquad(`직할 수비대 (${MG.SIDE_NAME[s]}${k > 1 ? ' ' + k : ''})`, 'garrison', { garrison: true });
  const total = ar + inf;
  for (let i = 0; i < total; i++) {
    const p = segMid(w, C.R - C.T / 2), off = (i / Math.max(1, total - 1) - 0.5) * (w.a1 - w.a0) * 0.8;
    makeSoldier(sq, i < inf ? 'infantry' : 'archer', p.x - n.y * off, p.y + n.x * off);
  }
  sq.initial = total;
  const to = segMid(w, C.R - C.T - 45);
  MG.orderMove(sq, to.x, to.y, { x: n.x, y: n.y }, false);
}

function updateEnemy(e, dt, fGrid) {
  const T = e.T;
  e.cdT -= dt; e.retT -= dt; e.planT -= dt; e.hitT -= dt;
  if (e.burnT > 0) { e.burnT -= dt; damageEnemy(e, e.burnDps * dt, e.burnSrc); if (e.dead) return; }
  if (e.slowT > 0) e.slowT -= dt;
  if (e.frozenT > 0) { e.frozenT -= dt; return; }
  const sp = T.speed * dt * (e.slowT > 0 ? 1 - e.slowF : 1);
  if (e.target && !reachable(e, e.target)) e.target = null;
  if (T.aggro > 0 && e.retT <= 0) {
    e.retT = rand(0.3, 0.45);
    let best = null, bd = T.aggro;
    nearby(fGrid, e, T.aggro, s => { const d = dist(e, s); if (d < bd && reachable(e, s)) { bd = d; best = s; } });
    if (best) e.target = best;
    else if (e.target && dist(e, e.target) > T.aggro * 2) e.target = null;
  }
  if (e.target) {
    const t = e.target;
    if (dist(e, t) <= e.r + 10) {
      if (e.cdT <= 0) { e.cdT = T.cd; damageFriendly(t, T.atk); }
      return;
    }
    if (stepToward(e, t.x, t.y, sp, true)) return;
    e.target = null;
  }
  // 한 걸음 나아가되, 건물에 막히면 그 건물을 부순다
  const go = (tx, ty) => {
    if (stepToward(e, tx, ty, sp, true)) return true;
    const d = Math.hypot(tx - e.x, ty - e.y) || 1;
    const b = buildingAt({ x: e.x + (tx - e.x) / d * Math.max(sp, 3), y: e.y + (ty - e.y) / d * Math.max(sp, 3) });
    if (b) { attackBuilding(e, b); return true; }
    return false;
  };
  // 성 안: 약탈자는 가까운 건물부터, 나머지는 흐름장을 따라 본성으로
  if (cls(e) === 'in') {
    if (dist(e, C) <= C.keepR + e.r + 3) {
      if (e.cdT <= 0) {
        e.cdT = T.cd; B.keep.hp -= T.wallDmg;
        if (Math.random() < 0.3) B.fx.push({ kind: 'dust', x: e.x, y: e.y, t: 0.4, max: 0.4 });
      }
      return;
    }
    if (e.raider) {
      if (!e.prey || e.prey.hp <= 0) e.prey = nearestBuilding(e);
      const b = e.prey;
      if (b) {
        const px = Math.max(b.x0, Math.min(b.x1, e.x)), py = Math.max(b.y0, Math.min(b.y1, e.y));
        if (Math.hypot(px - e.x, py - e.y) <= e.r + 4) { attackBuilding(e, b); return; }
        if (go(px, py)) return;
        e.prey = null;
      }
    }
    const nx = fieldNext(e);
    if (!go(nx ? nx.x : C.x, nx ? nx.y : C.y)) {
      // 끼었으면 살짝 흔들어 빠져나온다
      const a = Math.random() * Math.PI * 2, q = { x: e.x + Math.cos(a) * 3, y: e.y + Math.sin(a) * 3 };
      if (canStep(e, q, true)) { e.x = q.x; e.y = q.y; }
    }
    return;
  }
  // 성 밖: 무너진 곳이 있으면 흐름장을 따라 그리로 돌아가고, 없으면 자기 진로의 성벽을 친다
  // (모서리에서 한 걸음이 막히면 아래로 내려가 앞의 성벽을 친다)
  if (B.walls.some(w => w.hp <= 0)) {
    const nx = fieldNext(e);
    if (nx && go(nx.x, nx.y)) return;
  }
  const n = MG.NORMAL[e.dir], perp = { x: -n.y, y: n.x };
  const tx = C.x + n.x * (C.R - 5) + perp.x * e.lane, ty = C.y + n.y * (C.R - 5) + perp.y * e.lane;
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
  const next = { x: e.x + dx / d * Math.max(sp, 2), y: e.y + dy / d * Math.max(sp, 2) };
  if (!stepToward(e, tx, ty, sp, true)) attackWall(e, segAt(next));
}

function separate(list, grid) {
  for (const a of list) {
    nearby(grid, a, 16, b => {
      if (b === a || b.dead) return;
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0 && d < min) {
        const push = (min - d) * 0.25, n = { x: a.x + dx / d * push, y: a.y + dy / d * push };
        if (canStep(a, n, true)) { a.x = n.x; a.y = n.y; }
      }
    });
  }
}

function updateGarrison(dt) {
  for (const s of MG.SIDES) {
    const g = B.garrison[s], live = B.wallBySide[s].filter(w => !w.gate && w.hp > 0);
    if (!live.length || g.archer + g.infantry === 0) continue;
    g.archT -= dt; g.infT -= dt;
    const zone = B.enemies.filter(e => !e.dead && cls(e) === 'out' && side(e) === s && cheb(e) - C.R < 200);
    if (!zone.length) continue;
    const mult = B.lordDead ? MG.LORD_DEAD_MULT : 1;
    if (g.archT <= 0 && g.archer > 0) {
      g.archT = MG.UNIT_TYPES.archer.cd;
      for (let i = 0; i < g.archer; i++) {
        const e = zone[(Math.random() * zone.length) | 0], w = live[i % live.length];
        const p = segMid(w, C.R - 6), off = rand(-0.4, 0.4) * (w.a1 - w.a0), n = MG.NORMAL[s];
        B.projectiles.push({ x: p.x - n.y * off, y: p.y + n.x * off,
          target: e, tx: e.x, ty: e.y, dmg: MG.UNIT_TYPES.archer.atk * mult, kind: 'arrow', speed: 520, splash: 0 });
      }
    }
    if (g.infT <= 0 && g.infantry > 0) {
      g.infT = MG.UNIT_TYPES.infantry.cd;
      const close = zone.filter(e => cheb(e) - C.R < 20 && segAt(e).hp > 0);
      for (let i = 0; i < g.infantry && close.length; i++) {
        const e = close[(Math.random() * close.length) | 0];
        damageEnemy(e, MG.UNIT_TYPES.infantry.atk * mult);
        if (i % 3 === 0) B.fx.push({ kind: 'hit', x: e.x, y: e.y, t: 0.15, max: 0.15 });
      }
    }
  }
}

function updateProjectiles(dt) {
  for (const p of B.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
    if (d <= step + 3) {
      p.done = true;
      if (p.kind === 'fire') {
        B.fx.push({ kind: 'boom', x: p.tx, y: p.ty, r: p.splash, t: 0.3, max: 0.3 });
        for (const e of B.enemies) if (!e.dead && dist(e, { x: p.tx, y: p.ty }) <= p.splash) hitEnemy(e, p.dmg, p.src);
      } else if (p.target && !p.target.dead) hitEnemy(p.target, p.dmg, p.src);
    } else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  B.projectiles = B.projectiles.filter(p => !p.done);
}

MG.update = function (dt) {
  if (B.phase !== 'battle') return;
  B.time += dt;
  while (B.spawnQueue.length && B.spawnQueue[0].t <= B.time) {
    const q = B.spawnQueue.shift();
    if (q.wave > B.wave) { B.wave = q.wave; log(`제${q.wave}파 습격! (${MG.SIDE_NAME[q.dir]}쪽)`, '#ffd36b'); }
    spawnEnemy(q);
  }
  if (B.fieldDirty) computeField();
  const eGrid = buildGrid(B.enemies), fGrid = buildGrid(B.soldiers);
  B.auras = [];
  for (const sq of B.squads) {
    const g = sq.general, m = sq.mods;
    if (g && !g.dead && (m.aura || m.auraDef)) B.auras.push({ s: g, atk: m.aura, def: m.auraDef });
  }
  for (const s of B.soldiers) if (!s.dead) updateSoldier(s, dt, eGrid);
  for (const e of B.enemies) if (!e.dead) updateEnemy(e, dt, fGrid);
  separate(B.enemies, eGrid);
  updateGarrison(dt);
  updateProjectiles(dt);

  B.enemies = B.enemies.filter(e => !e.dead);
  B.soldiers = B.soldiers.filter(s => !s.dead);
  for (const sq of B.squads) sq.soldiers = sq.soldiers.filter(s => !s.dead);
  for (const sq of B.squads.filter(q => !q.soldiers.length)) {
    log(`${sq.name}이(가) 전멸했어요.`, '#ff6b6b');
    B.selected.delete(sq);
  }
  B.squads = B.squads.filter(q => q.soldiers.length);

  for (const f of B.fx) { f.t -= dt; if (f.kind === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; } }
  B.fx = B.fx.filter(f => f.t > 0);
  for (const l of B.log) l.t -= dt;
  B.log = B.log.filter(l => l.t > 0);

  if (B.keep.hp <= 0) { B.keep.hp = 0; finish(false); }
  else if (!B.spawnQueue.length && !B.enemies.length) finish(true);
};

// 부상·경험치 같은 전투 후 처리는 캠페인이 맡는다 (MG.applyResult)
function finish(win) {
  B.phase = 'result';
  B.result = { win, lordDead: B.lordDead, time: B.time };
  if (MG.onBattleEnd) MG.onBattleEnd(B);
}

MG.startBattle = function () {
  if (B.phase !== 'prep') return;
  B.phase = 'battle';
  B.paused = false;
  log('전투 시작!', '#ffd36b');
};

MG.moveGarrison = function (s, kind, delta) {
  const g = B.garrison[s], pool = B.garrisonPool;
  if (delta > 0 && pool[kind] > 0) { pool[kind]--; g[kind]++; }
  if (delta < 0 && g[kind] > 0) { g[kind]--; pool[kind]++; }
};
})();
