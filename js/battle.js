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

// 성벽 경계(바깥 테두리)를 넘을 수 있는지: 무너진 조각은 누구나, 멀쩡한 성문은 아군만
function canStep(a, b, enemy) {
  const ca = cls(a), cb = cls(b);
  if (ca === cb) return true;
  const w = segAt(ca === 'in' ? a : b);
  if (w.hp <= 0) return true;
  return !enemy && w.gate;
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

// 성 모서리와 지나갈 수 있는 틈(성문, 무너진 조각) 안팎을 노드로 하는 작은 그래프에서 최단 경로
function planPath(a, b, enemy) {
  if (segOK(a, b, enemy)) return [{ x: b.x, y: b.y }];
  const o = C.R + 22, inn = C.R - C.T - 18;
  const nodes = [a, b,
    { x: C.x - o, y: C.y - o }, { x: C.x + o, y: C.y - o }, { x: C.x + o, y: C.y + o }, { x: C.x - o, y: C.y + o }];
  for (const w of B.walls) {
    if (w.hp > 0 && (enemy || !w.gate)) continue;
    nodes.push(segMid(w, o), segMid(w, inn));
  }
  const N = nodes.length, d = Array(N).fill(Infinity), prev = Array(N).fill(-1), done = Array(N).fill(false);
  d[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < N; v++) {
      if (done[v] || v === u) continue;
      const w = dist(nodes[u], nodes[v]);
      if (d[u] + w < d[v] && segOK(nodes[u], nodes[v], enemy)) { d[v] = d[u] + w; prev[v] = u; }
    }
  }
  if (d[1] === Infinity) return null;
  const path = [];
  for (let v = 1; v > 0; v = prev[v]) path.unshift({ x: nodes[v].x, y: nodes[v].y });
  return path;
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
function makeSoldier(squad, type, x, y, opts = {}) {
  const T = MG.UNIT_TYPES[type];
  const hpMul = opts.general ? MG.GENERAL_MULT.hp : 1;
  const hp = opts.hp || T.hp * hpMul;
  const s = { id: B.nextId++, squad, type, T, x, y, hp, max: hp,
    atk: opts.atk || T.atk * (opts.general ? MG.GENERAL_MULT.atk : 1),
    cdT: rand(0, T.cd), retT: rand(0, 0.3), target: null, path: [], slotX: x, slotY: y,
    moving: false, stuckT: 0, replanT: 0, isGeneral: !!opts.general, isLord: !!opts.lord, name: opts.name || null, dead: false };
  squad.soldiers.push(s);
  B.soldiers.push(s);
  return s;
}

function makeSquad(name, type, opts = {}) {
  const sq = { id: B.nextId++, name, type, soldiers: [], general: null, focus: null, anchor: null,
    facing: { x: 0, y: -1 }, leaderDown: false, isLord: !!opts.lord, isGarrison: !!opts.garrison, initial: 0 };
  B.squads.push(sq);
  return sq;
}

MG.createBattle = function (level) {
  const waves = MG.buildWaves(level);
  B = MG.B = {
    level, phase: 'prep', time: 0, speed: 1, paused: false, nextId: 1,
    keep: { hp: MG.KEEP_HP, max: MG.KEEP_HP },
    squads: [], soldiers: [], enemies: [], projectiles: [], fx: [], log: [],
    garrison: {}, garrisonSquads: {}, garrisonPool: { archer: 0, infantry: 0 }, groups: {}, selected: new Set(),
    waves: waves.groups, dirs: waves.dirs, spawnQueue: [], wave: 0,
    stats: { kills: 0, fallen: [], spawned: 0 }, lordDead: false, lord: null, result: null,
  };
  B.walls = []; B.wallBySide = {};
  const g = C.gateHalf, spans = [[-C.R, -C.R / 2], [-C.R / 2, -g], [-g, g], [g, C.R / 2], [C.R / 2, C.R]];
  for (const s of MG.SIDES) {
    B.wallBySide[s] = spans.map(([a0, a1], i) => {
      const gate = i === 2, max = gate ? MG.GATE_HP : MG.WALL_SEG_HP;
      const w = { id: s + i, side: s, a0, a1, gate, hp: max, max };
      B.walls.push(w);
      return w;
    });
    B.garrison[s] = { archer: MG.GARRISON.archer / 4, infantry: MG.GARRISON.infantry / 4, archT: rand(0, 1), infT: rand(0, 1) };
  }
  for (const a of MG.START_ARMY) {
    const sq = makeSquad(`${a.general} 부대`, a.type);
    const x = C.x + a.at.x, y = C.y + a.at.y;
    sq.general = makeSoldier(sq, a.type, x, y, { general: true, name: a.general });
    for (let i = 0; i < a.lead * 10; i++) makeSoldier(sq, a.type, x, y);
    sq.initial = sq.soldiers.length;
    MG.orderMove(sq, x, y, { x: 0, y: -1 }, true);
  }
  const L = MG.LORD, lsq = makeSquad('성주 근위대', 'guard', { lord: true });
  const lx = C.x + L.at.x, ly = C.y + L.at.y;
  B.lord = lsq.general = makeSoldier(lsq, 'guard', lx, ly, { lord: true, name: L.name, hp: L.hp, atk: L.atk });
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
        lane: Math.max(-C.R * 0.92, Math.min(C.R * 0.92, l)), hpScale });
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
    s.slotX = slots[i].x; s.slotY = slots[i].y;
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
  B.enemies.push({ id: B.nextId++, type: q.type, T, x, y, hp, max: hp, r: T.r, lane: q.lane, dir: q.dir,
    cdT: rand(0, T.cd), retT: rand(0, 0.3), planT: rand(0, 1), target: null, path: null, hitT: 0, dead: false });
  B.stats.spawned++;
}

function atkMult(s) {
  let m = 1;
  if (s.squad.leaderDown && !s.isGeneral) m *= MG.LEADER_DOWN_MULT;
  if (B.lordDead) m *= MG.LORD_DEAD_MULT;
  else if (B.lord && !s.isLord && dist(s, B.lord) < MG.LORD.aura) m *= 1 + MG.LORD.auraBonus;
  return m;
}

function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg; e.hitT = 0.1;
  if (e.hp <= 0) {
    e.dead = true; B.stats.kills++;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      B.fx.push({ kind: 'p', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.45, max: 0.45, color: e.T.color });
    }
  }
}

function damageFriendly(s, dmg) {
  if (s.dead) return;
  s.hp -= dmg;
  if (s.hp > 0) return;
  s.dead = true;
  const sq = s.squad;
  B.stats.fallen.push({ name: s.name, type: s.type, squad: sq.name, general: s.isGeneral, lord: s.isLord });
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
  return s.T.range * (s.T.kind !== 'melee' && onWall(s) ? 1.3 : 1);
}

function pickTarget(s, eGrid) {
  const T = s.T, f = s.squad.focus;
  if (T.kind === 'heal') {
    let best = null, bp = 0.95;
    for (const o of B.soldiers) {
      if (o.dead || o.hp / o.max >= bp || dist(s, o) > T.range) continue;
      bp = o.hp / o.max; best = o;
    }
    return best;
  }
  const slot = { x: s.slotX, y: s.slotY };
  if (f && !f.dead) {
    if (T.kind === 'melee' ? dist(f, slot) < 300 : dist(s, f) <= effRange(s)) return f;
  }
  if (s.moving) return null;
  const r = T.kind === 'melee' ? 90 : effRange(s);
  let best = null, bd = Infinity;
  nearby(eGrid, s, r, e => {
    if (e.dead) return;
    const d = dist(s, e);
    if (d > r || d >= bd) return;
    // 근접병은 같은 쪽(성 안/밖)의 적을 쫓고, 성벽 너머 적은 손이 닿을 때만 친다
    if (T.kind === 'melee' && (dist(e, slot) > 150 ||(cls(e) !== cls(s) && d > T.range + e.r))) return;
    bd = d; best = e;
  });
  // 본성이 공격받으면 근처 근접병은 자리를 벗어나서라도 막으러 간다
  if (!best && T.kind === 'melee') {
    bd = 260;
    for (const e of B.enemies) {
      if (e.dead || dist(e, C) > C.keepR + 30 || cls(s) !== 'in') continue;
      const d = dist(s, e);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

function updateSoldier(s, dt, eGrid) {
  const T = s.T;
  s.cdT -= dt; s.retT -= dt; s.replanT -= dt;
  if (s.target && s.target.dead) s.target = null;
  if (s.retT <= 0) { s.retT = rand(0.25, 0.4); s.target = pickTarget(s, eGrid); }
  const t = s.target, sp = T.speed * dt;
  if (t) {
    const d = dist(s, t);
    if (T.kind === 'heal') {
      if (d <= T.range && s.cdT <= 0) {
        s.cdT = T.cd;
        t.hp = Math.min(t.max, t.hp + s.atk);
        B.fx.push({ kind: 'heal', x: t.x, y: t.y, t: 0.5, max: 0.5 });
      }
    } else if (d <= effRange(s) + (t.r || 0)) {
      if (s.cdT <= 0) {
        s.cdT = T.cd;
        const dmg = s.atk * atkMult(s);
        if (T.kind === 'melee') { damageEnemy(t, dmg); B.fx.push({ kind: 'hit', x: t.x, y: t.y, t: 0.15, max: 0.15 }); }
        else B.projectiles.push({ x: s.x, y: s.y, target: t, tx: t.x, ty: t.y, dmg, kind: T.kind === 'magic' ? 'fire' : 'arrow',
          speed: T.kind === 'magic' ? 260 : 520, splash: T.splash || 0 });
      }
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

function breach(w) {
  w.hp = 0;
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
  const T = e.T, sp = T.speed * dt;
  e.cdT -= dt; e.retT -= dt; e.planT -= dt; e.hitT -= dt;
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
  // 성 안: 본성으로
  if (cls(e) === 'in') {
    e.path = null;
    if (dist(e, C) <= C.keepR + e.r + 3) {
      if (e.cdT <= 0) {
        e.cdT = T.cd; B.keep.hp -= T.wallDmg;
        if (Math.random() < 0.3) B.fx.push({ kind: 'dust', x: e.x, y: e.y, t: 0.4, max: 0.4 });
      }
    } else stepToward(e, C.x, C.y, sp, true);
    return;
  }
  // 성 밖: 무너진 구역이 있으면 그리로 돌아가고, 없으면 자기 진로의 성벽을 친다
  if (e.planT <= 0) {
    e.planT = rand(1.2, 1.8);
    e.path = B.walls.some(w => w.hp <= 0) ? planPath(e, C, true) : null;
  }
  if (e.path && e.path.length) {
    const p = e.path[0];
    if (dist(e, p) < 6) e.path.shift();
    else if (!stepToward(e, p.x, p.y, sp, true)) e.path = null;
    return;
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
        for (const e of B.enemies) if (!e.dead && dist(e, { x: p.tx, y: p.ty }) <= p.splash) damageEnemy(e, p.dmg);
      } else if (p.target && !p.target.dead) damageEnemy(p.target, p.dmg);
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
  const eGrid = buildGrid(B.enemies), fGrid = buildGrid(B.soldiers);
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

// 쓰러진 일반 병사는 전투 후 확률로 경상·중상·사망 (설계 문서 4장)
function finish(win) {
  B.phase = 'result';
  const roll = { light: 0, heavy: 0, dead: 0 };
  const generals = [];
  for (const f of B.stats.fallen) {
    if (f.lord) continue;
    if (f.general) { generals.push(f.name); continue; }
    const r = Math.random();
    if (r < 0.5) roll.light++; else if (r < 0.8) roll.heavy++; else roll.dead++;
  }
  B.result = { win, roll, generals, lordDead: B.lordDead, time: B.time };
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
