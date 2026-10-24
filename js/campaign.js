// 캠페인 상태: 장수 성장, 내정(건물·민가·자원·달 턴), 병원, 습격 일정, 저장.
(() => {
const KEY = 'margrave_save_v2';
const pick = arr => arr[(Math.random() * arr.length) | 0];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(MG.S)); } catch (e) { /* 저장 불가 환경: 이번 세션만 유지 */ }
}
MG.saveCampaign = save;

MG.loadCampaign = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 2 && !s.over) return (MG.S = s);
  } catch (e) { /* 손상된 저장은 무시하고 새로 시작 */ }
  return null;
};

MG.newCampaign = () => {
  const s = MG.S = {
    version: 2, level: 1, month: 2, nextId: 1, over: false, ap: MG.AP_PER_MONTH,
    generals: [], lord: { name: MG.LORD.name, gen: 1 },
    garrison: { archer: MG.GARRISON.archer, infantry: MG.GARRISON.infantry, wounded: [] },
    res: { ...MG.START_RES }, pop: MG.START_POP, buildings: [], fields: [],
    walls: {}, keep: MG.KEEP_HP, nextAttack: null, report: [],
    inventory: [], stats: { battles: 0, wins: 0, kills: 0, generalsLost: 0, soldiersLost: 0 },
  };
  for (const a of MG.START_ARMY) {
    s.generals.push({ id: s.nextId++, name: a.general, type: a.type, baseLead: a.lead, slot: a.at,
      level: 1, xp: 0, cls: null, adv: false, weapon: null, injured: 0, dead: false,
      deploy: true, mobilize: false, healthy: a.lead * 10, wounded: [] });
  }
  for (const b of MG.START_BUILDINGS) placeBuilding(b.type, b.i, b.j);
  for (const f of MG.START_FIELDS) s.fields.push({ type: f, level: 1 });
  scheduleAttack(4);
  save();
  return s;
};

// ---------- 시간 ----------
MG.year = () => 1 + Math.floor(MG.S.month / 12);
MG.monthName = () => `${MG.year()}년차 ${MG.S.month % 12 + 1}월 (${MG.SEASON(MG.S.month)})`;

function scheduleAttack(gap) {
  const S = MG.S;
  if (gap == null) { const [a, b] = MG.attackGap(MG.year()); gap = randInt(a, b); }
  S.nextAttack = { month: S.month + gap, dirs: MG.rollDirs(S.level), scout: 0 };
}
MG.isAttackMonth = () => MG.S.nextAttack && MG.S.month >= MG.S.nextAttack.month;
// 정찰 전에는 ±1달 범위만 보인다
MG.attackForecast = () => {
  const A = MG.S.nextAttack, left = A.month - MG.S.month;
  if (left <= 0) return { text: '이번 달', exact: true };
  if (A.scout >= 1) return { text: `${left}개월 뒤`, exact: true };
  return { text: `약 ${Math.max(1, left - 1)}~${left + 1}개월 뒤`, exact: false };
};

// ---------- 건물 ----------
const B_ = () => MG.S.buildings;
MG.buildingAtCell = (i, j) => B_().find(b => i >= b.i && i < b.i + MG.BUILDINGS[b.type].w && j >= b.j && j < b.j + MG.BUILDINGS[b.type].h);
MG.canPlace = (type, i, j) => {
  const d = MG.BUILDINGS[type];
  for (let x = i; x < i + d.w; x++) for (let y = j; y < j + d.h; y++) {
    if (x >= MG.GRID.n || y >= MG.GRID.n || MG.reservedCell(x, y) || MG.buildingAtCell(x, y)) return false;
  }
  return true;
};
function placeBuilding(type, i, j) {
  const d = MG.BUILDINGS[type];
  const b = { id: MG.S.nextId++, type, i, j, level: 1, hp: d.hp, max: d.hp };
  MG.S.buildings.push(b);
  return b;
}
// 멀쩡한 건물 중 가장 높은 단계 (부서진 건물은 기능 없음)
MG.bLevel = type => B_().filter(b => b.type === type && b.hp > 0).reduce((m, b) => Math.max(m, b.level), 0);
MG.bSum = type => B_().filter(b => b.type === type && b.hp > 0).reduce((m, b) => m + b.level, 0);
MG.popCap = () => MG.bSum('house') * MG.HOUSE_POP;
MG.hospitalCap = () => MG.bSum('hospital') * MG.HOSPITAL_PER_LEVEL;
MG.storageCap = () => MG.STORAGE_BASE + MG.bSum('storage') * 1000;

MG.costOf = (base, level) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * level]));
MG.canPay = cost => Object.entries(cost).every(([k, v]) => MG.S.res[k] >= v);
const pay = cost => { for (const [k, v] of Object.entries(cost)) MG.S.res[k] -= v; };
MG.costText = cost => Object.entries(cost).map(([k, v]) => `${MG.RES[k]} ${Math.ceil(v)}`).join(' · ');

// 행동: 성공하면 null, 실패하면 이유를 돌려준다
function act(cost, fn) {
  const S = MG.S;
  if (S.ap <= 0) return '이번 달 행동력을 다 썼어요';
  if (cost && !MG.canPay(cost)) return '자원이 모자라요';
  if (cost) pay(cost);
  const why = fn();
  if (why) { if (cost) for (const [k, v] of Object.entries(cost)) S.res[k] += v; return why; }
  S.ap--;
  save();
  return null;
}

MG.actBuild = (type, i, j) => act(MG.BUILDINGS[type].cost, () => (MG.canPlace(type, i, j) ? (placeBuilding(type, i, j), null) : '여기에는 지을 수 없어요'));
MG.upgradeCost = b => MG.costOf(MG.BUILDINGS[b.type].cost, b.level + 1);
MG.actUpgrade = b => {
  if (b.level >= MG.BUILDINGS[b.type].max) return '최고 단계예요';
  if (b.hp <= 0) return '먼저 수리해야 해요';
  return act(MG.upgradeCost(b), () => { b.level++; b.max = Math.round(MG.BUILDINGS[b.type].hp * (1 + 0.3 * (b.level - 1))); b.hp = b.max; });
};
MG.actField = type => act(MG.FIELDS[type].cost, () => (MG.S.fields.length < MG.FIELD_SLOTS ? (MG.S.fields.push({ type, level: 1 }), null) : '들판에 빈자리가 없어요'));
MG.fieldUpgradeCost = f => MG.costOf(MG.FIELDS[f.type].cost, f.level + 1);
MG.actFieldUpgrade = f => (f.level >= MG.FIELDS[f.type].max ? '최고 단계예요' : act(MG.fieldUpgradeCost(f), () => { f.level++; }));

// 수리: 성벽·성문·본성·건물을 피해가 큰 곳부터, 한 번에 일정량까지
MG.damageList = () => {
  const S = MG.S, list = [];
  for (const [id, hp] of Object.entries(S.walls)) {
    const max = id[1] === '2' ? MG.GATE_HP : MG.WALL_SEG_HP;
    if (hp < max) list.push({ kind: 'wall', id, hp, max });
  }
  if (S.keep < MG.KEEP_HP) list.push({ kind: 'keep', hp: S.keep, max: MG.KEEP_HP });
  for (const b of S.buildings) if (b.hp < b.max) list.push({ kind: 'building', b, hp: b.hp, max: b.max });
  return list;
};
MG.repairNeed = () => Math.min(MG.REPAIR_PER_ACTION, MG.damageList().reduce((a, d) => a + d.max - d.hp, 0));
MG.repairCost = () => ({ wood: Math.ceil(MG.repairNeed() * MG.REPAIR_WOOD_PER_HP) });
MG.actRepair = () => {
  if (!MG.repairNeed()) return '고칠 곳이 없어요';
  return act(MG.repairCost(), () => {
    let left = MG.REPAIR_PER_ACTION;
    // 무너진 곳(체력 0)부터
    for (const d of MG.damageList().sort((a, b) => a.hp / a.max - b.hp / b.max)) {
      const add = Math.min(left, d.max - d.hp);
      left -= add;
      if (d.kind === 'wall') MG.S.walls[d.id] = d.hp + add;
      else if (d.kind === 'keep') MG.S.keep = d.hp + add;
      else d.b.hp = d.hp + add;
      if (left <= 0) break;
    }
    for (const [id, hp] of Object.entries(MG.S.walls)) if (hp >= (id[1] === '2' ? MG.GATE_HP : MG.WALL_SEG_HP)) delete MG.S.walls[id];
  });
};

// 모집: 병영 단계만큼, 주민 중에서. 장수 부대의 빈자리를 먼저 채우고, 남는 신병은 모두 성주 직할로 간다.
// 직할 병력에는 상한이 없다 — 병력은 식량으로만 제한된다 (설계 문서 4장).
// 마법사·사제 부대는 마법탑·사원이 있어야 채운다.
MG.MIN_POP = 10;  // 주민을 이보다 적게 남기며 뽑지는 않는다
MG.recruitCap = () => MG.bLevel('barracks') * 10;
MG.recruitTargets = () => {
  const list = [];
  for (const g of MG.S.generals) {
    if (g.dead) continue;
    if (g.type === 'mage' && !MG.bLevel('tower')) continue;
    if (g.type === 'priest' && !MG.bLevel('temple')) continue;
    const need = MG.genCap(g) - g.healthy - g.wounded.length;
    if (need > 0) list.push({ g, need });
  }
  return list;
};
MG.recruitAmount = () => Math.min(MG.recruitCap(), Math.max(0, MG.S.pop - MG.MIN_POP), Math.floor(MG.S.res.gold / MG.RECRUIT_GOLD));
MG.recruitCost = () => ({ gold: MG.recruitAmount() * MG.RECRUIT_GOLD });
MG.recruitPlan = () => {
  let left = MG.recruitAmount();
  const toSquads = MG.recruitTargets().reduce((a, t) => a + t.need, 0);
  const squads = Math.min(left, toSquads);
  return { total: left, squads, garrison: left - squads };
};
MG.actRecruit = () => {
  if (!MG.recruitCap()) return '병영이 없거나 부서졌어요';
  if (MG.S.pop <= MG.MIN_POP) return '주민이 너무 적어요';
  const n = MG.recruitAmount();
  if (!n) return '골드가 모자라요';
  return act(MG.recruitCost(), () => {
    let pool = n;
    const targets = MG.recruitTargets();
    while (pool > 0) {
      const t = targets.filter(x => x.need > 0).sort((a, b) => b.need - a.need)[0];
      if (!t) break;
      t.g.healthy++; t.need--; pool--;
    }
    // 남는 신병은 성주 직할 (궁수·보병을 번갈아)
    const gar = MG.S.garrison;
    for (; pool > 0; pool--) { if (gar.archer <= gar.infantry) gar.archer++; else gar.infantry++; }
    MG.S.pop -= n;
  });
};

MG.actTrain = () => {
  const l = MG.bLevel('training');
  if (!l) return '훈련장이 없어요';
  return act(null, () => { for (const g of MG.S.generals) if (!g.dead && !g.injured) addXp(g, 30 * l); });
};

MG.actScout = () => (MG.S.nextAttack.scout >= 2 ? '더 알아낼 것이 없어요' : act({ gold: 20 }, () => { MG.S.nextAttack.scout++; }));

MG.actCraft = () => {
  const l = MG.bLevel('smithy');
  if (!l) return '대장간이 없어요';
  let w;
  const why = act(MG.CRAFT_COST, () => { w = rollWeapon(MG.S.level, l); MG.S.inventory.push(w); });
  return why || `${MG.WEAPON_GRADES[w.grade].name} ${w.name}을(를) 만들었어요`;
};

// ---------- 한 달 마치기 ----------
MG.production = () => {
  const S = MG.S, season = MG.SEASON(S.month), mul = MG.SEASON_PROD[season], out = { gold: 0, food: 0, wood: 0, iron: 0 };
  for (const f of S.fields) for (const [k, v] of Object.entries(MG.FIELDS[f.type].prod)) out[k] += v * f.level * (mul[k] != null ? mul[k] : 1);
  out.gold += Math.floor(S.pop * MG.TAX_PER_POP) + MG.bSum('market') * 40;
  const soldiers = S.generals.reduce((a, g) => a + (g.dead ? g.healthy : g.healthy + g.wounded.length + 1), 0)
    + S.garrison.archer + S.garrison.infantry + S.garrison.wounded.length + MG.LORD.guards;
  out.food -= Math.ceil(soldiers * MG.FOOD_PER_SOLDIER + S.pop * MG.FOOD_PER_POP);
  return out;
};

MG.endMonth = () => {
  const S = MG.S, rep = [];
  const prod = MG.production(), cap = MG.storageCap();
  for (const k of Object.keys(prod)) S.res[k] = Math.min(cap, S.res[k] + prod[k]);
  rep.push(`수입: ${Object.entries(prod).map(([k, v]) => `${MG.RES[k]} ${v >= 0 ? '+' : ''}${Math.round(v)}`).join(' · ')}`);
  if (S.res.food < 0) {
    S.res.food = 0;
    // 굶주림: 주민이 떠나고 병사 일부가 탈영한다
    const leave = Math.ceil(S.pop * 0.1);
    S.pop -= leave;
    let desert = 0;
    for (const g of S.generals) if (!g.dead && g.healthy > 0) { const d = Math.ceil(g.healthy * 0.05); g.healthy -= d; desert += d; }
    rep.push(`식량이 바닥났어요! 주민 ${leave}명이 떠나고 병사 ${desert}명이 탈영했어요.`);
    S.starving = true;
  } else S.starving = false;
  const room = MG.popCap() - S.pop;
  if (room > 0 && !S.starving) {
    const grow = Math.min(room, Math.max(2, Math.round(S.pop * MG.POP_GROWTH)));
    S.pop += grow;
    rep.push(`주민 +${grow}명 (${S.pop} / ${MG.popCap()})`);
  } else if (room < 0) {
    S.pop = MG.popCap();
    rep.push('집이 모자라 주민 일부가 떠났어요.');
  }
  // 사원이 있으면 본성이 조금씩 회복된다 (설계 문서 3장)
  if (MG.bLevel('temple') && S.keep < MG.KEEP_HP) {
    const heal = Math.min(MG.KEEP_HP - S.keep, MG.TEMPLE_KEEP_HEAL * MG.bLevel('temple'));
    S.keep += heal;
    rep.push(`사원의 기도로 본성이 ${heal} 회복했어요.`);
  }
  const rec = tickHospital();
  if (rec) rep.push(`병원에서 ${rec}명이 회복했어요.`);
  if (MG.bLevel('watch') && S.nextAttack) {
    const before = S.nextAttack.scout;
    S.nextAttack.scout = Math.max(S.nextAttack.scout, MG.bLevel('watch') >= 2 ? 2 : 1);
    if (S.nextAttack.scout > before) rep.push('감시탑이 다음 습격을 알아냈어요.');
  }
  S.month++;
  S.ap = MG.AP_PER_MONTH;
  S.report = rep;
  save();
  return rep;
};

// ---------- 장수 ----------
MG.genLead = g => g.baseLead + (g.level >= 5 ? 1 : 0) + (g.level >= 10 ? 1 : 0);
MG.genCap = g => MG.genLead(g) * 10;
MG.genClass = g => (g.cls ? (g.adv ? MG.CLASSES[g.type][g.cls].lv10 : MG.CLASSES[g.type][g.cls]) : null);
MG.genTitle = g => (MG.genClass(g) || MG.UNIT_TYPES[g.type]).name;
MG.genMods = g => MG.combineMods([MG.genClass(g) && MG.genClass(g).mods, ...(g.weapon ? g.weapon.opts.map(o => MG.WEAPON_OPTS[o].mods) : [])]);
MG.canClass = g => !g.dead && g.level >= 5 && !g.cls;
MG.canAdvance = g => !g.dead && g.level >= 10 && g.cls && !g.adv;

MG.chooseClass = (g, key) => { if (MG.canClass(g)) { g.cls = key; save(); } };
MG.advanceClass = g => { if (MG.canAdvance(g)) { g.adv = true; save(); } };

function addXp(g, n) {
  const from = g.level;
  g.xp += n;
  while (g.level < MG.MAX_LEVEL && g.xp >= MG.xpToNext(g.level)) { g.xp -= MG.xpToNext(g.level); g.level++; }
  if (g.level >= MG.MAX_LEVEL) g.xp = 0;
  return from;
}

// ---------- 무기 ----------
MG.equip = (g, weaponId) => {
  const S = MG.S, i = S.inventory.findIndex(w => w.id === weaponId);
  if (i < 0 || S.inventory[i].type !== g.type) return;
  const w = S.inventory.splice(i, 1)[0];
  if (g.weapon) S.inventory.push(g.weapon);
  g.weapon = w;
  save();
};
MG.unequip = g => { if (g.weapon) { MG.S.inventory.push(g.weapon); g.weapon = null; save(); } };

// smithy: 대장간 단계(제작일 때). 단계가 높을수록 좋은 등급이 나온다.
function rollWeapon(level, smithy) {
  const r = Math.random();
  let grade;
  if (smithy) grade = smithy === 1 ? (r < 0.7 ? 'common' : 'rare') : smithy === 2 ? (r < 0.7 ? 'rare' : 'heroic') : (r < 0.75 ? 'heroic' : 'legendary');
  else grade = r < 0.03 + 0.01 * level ? 'legendary' : r < 0.15 + 0.03 * level ? 'heroic' : r < 0.45 + 0.03 * level ? 'rare' : 'common';
  const type = pick(Object.keys(MG.WEAPON_KINDS)), kind = pick(MG.WEAPON_KINDS[type]);
  const opts = Object.keys(MG.WEAPON_OPTS).sort(() => Math.random() - 0.5).slice(0, MG.WEAPON_GRADES[grade].opts);
  const name = grade === 'legendary' ? `전설의 ${kind}` : opts.length ? `${MG.WEAPON_OPTS[opts[0]].name}의 ${kind}` : kind;
  return { id: MG.S.nextId++, name, type, grade, opts };
}
MG.weaponDesc = w => {
  const g = MG.WEAPON_GRADES[w.grade];
  return [`장수 공격력 ×${g.atk}`, ...w.opts.map(o => MG.WEAPON_OPTS[o].desc)].join(' · ');
};

// ---------- 병원 ----------
// 장수 먼저, 그다음 들어온 순서대로 수용 인원만큼만 회복이 진행된다
MG.patients = () => {
  const S = MG.S, list = [];
  for (const g of S.generals) if (!g.dead && g.injured > 0) list.push({ kind: 'general', g });
  for (const g of S.generals) if (!g.dead) for (const w of g.wounded) list.push({ kind: 'soldier', w, g });
  for (const w of S.garrison.wounded) list.push({ kind: 'garrison', w });
  return list;
};

function tickHospital() {
  const S = MG.S;
  let cap = MG.hospitalCap(), recovered = 0;
  for (const p of MG.patients()) {
    if (cap-- <= 0) break;
    if (p.kind === 'general') { if (--p.g.injured === 0) { p.g.deploy = true; recovered++; } }
    else p.w.left--;
  }
  for (const g of S.generals) {
    const back = g.wounded.filter(w => w.left <= 0).length;
    g.healthy += back; recovered += back;
    g.wounded = g.wounded.filter(w => w.left > 0);
    if (!g.wounded.length) g.mobilize = false;
  }
  for (const w of S.garrison.wounded) if (w.left <= 0) { S.garrison[w.type]++; recovered++; }
  S.garrison.wounded = S.garrison.wounded.filter(w => w.left > 0);
  return recovered;
}

function rollWound(prev) {
  const t = MG.WOUND_ROLL[prev || 'none'], r = Math.random();
  return r < t.light ? 'light' : r < t.light + t.heavy ? 'heavy' : 'dead';
}
// 경상 1개월, 중상 3~6개월 (설계 문서 4장)
const newWound = sev => ({ sev, left: sev === 'light' ? 1 : randInt(3, 6) });

// ---------- 전투 준비 ----------
// 전투에 나갈 구성. 저장 상태는 건드리지 않는다(전투 중 새로고침하면 전투 전으로 돌아감).
MG.buildRoster = () => {
  const S = MG.S, squads = [];
  const train = 1 + 0.03 * MG.bLevel('training');
  const typeMods = { mage: { atk: 1 + 0.1 * MG.bLevel('tower') }, priest: { heal: 1 + 0.1 * MG.bLevel('temple') } };
  for (const g of S.generals) {
    const withGeneral = !g.dead && g.deploy;
    const mob = g.mobilize ? g.wounded.map((w, idx) => ({ idx, sev: w.sev })) : [];
    if (!withGeneral && g.healthy + mob.length === 0) continue;
    squads.push({ gid: g.id, name: g.name, type: g.type, slot: g.slot, title: MG.genTitle(g),
      general: withGeneral ? { name: g.name, injured: g.injured > 0 } : null,
      healthy: g.healthy, mob, level: g.level, train,
      mods: MG.combineMods([MG.genMods(g), typeMods[g.type]]),
      weaponAtk: g.weapon ? MG.WEAPON_GRADES[g.weapon.grade].atk : 1 });
  }
  return {
    squads, lord: { name: S.lord.name }, garrison: { archer: S.garrison.archer, infantry: S.garrison.infantry },
    walls: { ...S.walls }, keep: S.keep, morale: S.starving ? MG.STARVE_MULT : 1,
    buildings: S.buildings.map(b => ({ ...b })), fields: S.fields.map(f => ({ ...f })),
    dirs: S.nextAttack.dirs,
  };
};

// ---------- 전투 결과 반영 ----------
MG.applyResult = B => {
  const S = MG.S, R = B.roster, sum = { gens: [], wound: { light: 0, heavy: 0, dead: 0 }, weapon: null, heir: null, lostPop: 0, ruined: [] };
  const fallenOf = gid => B.stats.fallen.filter(f => f.gid === gid);

  for (const rs of R.squads) {
    const g = S.generals.find(x => x.id === rs.gid);
    const sq = B.allSquads.find(q => q.gid === rs.gid);
    const alive = sq ? sq.soldiers.filter(s => !s.dead) : [];
    const mobbed = new Set(rs.mob.map(m => m.idx));
    const wounded = g.wounded.filter((w, i) => !mobbed.has(i));
    for (const s of alive) if (s.wound) wounded.push(g.wounded[s.wound.idx]);
    g.healthy = alive.filter(s => !s.wound && !s.isGeneral).length;
    for (const f of fallenOf(rs.gid)) {
      if (f.general) continue;
      const r = rollWound(f.wound && f.wound.sev);
      sum.wound[r]++;
      if (r === 'dead') S.stats.soldiersLost++; else wounded.push(newWound(r));
    }
    g.wounded = wounded;
    if (!rs.general) continue;
    const fell = fallenOf(rs.gid).some(f => f.general);
    const line = { name: g.name, from: g.level, to: g.level, xp: 0, status: '생존' };
    if (fell && rs.general.injured) {
      g.dead = true; g.deploy = false; S.stats.generalsLost++;
      line.status = '전사';
    } else {
      if (fell) { g.injured = randInt(2, 4); g.deploy = false; line.status = `부상 (${g.injured}개월)`; }
      line.xp = Math.round((sq ? sq.xp : 0) + (fell ? 0 : MG.SURVIVE_XP));
      addXp(g, line.xp);
      line.to = g.level;
    }
    sum.gens.push(line);
  }

  // 직할 수비대: 성벽에 남은 병력 + 수비대 부대로 바뀐 생존자
  const gar = S.garrison;
  gar.archer = 0; gar.infantry = 0;
  for (const s of MG.SIDES) { gar.archer += B.garrison[s].archer; gar.infantry += B.garrison[s].infantry; }
  for (const q of B.allSquads) if (q.isGarrison) for (const s of q.soldiers) if (!s.dead) gar[s.type]++;
  for (const f of B.stats.fallen) {
    if (!f.garrison) continue;
    const r = rollWound(null);
    sum.wound[r]++;
    if (r === 'dead') S.stats.soldiersLost++; else gar.wounded.push({ type: f.type, ...newWound(r) });
  }

  // 성벽·본성·건물 피해는 다음 전투까지 남는다 (수리 전까지)
  S.walls = {};
  for (const w of B.walls) if (w.hp < w.max) S.walls[w.id] = Math.max(0, Math.round(w.hp));
  S.keep = Math.max(1, Math.round(B.keep.hp));
  for (const bb of B.buildings) {
    const b = S.buildings.find(x => x.id === bb.id);
    if (!b) continue;
    const was = b.hp;
    b.hp = Math.max(0, Math.round(bb.hp));
    if (was > 0 && b.hp <= 0) {
      sum.ruined.push(MG.BUILDINGS[b.type].name);
      if (b.type === 'house') { const lost = Math.min(S.pop, MG.HOUSE_POP * b.level); S.pop -= lost; sum.lostPop += lost; }
    }
  }

  if (B.lordDead) {
    // 혈족 후계(자녀 랜덤 출생)는 3b. 지금은 이름만 바뀐 후계자가 잇는다.
    const name = pick(MG.HEIR_NAMES.filter(n => !S.lord.name.endsWith(n)));
    sum.heir = { old: S.lord.name, name: `변경백 ${name}` };
    S.lord = { name: sum.heir.name, gen: S.lord.gen + 1 };
  }

  S.stats.battles++;
  S.stats.kills += B.stats.kills;
  if (!B.result.win) {
    S.over = true;
  } else {
    S.stats.wins++;
    sum.weapon = rollWeapon(S.level);
    S.inventory.push(sum.weapon);
    S.level++;
    scheduleAttack();
  }
  save();
  return sum;
};

MG.resetCampaign = () => {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  return MG.newCampaign();
};
})();
