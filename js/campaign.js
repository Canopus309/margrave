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
    if (s && s.version === 2 && !s.over) { MG.S = s; migrate(s); return s; }
  } catch (e) { /* 손상된 저장은 무시하고 새로 시작 */ }
  return null;
};

// ---------- 장수 만들기 ----------
function usedNames() {
  const S = MG.S;
  return new Set([S.lord.given, ...S.generals.map(g => g.name), ...(S.family || []).map(c => c.name), ...(S.tavern || []).map(t => t.g.name)]);
}
MG.randomName = () => {
  const used = usedNames(), free = MG.GIVEN_NAMES.filter(n => !used.has(n));
  return free.length ? pick(free) : `${pick(MG.GIVEN_NAMES)} ${randInt(2, 9)}세`;
};
// 좋은 특성 1개(30%는 2개), 20% 확률로 단점 1개
MG.rollTraits = () => {
  const good = Object.keys(MG.TRAITS).filter(k => !MG.TRAITS[k].bad).sort(() => Math.random() - 0.5);
  const bad = Object.keys(MG.TRAITS).filter(k => MG.TRAITS[k].bad);
  const t = good.slice(0, Math.random() < 0.3 ? 2 : 1);
  if (Math.random() < 0.2) t.push(pick(bad));
  return t;
};
function newGeneral(o) {
  return { id: MG.S.nextId++, name: o.name || MG.randomName(), type: o.type, baseLead: o.lead || 1,
    level: o.level || 1, xp: 0, cls: null, adv: false, weapon: null, injured: 0, dead: false,
    deploy: true, mobilize: false, healthy: o.healthy || 0, wounded: [],
    age: o.age || randInt(20, 35), traits: o.traits || MG.rollTraits(), blood: !!o.blood };
}

// 예전 저장에 없는 값을 채운다 (나이·특성·가문·주점)
function migrate(s) {
  if (!s.lord.given) s.lord = { given: MG.FAMILY_NAME, name: s.lord.name, gen: s.lord.gen || 1, age: MG.LORD_START_AGE, level: 1, traits: [], minor: false };
  for (const g of s.generals) {
    if (g.age == null) g.age = randInt(22, 38);
    if (!g.traits) g.traits = MG.rollTraits();
  }
  if (!s.family) s.family = [];
  if (!s.tavern) s.tavern = [];
  if (s.retired == null) s.retired = 0;
  if (s.crown == null) s.crown = MG.CROWN_START;
  if (!s.sites) { MG.S = s; rollSites(); }
}

MG.newCampaign = () => {
  const s = MG.S = {
    version: 2, level: 1, month: 2, nextId: 1, over: false, ap: MG.AP_PER_MONTH,
    generals: [], lord: { given: MG.FAMILY_NAME, name: MG.LORD.name, gen: 1, age: MG.LORD_START_AGE, level: 1, traits: [], minor: false },
    family: [], tavern: [], retired: 0, pendingSuccession: false,
    crown: MG.CROWN_START, sites: [], event: null, support: null,
    garrison: { archer: MG.GARRISON.archer, infantry: MG.GARRISON.infantry, wounded: [] },
    res: { ...MG.START_RES }, pop: MG.START_POP, buildings: [], fields: [],
    walls: {}, keep: MG.KEEP_HP, nextAttack: null, report: [],
    inventory: [], stats: { battles: 0, wins: 0, kills: 0, generalsLost: 0, soldiersLost: 0 },
  };
  const ages = [34, 26, 22, 41];
  MG.START_ARMY.forEach((a, i) => {
    s.generals.push(newGeneral({ name: a.general, type: a.type, lead: a.lead, healthy: a.lead * 10, age: ages[i] }));
  });
  for (const b of MG.START_BUILDINGS) placeBuilding(b.type, b.i, b.j);
  for (const f of MG.START_FIELDS) s.fields.push({ type: f, level: 1 });
  MG.ensureMarket();
  scheduleAttack(4);
  rollSites();
  save();
  return s;
};

// ---------- 가문과 후계 ----------
// 후계 후보는 혈족뿐: 장수가 된 자녀와 아직 어린 자녀
MG.heirs = () => [
  ...MG.S.generals.filter(g => g.blood && !g.dead).map(g => ({ kind: 'general', id: g.id, name: g.name, age: g.age, level: g.level, traits: g.traits })),
  ...MG.S.family.map(c => ({ kind: 'child', id: c.id, name: c.name, age: c.age, level: 1, traits: c.traits })),
];

// 장수가 부대를 떠나면(후계·은퇴) 그 병사들은 성주 직할로 간다
function disband(g) {
  const S = MG.S, kind = g.type === 'archer' ? 'archer' : 'infantry';
  S.garrison[kind] += g.healthy;
  for (const w of g.wounded) S.garrison.wounded.push({ type: kind, sev: w.sev, left: w.left });
  if (g.weapon) S.inventory.push(g.weapon);
  S.generals = S.generals.filter(x => x !== g);
}

function lordDied(rep, why) {
  const S = MG.S;
  rep.push(`${S.lord.name}이(가) ${why}`);
  if (MG.heirs().length) S.pendingSuccession = true;
  else { S.over = true; S.overReason = '가문 단절'; rep.push('이을 혈족이 없어 가문이 끊겼어요.'); }
}

MG.chooseHeir = (kind, id) => {
  const S = MG.S, gen = S.lord.gen + 1;
  if (kind === 'general') {
    const g = S.generals.find(x => x.id === id);
    if (!g) return;
    S.lord = { given: g.name, name: `변경백 ${g.name}`, gen, age: g.age, level: g.level, traits: g.traits, minor: false };
    disband(g);
  } else {
    const c = S.family.find(x => x.id === id);
    if (!c) return;
    S.lord = { given: c.name, name: `변경백 ${c.name}`, gen, age: c.age, level: 1, traits: c.traits, minor: c.age < MG.ADULT_AGE };
    S.family = S.family.filter(x => x !== c);
  }
  S.pendingSuccession = false;
  // 본국이 계승을 인정하며 선물을 보낸다 (관계가 좋을수록 크다)
  const gift = 100 + 3 * S.crown;
  S.res.gold = Math.min(MG.storageCap(), S.res.gold + gift);
  S.report = [`${S.lord.name}이(가) ${gen}대 성주가 되었어요.${S.lord.minor ? ` 아직 ${S.lord.age}세라 ${MG.ADULT_AGE}세까지는 전투에 나가지 않아요.` : ''}`,
    `본국이 계승을 인정하며 축하 선물로 골드 ${gift}을 보냈어요.`];
  save();
};

// 해가 바뀔 때: 나이, 출생, 성년, 노환
function newYear(rep) {
  const S = MG.S, L = S.lord;
  L.age++;
  if (L.minor && L.age >= MG.ADULT_AGE) { L.minor = false; rep.push(`${L.name}이(가) 성년이 되어 이제 전투에 나가요.`); }
  for (const g of S.generals) if (!g.dead) g.age++;
  for (const c of S.family) c.age++;
  if (L.age >= 20 && L.age <= 45 && Math.random() < MG.BIRTH_CHANCE) {
    const c = { id: S.nextId++, name: MG.randomName(), age: 0, traits: MG.rollTraits() };
    S.family.push(c);
    rep.push(`성주에게 아이가 태어났어요: ${c.name} (${c.traits.map(t => MG.TRAITS[t].name).join(', ')})`);
  }
  for (const c of S.family.filter(c => c.age >= MG.ADULT_AGE)) {
    const type = pick(Object.keys(MG.WEAPON_KINDS));
    S.generals.push(newGeneral({ name: c.name, type, lead: Math.random() < 0.3 ? 2 : 1, age: c.age, traits: c.traits, blood: true }));
    rep.push(`${c.name}이(가) 성년이 되어 장수가 되었어요 (${MG.UNIT_TYPES[type].name}).`);
  }
  S.family = S.family.filter(c => c.age < MG.ADULT_AGE);
  for (const g of S.generals) {
    if (g.dead || Math.random() >= MG.deathChance(g.age)) continue;
    g.dead = true; g.deploy = false; S.stats.generalsLost++;
    rep.push(`장수 ${g.name}이(가) ${g.age}세로 세상을 떠났어요.`);
  }
  if (!S.pendingSuccession && Math.random() < MG.deathChance(L.age)) lordDied(rep, `${L.age}세로 세상을 떠났어요.`);
}

// ---------- 주점·발탁·은퇴 ----------
function refreshTavern(rep) {
  const S = MG.S, l = MG.bLevel('tavern');
  S.tavern = S.tavern.filter(t => --t.left > 0);
  if (!l) return;
  if (S.tavern.length < l + 1 && Math.random() < 0.6) {
    const level = randInt(1, Math.min(l * 2 + 1, S.level + 1));
    S.tavern.push({ left: randInt(2, 3), g: newGeneral({ type: pick(Object.keys(MG.WEAPON_KINDS)), level, age: randInt(20, 45) }) });
    rep.push('주점에 떠돌이 장수가 찾아왔어요.');
  }
}
MG.hire = idx => {
  const S = MG.S, t = S.tavern[idx];
  if (!t) return '이미 떠났어요';
  const cost = MG.hireCost(t.g.level);
  if (S.res.gold < cost) return '골드가 모자라요';
  S.res.gold -= cost;
  S.generals.push(t.g);
  S.tavern.splice(idx, 1);
  save();
  return `${t.g.name}을(를) 고용했어요. 병사는 모집으로 채워요.`;
};
MG.canPromote = () => MG.bLevel('training') >= 2;
MG.actPromote = type => {
  if (!MG.canPromote()) return '훈련장 2단계가 필요해요';
  if (MG.S.garrison[type] <= 0) return '발탁할 직할 병사가 없어요';
  let g;
  const why = act(MG.PROMOTE_COST, () => {
    MG.S.garrison[type]--;
    g = newGeneral({ type, age: randInt(19, 30) });
    MG.S.generals.push(g);
  });
  return why || `직할 ${MG.UNIT_TYPES[type].name} ${g.name}을(를) 장수로 발탁했어요.`;
};
MG.retire = g => {
  if (g.dead || g.age < 45) return '45세부터 은퇴할 수 있어요';
  disband(g);
  MG.S.retired++;
  save();
  return `${g.name}이(가) 은퇴해 교관이 되었어요. 훈련 경험치가 늘어요.`;
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
// 다음 습격의 적 구성 (고블린 둥지를 소탕하면 줄어든다)
MG.attackGroups = () => {
  const A = MG.S.nextAttack, mul = A.mul || 1;
  return MG.buildWaves(MG.S.level, A.dirs).groups.map(g => ({ ...g, count: Math.max(1, Math.round(g.count * mul)) }));
};
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

MG.trainXp = () => 30 * MG.bLevel('training') + MG.RETIRED_TRAIN_XP * (MG.S.retired || 0);
MG.actTrain = () => {
  const l = MG.bLevel('training');
  if (!l) return '훈련장이 없어요';
  return act(null, () => { for (const g of MG.S.generals) if (!g.dead && !g.injured) addXp(g, MG.trainXp()); });
};

MG.actScout = () => (MG.S.nextAttack.scout >= 2 ? '더 알아낼 것이 없어요' : act({ gold: 20 }, () => { MG.S.nextAttack.scout++; }));

MG.actCraft = () => {
  const l = MG.bLevel('smithy');
  if (!l) return '대장간이 없어요';
  let w;
  const why = act(MG.CRAFT_COST, () => { w = rollWeapon(MG.S.level, l); MG.S.inventory.push(w); });
  return why || `${MG.WEAPON_GRADES[w.grade].name} ${w.name}을(를) 만들었어요`;
};

// ---------- 시장 ----------
// 예전 저장에는 시세가 없으니 처음 볼 때 만든다
MG.ensureMarket = () => {
  const S = MG.S;
  if (!S.prices) { S.prices = { ...MG.MARKET.base }; S.prevPrices = { ...S.prices }; S.traded = 0; }
};
MG.buyPrice = r => MG.S.prices[r];
MG.sellPrice = r => MG.S.prices[r] * MG.MARKET.sellRate(MG.bLevel('market'));
MG.tradeLeft = () => Math.max(0, MG.MARKET.volume(MG.bLevel('market')) - MG.S.traded);
// 사기(qty>0) 또는 팔기(qty<0). 행동력은 쓰지 않는다.
MG.trade = (r, qty) => {
  const S = MG.S;
  MG.ensureMarket();
  if (!MG.bLevel('market')) return '시장이 없거나 부서졌어요';
  const n = Math.min(Math.abs(qty), MG.tradeLeft());
  if (!n) return '이번 달 거래 한도를 다 썼어요';
  if (qty > 0) {
    const room = MG.storageCap() - S.res[r], k = Math.min(n, room, Math.floor(S.res.gold / MG.buyPrice(r)));
    if (k <= 0) return room <= 0 ? '창고가 가득 찼어요' : '골드가 모자라요';
    S.res.gold -= Math.ceil(k * MG.buyPrice(r)); S.res[r] += k; S.traded += k;
  } else {
    const k = Math.min(n, Math.floor(S.res[r]));
    if (k <= 0) return `팔 ${MG.RES[r]}이(가) 없어요`;
    S.res[r] -= k; S.res.gold = Math.min(MG.storageCap(), S.res.gold + Math.floor(k * MG.sellPrice(r))); S.traded += k;
  }
  save();
  return null;
};
function moveMarket() {
  const S = MG.S, M = MG.MARKET, season = MG.SEASON(S.month);
  MG.ensureMarket();
  S.prevPrices = { ...S.prices };
  for (const r of Object.keys(M.base)) {
    const target = M.base[r] * ((M.season[r] && M.season[r][season]) || 1);
    let p = S.prices[r] * (1 + (Math.random() * 2 - 1) * M.drift);
    p += (target - p) * M.pull;
    S.prices[r] = Math.round(Math.max(M.base[r] * M.min, Math.min(M.base[r] * M.max, p)) * 100) / 100;
  }
  S.traded = 0;
}

// ---------- 원정 ----------
function rollSites() {
  const S = MG.S;
  S.sites = Object.keys(MG.SITES).sort(() => Math.random() - 0.5).slice(0, 3).map(type => ({
    id: S.nextId++, type, months: randInt(1, 2),
    diff: MG.siteDifficulty(S.level, MG.SITES[type].diff * (0.8 + Math.random() * 0.4)) }));
}
// 부대 전력: 병사 수 + 장수 레벨, 전직·무기·특성 보정 반영
MG.squadPower = g => {
  const m = MG.genMods(g);
  return Math.round((g.healthy + g.level * 8) * Math.min(2.5, m.atk * m.hp / m.dmgTaken));
};
MG.expeditionChance = (g, site) => Math.max(0.1, Math.min(0.95, 0.6 * MG.squadPower(g) / site.diff));
MG.canExpedition = g => !g.dead && !g.injured && !g.away && g.healthy > 0;
MG.actExpedition = (siteId, gid) => {
  const S = MG.S, site = (S.sites || []).find(s => s.id === siteId), g = S.generals.find(x => x.id === gid);
  if (!site || !g) return '원정지를 다시 골라요';
  if (S.ap < MG.EXPEDITION_AP) return `행동력이 ${MG.EXPEDITION_AP} 필요해요`;
  if (!MG.canExpedition(g)) return '보낼 수 없는 장수예요';
  g.away = { type: site.type, months: site.months, chance: MG.expeditionChance(g, site) };
  S.sites = S.sites.filter(s => s !== site);
  S.ap -= MG.EXPEDITION_AP;
  save();
  return `${g.name} 부대가 ${MG.SITES[site.type].name}(으)로 떠났어요. ${site.months}개월 뒤 돌아와요.`;
};

// 원정에서 돌아온 부대: 성공하면 보상, 실패하면 부상자
function returnExpeditions(rep) {
  const S = MG.S;
  for (const g of S.generals) {
    if (!g.away || --g.away.months > 0) continue;
    const a = g.away, ok = Math.random() < a.chance, name = MG.SITES[a.type].name;
    g.away = null;
    let gain = '';
    if (ok) {
      if (a.type === 'nest') { S.nextAttack.mul = (S.nextAttack.mul || 1) * 0.75; gain = '다음 습격 규모가 줄었어요'; }
      if (a.type === 'mine') { const n = Math.round(randInt(150, 300) * (1 + 0.1 * S.level)); S.res.iron = Math.min(MG.storageCap(), S.res.iron + n); gain = `철 +${n}`; }
      if (a.type === 'escort') { const n = Math.round(randInt(200, 400) * (1 + 0.1 * S.level)); S.res.gold = Math.min(MG.storageCap(), S.res.gold + n); gain = `골드 +${n}`; }
      if (a.type === 'ruins') { const w = rollWeapon(S.level + 4); S.inventory.push(w); gain = `${MG.WEAPON_GRADES[w.grade].name} ${w.name}`; }
    }
    // 피해: 실패하면 병사 30%, 성공해도 10%가 다친다. 실패하면 장수도 25% 확률로 부상.
    const hurt = Math.round(g.healthy * (ok ? 0.1 : 0.3));
    for (let i = 0; i < hurt; i++) { const r = rollWound(null); g.healthy--; if (r === 'dead') S.stats.soldiersLost++; else g.wounded.push(newWound(r)); }
    if (!ok && Math.random() < 0.25) { g.injured = randInt(2, 3); g.deploy = false; }
    addXp(g, ok ? MG.EXPEDITION_XP : Math.round(MG.EXPEDITION_XP / 3));
    rep.push(ok ? `${g.name} 부대가 ${name} 원정에 성공했어요! ${gain}${hurt ? ` (다친 병사 ${hurt})` : ''}`
      : `${g.name} 부대가 ${name} 원정에 실패했어요. 다친 병사 ${hurt}${g.injured ? `, ${g.name}도 부상` : ''}`);
  }
}

// ---------- 본국 ----------
MG.crown = () => MG.S.crown;
const addCrown = n => { MG.S.crown = Math.max(0, Math.min(100, MG.S.crown + n)); };
MG.supportKind = () => (MG.S.crown >= 70 ? '장수 1명' : MG.S.crown >= 40 ? '병사 20명 또는 식량 300' : '식량 200');
MG.actSupport = () => {
  const S = MG.S;
  if (S.support) return '이미 지원을 기다리고 있어요';
  if (S.crown < MG.SUPPORT_MIN) return '본국과 관계가 너무 나빠요';
  const why = act(null, () => {
    const kind = S.crown >= 70 ? 'general' : S.crown >= 40 ? (Math.random() < 0.5 ? 'soldiers' : 'food') : 'foodSmall';
    S.support = { kind, months: randInt(2, 4) };
    addCrown(-MG.SUPPORT_COST);
  });
  return why || `본국에 지원을 요청했어요. ${S.support.months}개월 뒤 도착해요.`;
};
function arriveSupport(rep) {
  const S = MG.S;
  if (!S.support || --S.support.months > 0) return;
  const k = S.support.kind;
  S.support = null;
  if (k === 'general') {
    const g = newGeneral({ type: pick(Object.keys(MG.WEAPON_KINDS)), level: randInt(2, 4), age: randInt(25, 40), healthy: 10 });
    S.generals.push(g);
    rep.push(`본국이 장수 ${g.name}(${MG.UNIT_TYPES[g.type].name} Lv.${g.level})과 병사 10명을 보냈어요.`);
  } else if (k === 'soldiers') {
    S.garrison.infantry += 10; S.garrison.archer += 10;
    rep.push('본국이 병사 20명을 보냈어요 (직할).');
  } else {
    const n = k === 'food' ? 300 : 200;
    S.res.food = Math.min(MG.storageCap(), S.res.food + n);
    rep.push(`본국이 식량 ${n}을 보냈어요.`);
  }
}

// ---------- 랜덤 이벤트 ----------
// 매달 20% 확률. 고를 것이 있는 이벤트는 내정 화면에 창으로 뜬다.
const EVENTS = {
  merchant: {
    title: '떠돌이 상인', weight: 1,
    make: () => ({ weapon: rollWeapon(MG.S.level + 3), price: 300 }),
    text: e => `상인이 ${MG.WEAPON_GRADES[e.weapon.grade].name} 무기 "${e.weapon.name}"(${MG.UNIT_TYPES[e.weapon.type].name}용 · ${MG.weaponDesc(e.weapon)})을 골드 ${e.price}에 팔겠대요.`,
    choices: [
      { label: e => `골드 ${e.price}에 사기`, ok: e => MG.S.res.gold >= e.price, run: e => { MG.S.res.gold -= e.price; MG.S.inventory.push(e.weapon); return '무기를 샀어요.'; } },
      { label: () => '보내기', run: () => '상인이 떠났어요.' },
    ],
  },
  refugees: {
    title: '난민 무리', weight: 1,
    make: () => ({ n: randInt(15, 30), food: 60 }),
    text: e => `마물을 피해 온 난민 ${e.n}명이 성문 앞에 있어요. 받아들이면 식량 ${e.food}이 들어요. 집이 모자라면 일부는 곧 떠나요.`,
    choices: [
      { label: () => '받아들이기', ok: e => MG.S.res.food >= e.food, run: e => { MG.S.res.food -= e.food; MG.S.pop += e.n; return `주민이 ${e.n}명 늘었어요.`; } },
      { label: () => '돌려보내기', run: () => '난민들이 다른 곳으로 떠났어요.' },
    ],
  },
  plague: {
    title: '역병', weight: 0.7, when: () => MG.S.generals.some(g => g.healthy > 10),
    make: () => ({ cost: 150 }),
    text: e => `병영에 역병이 돌아요. 골드 ${e.cost}으로 약을 구하면 막을 수 있어요. 그냥 두면 병사 일부가 앓아누워요.`,
    choices: [
      { label: e => `골드 ${e.cost}으로 치료`, ok: e => MG.S.res.gold >= e.cost, run: e => { MG.S.res.gold -= e.cost; return '역병을 막았어요.'; } },
      { label: () => '그냥 두기', run: () => {
        let n = 0;
        for (const g of MG.S.generals) { const k = Math.floor(g.healthy * 0.15); g.healthy -= k; n += k; for (let i = 0; i < k; i++) g.wounded.push({ sev: 'light', left: 1 }); }
        return `병사 ${n}명이 앓아누웠어요 (경상).`;
      } },
    ],
  },
  harvest: {
    title: '풍작', weight: 0.8, when: () => ['여름', '가을'].includes(MG.SEASON(MG.S.month)),
    make: () => ({ n: randInt(100, 200) }), text: e => `올해 들판이 풍성해요. 식량 +${e.n}`,
    choices: [{ label: () => '좋아요', run: e => { MG.S.res.food = Math.min(MG.storageCap(), MG.S.res.food + e.n); return null; } }],
  },
  blight: {
    title: '병충해', weight: 0.6, make: () => ({ n: randInt(60, 140) }), text: e => `창고의 곡식에 벌레가 들었어요. 식량 -${e.n}`,
    choices: [{ label: () => '어쩔 수 없죠', run: e => { MG.S.res.food = Math.max(0, MG.S.res.food - e.n); return null; } }],
  },
  thieves: {
    title: '도둑', weight: 0.7,
    make: () => ({ blocked: Math.random() < 0.5 * MG.bLevel('watch'), n: Math.round(MG.S.res.gold * 0.12) }),
    text: e => (e.blocked ? '도둑이 창고를 노렸지만 감시탑이 막았어요.' : `밤사이 도둑이 들었어요. 골드 -${e.n}`),
    choices: [{ label: () => '확인', run: e => { if (!e.blocked) MG.S.res.gold -= e.n; return null; } }],
  },
  volunteers: {
    title: '의용병', weight: 0.6, make: () => ({ n: randInt(5, 12) }),
    text: e => `변경백의 이름을 듣고 젊은이 ${e.n}명이 찾아왔어요. 직할 병력에 들어와요.`,
    choices: [{ label: () => '환영해요', run: e => { MG.S.garrison.infantry += e.n; return null; } }],
  },
  royal: {
    title: '왕실의 부탁', weight: 0.8,
    make: () => (Math.random() < 0.5 ? { res: 'iron', n: 150, reward: 250 } : { res: 'food', n: 250, reward: 200 }),
    text: e => `왕실이 ${MG.RES[e.res]} ${e.n}을(를) 보내 달래요. 들어주면 관계가 좋아지고 골드 ${e.reward}을 사례로 받아요.`,
    choices: [
      { label: e => `${MG.RES[e.res]} ${e.n} 보내기`, ok: e => MG.S.res[e.res] >= e.n,
        run: e => { MG.S.res[e.res] -= e.n; MG.S.res.gold += e.reward; addCrown(10); return '왕실과의 관계가 좋아졌어요 (+10).'; } },
      { label: () => '거절하기', run: () => { addCrown(-5); return '왕실이 서운해해요 (-5).'; } },
    ],
  },
};
function rollEvent(rep) {
  const S = MG.S;
  if (S.event || S.pendingSuccession || Math.random() >= MG.EVENT_CHANCE) return;
  const pool = Object.entries(EVENTS).filter(([, ev]) => !ev.when || ev.when());
  let r = Math.random() * pool.reduce((a, [, ev]) => a + ev.weight, 0);
  const [type, ev] = pool.find(([, e]) => (r -= e.weight) < 0) || pool[0];
  S.event = { type, ...ev.make() };
  rep.push(`이벤트: ${ev.title}`);
}
MG.eventView = () => {
  const e = MG.S.event;
  if (!e) return null;
  const ev = EVENTS[e.type];
  return { title: ev.title, text: ev.text(e), choices: ev.choices.map(c => ({ label: c.label(e), ok: !c.ok || c.ok(e) })) };
};
MG.resolveEvent = i => {
  const S = MG.S, e = S.event, c = e && EVENTS[e.type].choices[i];
  if (!c || (c.ok && !c.ok(e))) return '고를 수 없어요';
  const out = c.run(e);
  S.event = null;
  save();
  return out;
};

// ---------- 한 달 마치기 ----------
// 매달 수입·지출 내역. 식량은 병사와 주민이 똑같이 먹고, 병사에게는 급여가 나간다.
MG.economy = () => {
  const S = MG.S, season = MG.SEASON(S.month), mul = MG.SEASON_PROD[season];
  const made = { food: 0, wood: 0, iron: 0 };
  for (const f of S.fields) for (const [k, v] of Object.entries(MG.FIELDS[f.type].prod)) made[k] += v * f.level * (mul[k] != null ? mul[k] : 1);
  const generals = S.generals.filter(g => !g.dead).length;
  const soldiers = S.generals.reduce((a, g) => a + g.healthy + g.wounded.length, 0)
    + S.garrison.archer + S.garrison.infantry + S.garrison.wounded.length + MG.LORD.guards;
  return {
    tax: Math.floor(S.pop * MG.TAX_PER_POP), market: MG.bSum('market') * 40,
    wages: Math.ceil(soldiers * MG.WAGE_SOLDIER + generals * MG.WAGE_GENERAL),
    made, eat: Math.ceil((soldiers + generals + S.pop) * MG.FOOD_PER_PERSON), soldiers: soldiers + generals,
  };
};
MG.production = () => {
  const e = MG.economy();
  return { gold: e.tax + e.market - e.wages, food: e.made.food - e.eat, wood: e.made.wood, iron: e.made.iron };
};

MG.endMonth = () => {
  const S = MG.S, rep = [];
  const prod = MG.production(), eco = MG.economy(), cap = MG.storageCap();
  for (const k of Object.keys(prod)) S.res[k] = Math.min(cap, S.res[k] + prod[k]);
  rep.push(`골드 ${prod.gold >= 0 ? '+' : ''}${prod.gold} (세금 ${eco.tax}${eco.market ? ` · 시장 ${eco.market}` : ''} · 급여 -${eco.wages})`
    + ` · 식량 ${prod.food >= 0 ? '+' : ''}${Math.round(prod.food)} · 목재 +${Math.round(prod.wood)} · 철 +${Math.round(prod.iron)}`);
  // 병사 일부가 탈영한다 (굶주림·급여 체불)
  const desert = rate => {
    let n = 0;
    for (const g of S.generals) if (g.healthy > 0) { const d = Math.ceil(g.healthy * rate); g.healthy -= d; n += d; }
    for (const k of ['archer', 'infantry']) { const d = Math.ceil(S.garrison[k] * rate); S.garrison[k] -= d; n += d; }
    return n;
  };
  if (S.res.food < 0) {
    S.res.food = 0;
    const leave = Math.ceil(S.pop * 0.1);
    S.pop -= leave;
    rep.push(`식량이 바닥났어요! 주민 ${leave}명이 떠나고 병사 ${desert(0.05)}명이 탈영했어요.`);
    S.starving = true;
  } else S.starving = false;
  if (S.res.gold < 0) {
    S.res.gold = 0;
    rep.push(`급여를 다 주지 못했어요! 병사 ${desert(0.05)}명이 탈영했어요.`);
    S.unpaid = true;
  } else S.unpaid = false;
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
  if (S.month % 12 === 0) newYear(rep);
  if (S.month % 3 === 2) rollSites();   // 계절이 바뀌면 원정지도 바뀐다
  returnExpeditions(rep);
  arriveSupport(rep);
  refreshTavern(rep);
  moveMarket();
  rollEvent(rep);
  S.report = rep;
  save();
  return rep;
};

// ---------- 장수 ----------
const traitsOf = g => (g.traits || []).map(t => MG.TRAITS[t]);
MG.genLead = g => g.baseLead + (g.level >= 5 ? 1 : 0) + (g.level >= 10 ? 1 : 0) + traitsOf(g).reduce((a, t) => a + (t.lead || 0), 0);
MG.genCap = g => MG.genLead(g) * 10;
MG.genClass = g => (g.cls ? (g.adv ? MG.CLASSES[g.type][g.cls].lv10 : MG.CLASSES[g.type][g.cls]) : null);
MG.genTitle = g => (MG.genClass(g) || MG.UNIT_TYPES[g.type]).name;
MG.genMods = g => MG.combineMods([MG.genClass(g) && MG.genClass(g).mods, ...(g.weapon ? g.weapon.opts.map(o => MG.WEAPON_OPTS[o].mods) : []),
  ...traitsOf(g).map(t => t.mods)]);
MG.canClass = g => !g.dead && g.level >= 5 && !g.cls;
MG.canAdvance = g => !g.dead && g.level >= 10 && g.cls && !g.adv;

MG.chooseClass = (g, key) => { if (MG.canClass(g)) { g.cls = key; save(); } };
MG.advanceClass = g => { if (MG.canAdvance(g)) { g.adv = true; save(); } };

function addXp(g, n) {
  const from = g.level;
  g.xp += n * traitsOf(g).reduce((a, t) => a * (t.xp || 1), 1);
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
    if (g.away) continue;  // 원정 간 부대는 성을 지킬 수 없다
    const withGeneral = !g.dead && g.deploy;
    const mob = g.mobilize ? g.wounded.map((w, idx) => ({ idx, sev: w.sev })) : [];
    if (!withGeneral && g.healthy + mob.length === 0) continue;
    // 시작 자리는 출전 순서대로 큰길 → 성벽 안길
    const slot = MG.SQUAD_SLOTS[squads.length % MG.SQUAD_SLOTS.length];
    squads.push({ gid: g.id, name: g.name, type: g.type, slot, title: MG.genTitle(g),
      general: withGeneral ? { name: g.name, injured: g.injured > 0, ageMul: MG.ageMul(g.age) } : null,
      healthy: g.healthy, mob, level: g.level, train,
      mods: MG.combineMods([MG.genMods(g), typeMods[g.type]]),
      weaponAtk: g.weapon ? MG.WEAPON_GRADES[g.weapon.grade].atk : 1 });
  }
  const L = S.lord;
  return {
    squads, lord: { name: L.name, level: L.level || 1, minor: !!L.minor, ageMul: MG.ageMul(L.age || 30) },
    garrison: { archer: S.garrison.archer, infantry: S.garrison.infantry },
    walls: { ...S.walls }, keep: S.keep, morale: (S.starving ? MG.STARVE_MULT : 1) * (S.unpaid ? MG.UNPAID_MULT : 1),
    buildings: S.buildings.map(b => ({ ...b })), fields: S.fields.map(f => ({ ...f })),
    dirs: S.nextAttack.dirs, waveMul: S.nextAttack.mul || 1,
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

  // 성주가 전사하면 혈족 중에서 후계자를 고른다 (내정 화면). 혈족이 없으면 가문 단절.
  if (B.lordDead) {
    const rep = [];
    lordDied(rep, '전사했어요.');
    sum.lordDied = rep;
  }

  S.stats.battles++;
  S.stats.kills += B.stats.kills;
  if (!B.result.win) {
    S.over = true;
    S.overReason = '본성 함락';
  } else if (!S.over) {
    S.stats.wins++;
    addCrown(MG.CROWN_WIN);
    sum.gold = MG.battleGold(S.level);
    S.res.gold = Math.min(MG.storageCap(), S.res.gold + sum.gold);
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
