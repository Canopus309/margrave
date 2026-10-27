// 캠페인 상태: 장수 성장, 내정(건물·민가·자원·달 턴), 병원, 습격 일정, 저장.
(() => {
const KEY = 'margrave_save_v2';
// 저장소: 데스크톱 앱이면 문서\변경백 폴더의 파일(키마다 .json 하나), 브라우저면 localStorage
const FS = window.margraveFS;
const store = FS
  ? { get: k => FS.get(k), set: (k, v) => { if (!FS.set(k, v)) throw new Error('파일 저장 실패'); }, remove: k => FS.remove(k) }
  : { get: k => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: k => localStorage.removeItem(k) };
MG.isDesktop = !!FS;
MG.saveDir = () => (FS ? FS.dir() : null);
MG.openSaveDir = () => FS && FS.openDir();
const pick = arr => arr[(Math.random() * arr.length) | 0];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function save() {
  try { store.set(KEY, JSON.stringify(MG.S)); } catch (e) { /* 저장 불가 환경: 이번 세션만 유지 */ }
}
MG.saveCampaign = save;

MG.loadCampaign = () => {
  try {
    const s = JSON.parse(store.get(KEY));
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
    deploy: true, mobilize: false, healthy: o.healthy || 0, wounded: [], vet: o.vet || 0,
    age: o.age || randInt(20, 35), traits: o.traits || MG.rollTraits(), blood: !!o.blood };
}

// 예전 저장에 없는 값을 채운다 (나이·특성·가문·주점)
function migrate(s) {
  if (!s.lord.given) s.lord = { given: MG.FAMILY_NAME, name: s.lord.name, gen: s.lord.gen || 1, age: MG.LORD_START_AGE, level: 1, traits: [], minor: false };
  if (!s.lord.stats) Object.assign(s.lord, lordGrowth(s.lord.level || 1));
  for (const g of s.generals) {
    if (g.age == null) g.age = randInt(22, 38);
    if (!g.traits) g.traits = MG.rollTraits();
  }
  if (!s.family) s.family = [];
  if (!s.tavern) s.tavern = [];
  if (s.retired == null) s.retired = 0;
  if (s.crown == null) s.crown = MG.CROWN_START;
  if (!s.sites) { MG.S = s; rollSites(); }
  if (!s.chronicle) s.chronicle = [];
  if (!s.lineage) s.lineage = [{ gen: s.lord.gen, name: s.lord.name, from: 2, to: null, cause: null }];
  if (!s.domain) s.domain = 'none';
  if (s.siege == null) s.siege = 0;
  if (!s.effects) s.effects = [];
  if (s.nextChronicle == null) s.nextChronicle = nextChronicleMonth(s.month);
  if (!s.conquest) s.conquest = {};
  if (!s.outposts) s.outposts = [];
  if (s.march === undefined) s.march = null;
  if (!s.items) s.items = {};
  if (!s.difficulty) s.difficulty = 'normal';
  if (!s.relics) s.relics = [];
  if (!s.fort) s.fort = MG.newFort();
  if (!s.perks) s.perks = [];
  if (s.recruits == null) s.recruits = 0;
  if (!s.training) s.training = [];
  if (!s.reserve) s.reserve = {};
  if (!s.reserveVet) s.reserveVet = {};
  if (s.garrison.vet == null) s.garrison.vet = 0;
  for (const g of s.generals) if (g.vet == null) g.vet = 0;
  if (!s.era) s.era = { main: 'goblin', mix: null, until: s.month + 12 * randInt(...MG.ERA_YEARS) };
}

// opts: { domain, bonuses: [...], siege } — 캠페인 준비 화면에서 고른 것
MG.newCampaign = (opts = {}) => {
  const s = MG.S = {
    version: 2, level: 1, month: 2, nextId: 1, over: false, ap: MG.AP_PER_MONTH,
    generals: [], lord: { given: MG.FAMILY_NAME, name: MG.LORD.name, gen: 1, age: MG.LORD_START_AGE, level: 1, traits: [], minor: false, ...lordGrowth(1) },
    family: [], tavern: [], retired: 0, pendingSuccession: false,
    crown: MG.CROWN_START, sites: [], event: null, support: null,
    domain: opts.domain || 'none', siege: opts.siege || 0, effects: [], chronicle: [], cevent: null,
    conquest: {}, outposts: [], march: null, pendingConquest: false, items: {}, difficulty: opts.difficulty || 'normal', fort: MG.newFort(), perks: opts.perks || MG.activePerks([], null), recruits: 0, training: [], reserve: {}, reserveVet: {}, mobilizeReserve: false,
    era: { main: 'goblin', mix: null, until: 2 + 12 * randInt(...MG.ERA_YEARS) },
    origin: opts.origin || null, relics: opts.relic ? [opts.relic] : [], pendingPick: null,
    lineage: [{ gen: 1, name: MG.LORD.name, from: 2, to: null, cause: null }],
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
  // 명성으로 해금한 시작 보너스
  const bonus = opts.bonuses || [];
  if (bonus.includes('res')) for (const k of Object.keys(s.res)) s.res[k] = Math.round(s.res[k] * 1.5);
  // 명성 특성: 시작 조건
  if (MG.perk('stockpile')) for (const k of Object.keys(s.res)) s.res[k] = Math.round(s.res[k] * 1.25);
  if (MG.perk('recruits')) { s.garrison.archer += 6; s.garrison.infantry += 6; }
  if (MG.perk('veterans')) for (const g of s.generals) g.level = Math.max(g.level, 3);
  if (MG.perk('martial')) for (let i = 0; i < 2; i++) s.lord.stats[pick(Object.keys(s.lord.stats))]++;
  if (bonus.includes('general')) {
    const g = newGeneral({ type: pick(Object.keys(MG.WEAPON_KINDS)), level: 2, age: randInt(24, 34) });
    g.healthy = MG.genCap(g);
    s.generals.push(g);
  }
  for (const t of ['workshop', 'stable']) {
    if (!bonus.includes(t)) continue;
    outer: for (let j = 1; j < MG.GRID.n; j++) for (let i = 1; i < MG.GRID.n; i++) if (MG.canPlace(t, i, j)) { placeBuilding(t, i, j); break outer; }
  }
  applyOrigin(s);
  MG.ensureMarket();
  scheduleAttack(4);
  rollSites();
  s.nextChronicle = nextChronicleMonth(s.month);
  const extra = [s.origin ? MG.ORIGINS[s.origin].name : '', s.domain !== 'none' ? MG.DOMAINS[s.domain].name : '', ...bonus.map(b => MG.BONUSES[b].name),
    s.siege ? `포위 ${s.siege}단계` : '', ...s.relics.map(r => MG.RELICS[r].name)].filter(Boolean);
  MG.chron(`${MG.LORD.name}이(가) 변경의 전진 기지에 부임했어요.${extra.length ? ` (${extra.join(', ')})` : ''}`, 'lord');
  save();
  return s;
};

// 가문 내력: 시작할 때 한 번 적용 (전투 보정은 buildRoster에서)
function applyOrigin(s) {
  const place = t => { for (let j = 1; j < MG.GRID.n; j++) for (let i = 1; i < MG.GRID.n; i++) if (MG.canPlace(t, i, j)) return placeBuilding(t, i, j); };
  if (s.origin === 'merchant') { s.res.gold *= 2; place('market'); }
  if (s.origin === 'arcane') place('tower');
  if (s.origin === 'fallen') s.crown = 20;
  if (s.origin === 'iron') { s.res.iron += 200; place('smithy'); }
  if (s.origin === 'pious') place('temple');
}

// ---------- 연대기 기록 ----------
// kind: lord(성주·가문), battle, general, event(연대기 사건), etc
MG.chron = (text, kind = 'etc') => {
  const S = MG.S;
  if (!S.chronicle) S.chronicle = [];
  S.chronicle.push({ month: S.month, text, kind });
};
MG.monthLabel = m => `${1 + Math.floor(m / 12)}년차 ${m % 12 + 1}월`;
function nextChronicleMonth(month) {
  const [a, b] = MG.CHRONICLE_GAP, target = month + randInt(a, b);
  return target + ((2 - (target % 12)) + 12) % 12;  // 그 해(또는 다음 해) 봄 3월로 맞춘다
}
// 지속 효과 (연대기 사건이 남기는 것): { type, until }
MG.hasEffect = type => (MG.S.effects || []).some(e => e.type === type && e.until > MG.S.month);
const addEffect = (type, months) => { MG.S.effects.push({ type, until: MG.S.month + months }); };

// ---------- 성주 능력치와 성장 ----------
// 새 성주의 능력치: 무작위 시작값 + 이미 오른 레벨만큼의 성장 (자동 1점, 분배할 1점씩)
function lordGrowth(level) {
  const stats = MG.rollLordStats(), keys = Object.keys(stats);
  for (let i = 1; i < level; i++) stats[pick(keys)]++;
  return { stats, xp: 0, points: Math.max(0, level - 1) };
}
// 경험치를 더하고 오른 레벨마다 자동 1점 + 분배 1점. 자동으로 오른 능력치 이름들을 돌려준다
function lordGain(n) {
  const L = MG.S.lord, keys = Object.keys(L.stats), auto = [];
  L.xp = (L.xp || 0) + n * (L.traits || []).reduce((a, t) => a * (MG.TRAITS[t].xp || 1), 1);
  while (L.level < MG.MAX_LEVEL && L.xp >= MG.xpToNext(L.level)) {
    L.xp -= MG.xpToNext(L.level); L.level++;
    const k = pick(keys); L.stats[k]++; auto.push(MG.LORD_STATS[k].name);
    L.points = (L.points || 0) + 1;
  }
  if (L.level >= MG.MAX_LEVEL) L.xp = 0;
  return auto;
}
MG.lordSpend = k => {
  const L = MG.S.lord;
  if (!L.points || !MG.LORD_STATS[k]) return;
  L.stats[k]++; L.points--;
  save();
};
// 전투 뒤 성주 경험치: 근위대가 올린 경험치 + 살아남으면 생존 경험치
function applyLord(B, sum) {
  const RL = B.roster.lord, L = MG.S.lord;
  if (RL.away || RL.minor || RL.sitOut || B.lordDead) return;
  const lsq = B.allSquads.find(q => q.isLord);
  const xp = Math.round((lsq ? lsq.xp : 0) + MG.SURVIVE_XP), from = L.level;
  const auto = lordGain(xp);
  sum.lord = { name: L.name, xp, from, to: L.level, auto };
}

// ---------- 가문과 후계 ----------
// 후계 후보는 혈족뿐: 장수가 된 자녀와 아직 어린 자녀
MG.heirs = () => [
  ...MG.S.generals.filter(g => (g.blood || MG.perk('adoption')) && !g.dead).map(g => ({ kind: 'general', id: g.id, name: g.name, age: g.age, level: g.level, traits: g.traits })),
  ...MG.S.family.map(c => ({ kind: 'child', id: c.id, name: c.name, age: c.age, level: 1, traits: c.traits })),
];

// 장수가 부대를 떠나면(후계·은퇴) 그 병사들은 성주 직할로 간다
function disband(g) {
  const S = MG.S, kind = g.type === 'archer' ? 'archer' : 'infantry';
  S.garrison.vet = MG.vetMix(S.garrison.vet, S.garrison.archer + S.garrison.infantry, g.vet, g.healthy);
  S.garrison[kind] += g.healthy;
  for (const w of g.wounded) S.garrison.wounded.push({ type: kind, sev: w.sev, left: w.left });
  if (g.weapon) S.inventory.push(g.weapon);
  S.generals = S.generals.filter(x => x !== g);
}

function lordDied(rep, why) {
  const S = MG.S, cur = S.lineage[S.lineage.length - 1];
  rep.push(`${S.lord.name}이(가) ${why}`);
  MG.chron(`${S.lord.name}이(가) ${why}`, 'lord');
  if (cur && cur.to == null) { cur.to = S.month; cur.cause = why.replace(/(했|났)어요\.?$/, '').trim(); }
  if (MG.heirs().length) S.pendingSuccession = true;
  else { setOver('가문 단절'); rep.push('이을 혈족이 없어 가문이 끊겼어요.'); }
}

// 캠페인이 끝나면 명성을 한 번만 쌓는다
function setOver(reason) {
  const S = MG.S;
  if (S.over) return;
  S.over = true; S.overReason = reason;
  const cur = S.lineage[S.lineage.length - 1];
  if (cur && cur.to == null) { cur.to = S.month; cur.cause = reason; }
  MG.chron(reason === '가문 단절' ? '이을 혈족이 없어 가문이 끊겼어요.' : reason === '평정'
    ? `${S.lord.name}이(가) 변경을 지킨 이야기를 마쳤어요.` : '본성이 함락되어 변경 기지가 무너졌어요.', 'lord');
  S.renown = MG.renownOf(S);
  MG.awardRenown(S);
}

MG.chooseHeir = (kind, id) => {
  const S = MG.S, gen = S.lord.gen + 1, prevStats = S.lord.stats && { ...S.lord.stats };
  if (kind === 'general') {
    const g = S.generals.find(x => x.id === id);
    if (!g) return;
    S.lord = { given: g.name, name: `변경백 ${g.name}`, gen, age: g.age, level: g.level, traits: g.traits, minor: false, ...lordGrowth(g.level) };
    disband(g);
  } else {
    const c = S.family.find(x => x.id === id);
    if (!c) return;
    S.lord = { given: c.name, name: `변경백 ${c.name}`, gen, age: c.age, level: 1, traits: c.traits, minor: c.age < MG.ADULT_AGE, ...lordGrowth(1) };
    S.family = S.family.filter(x => x !== c);
  }
  S.pendingSuccession = false;
  S.lineage.push({ gen, name: S.lord.name, from: S.month, to: null, cause: null });
  MG.chron(`${S.lord.name}이(가) ${gen}대 성주가 되었어요${S.lord.minor ? ` (${S.lord.age}세, 어린 성주)` : ''}.`, 'lord');
  // 본국이 계승을 인정하며 선물을 보낸다 (관계가 좋을수록 크다)
  // 명성 특성: 혈통 계승(선대 능력치 1/3), 양자 계승(+2, 본국 관계 -10), 무가의 피(+2)
  const statKeys = Object.keys(S.lord.stats), bump = n => { for (let i = 0; i < n; i++) S.lord.stats[pick(statKeys)]++; };
  if (prevStats && MG.perk('lineage')) for (const k of statKeys) S.lord.stats[k] += Math.floor((prevStats[k] || 0) / 3);
  if (MG.perk('adoption')) { bump(2); addCrown(-10); }
  if (MG.perk('martial')) bump(2);
  const gift = 100 + 3 * S.crown;
  S.res.gold = Math.min(MG.storageCap(), S.res.gold + gift);
  S.report = [`${S.lord.name}이(가) ${gen}대 성주가 되었어요.${S.lord.minor ? ` 아직 ${S.lord.age}세라 ${MG.ADULT_AGE}세까지는 전투에 나가지 않아요.` : ''}`,
    `본국이 계승을 인정하며 축하 선물로 골드 ${gift}을 보냈어요.`];
  save();
};

// 해가 바뀔 때: 나이, 출생, 성년, 노환
function newYear(rep) {
  // 왕의 대리인: 해마다 지원병 20명, 대신 가진 골드의 10%를 공물로
  if (MG.perk('regent')) { MG.S.garrison.archer += 10; MG.S.garrison.infantry += 10; const t = Math.floor(MG.S.res.gold * 0.1); MG.S.res.gold -= t; rep.push(`왕실이 지원병 20명을 보냈고, 공물로 골드 ${t}을 바쳤어요.`); }
  const S = MG.S, L = S.lord;
  L.age++;
  if (L.minor && L.age >= MG.ADULT_AGE) { L.minor = false; rep.push(`${L.name}이(가) 성년이 되어 이제 전투에 나가요.`); }
  for (const g of S.generals) if (!g.dead) g.age++;
  for (const c of S.family) c.age++;
  // 혼담을 받아들였으면 3년 동안 출생 확률 2배
  const birth = (MG.BIRTH_CHANCE + (MG.perk('fertile') ? 0.1 : 0)) * (MG.hasEffect('marriage') ? 2 : 1);
  if (L.age >= 20 && L.age <= 45 && Math.random() < birth) {
    const c = { id: S.nextId++, name: MG.randomName(), age: 0, traits: MG.rollTraits() };
    S.family.push(c);
    rep.push(`성주에게 아이가 태어났어요: ${c.name} (${c.traits.map(t => MG.TRAITS[t].name).join(', ')})`);
    MG.chron(`성주에게 아이 ${c.name}이(가) 태어났어요.`, 'lord');
  }
  for (const c of S.family.filter(c => c.age >= MG.ADULT_AGE)) {
    const type = pick(Object.keys(MG.WEAPON_KINDS));
    S.generals.push(newGeneral({ name: c.name, type, lead: (Math.random() < 0.3 ? 2 : 1) + (MG.perk('schooling') ? 1 : 0), level: MG.perk('academy') ? 3 : 1, age: c.age, traits: c.traits, blood: true }));
    rep.push(`${c.name}이(가) 성년이 되어 장수가 되었어요 (${MG.UNIT_TYPES[type].name}).`);
    MG.chron(`${c.name}이(가) 성년이 되어 장수가 되었어요.`, 'general');
  }
  S.family = S.family.filter(c => c.age < MG.ADULT_AGE);
  for (const g of S.generals) {
    if (g.dead || Math.random() >= MG.deathChance(g.age) * (MG.perk('healthy') ? 0.5 : 1)) continue;
    g.dead = true; g.deploy = false; S.stats.generalsLost++;
    rep.push(`장수 ${g.name}이(가) ${g.age}세로 세상을 떠났어요.`);
    MG.chron(`장수 ${g.name}이(가) ${g.age}세로 세상을 떠났어요.`, 'general');
  }
  if (!S.pendingSuccession && Math.random() < MG.deathChance(L.age) * (MG.perk('healthy') ? 0.5 : 1)) lordDied(rep, `${L.age}세로 세상을 떠났어요.`);
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
  MG.chron(`떠돌이 장수 ${t.g.name}(${MG.UNIT_TYPES[t.g.type].name} Lv.${t.g.level})을(를) 고용했어요.`, 'general');
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
    MG.chron(`직할 ${MG.UNIT_TYPES[type].name} ${g.name}을(를) 장수로 발탁했어요.`, 'general');
  });
  return why || `직할 ${MG.UNIT_TYPES[type].name} ${g.name}을(를) 장수로 발탁했어요.`;
};
// 해고: 가문 장수(후계 후보)는 내보낼 수 없다. 원정 중이면 돌아온 뒤에.
MG.canDismiss = g => !g.dead && !g.blood && !g.away;
MG.dismiss = g => {
  if (g.blood) return '가문 장수는 해고할 수 없어요';
  if (g.away) return '원정에서 돌아온 뒤에 해고할 수 있어요';
  if (g.dead) return '이미 세상을 떠났어요';
  disband(g);
  save();
  return `${g.name}을(를) 내보냈어요. 부대 병사는 직할로 갔어요.`;
};
MG.retire = g => {
  if (g.dead || g.age < 45) return '45세부터 은퇴할 수 있어요';
  if (g.away) return '돌아온 뒤에 은퇴할 수 있어요';
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
  S.nextAttack = { month: S.month + gap, dirs: MG.rollDirs(S.level), scout: 0, faction: S.era.main, mix: S.era.mix };
}
MG.isAttackMonth = () => MG.S.nextAttack && MG.S.month >= MG.S.nextAttack.month;
// 이번 달에 꼭 치러야 하는 전투가 있는가 (정벌군 도착 또는 습격)
MG.mustFight = () => !!MG.S.pendingConquest || MG.isAttackMonth();
// 정벌한 거점이 습격을 바꾼다: 고블린 소굴은 규모 -15%, 오크 야영지는 오크 -30%
MG.hasRelic = id => (MG.S.relics || []).includes(id);
MG.apMax = () => MG.AP_PER_MONTH + (MG.hasRelic('boots') ? 1 : 0);
MG.hasOutpost = id => (MG.S.outposts || []).includes(id);
// 엔딩 뒤 계속 다스리면 해마다 습격이 커진다
MG.outpostWaveMul = () => (MG.hasOutpost('goblin') ? 0.85 : 1) * MG.endlessMul();
MG.endlessMul = () => (MG.S.endedMonth != null ? 1 + MG.ENDLESS_STEP * Math.floor((MG.S.month - MG.S.endedMonth) / 12) : 1);
MG.citadelOpen = () => Object.keys(MG.OUTPOSTS).filter(k => !MG.OUTPOSTS[k].final).every(MG.hasOutpost);
MG.typeMul = () => (MG.hasOutpost('orc') ? { orc: 0.7, orcThrower: 0.7 } : {});
// 다음 습격의 적 구성 (고블린 둥지를 소탕하면 줄어든다)
MG.attackGroups = () => {
  const S = MG.S, A = S.nextAttack, tm = MG.typeMul();
  const mul = (A.mul || 1) * (MG.hasEffect('migration') ? 1.3 : 1) * MG.siegeEnemyMul(S.siege || 0) * MG.outpostWaveMul();
  return MG.buildWaves(S.level, A.dirs, A.faction, A.mix, MG.DIFFICULTY[S.difficulty || 'normal'], A.retaliation).groups.map(g => MG.ENEMY_TYPES[g.type].boss ? g : ({ ...g, count: Math.max(1, Math.round(g.count * mul * (tm[g.type] || 1))) }));
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
MG.hospitalCap = () => MG.bSum('hospital') * MG.HOSPITAL_PER_LEVEL * (MG.hasRelic('reliquary') ? 2 : 1);
MG.storageCap = () => MG.STORAGE_BASE + MG.bSum('storage') * 1000 + (MG.perk('granary') ? 500 : 0);

// 절약(명성 특성): 건설·강화·들판 비용 -10%
MG.costOf = (base, level) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * level * (MG.perk('thrift') ? 0.9 : 1))]));
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

MG.actBuild = (type, i, j) => act(MG.costOf(MG.BUILDINGS[type].cost, 1), () => (MG.canPlace(type, i, j) ? (placeBuilding(type, i, j), null) : '여기에는 지을 수 없어요'));
MG.upgradeCost = b => MG.costOf(MG.BUILDINGS[b.type].cost, b.level + 1);
MG.actUpgrade = b => {
  if (b.level >= MG.BUILDINGS[b.type].max) return '최고 단계예요';
  if (b.hp <= 0) return '먼저 수리해야 해요';
  return act(MG.upgradeCost(b), () => { b.level++; b.max = Math.round(MG.BUILDINGS[b.type].hp * (1 + 0.3 * (b.level - 1))); b.hp = b.max; });
};
MG.actField = type => act(MG.costOf(MG.FIELDS[type].cost, 1), () => (MG.S.fields.length < MG.FIELD_SLOTS ? (MG.S.fields.push({ type, level: 1 }), null) : '들판에 빈자리가 없어요'));
MG.fieldUpgradeCost = f => MG.costOf(MG.FIELDS[f.type].cost, f.level + 1);
MG.actFieldUpgrade = f => (f.level >= MG.FIELDS[f.type].max ? '최고 단계예요' : act(MG.fieldUpgradeCost(f), () => { f.level++; }));

// 철거: 행동력 없이, 짓고 강화하는 데 든 자원의 절반을 돌려받는다
MG.demolishRefund = (base, level) => {
  const out = {};
  for (let l = 1; l <= level; l++) for (const [k, v] of Object.entries(MG.costOf(base, l))) out[k] = (out[k] || 0) + v;
  for (const k of Object.keys(out)) out[k] = Math.floor(out[k] / 2);
  return out;
};
const refund = cost => { const cap = MG.storageCap(); for (const [k, v] of Object.entries(cost)) MG.S.res[k] = Math.min(cap, MG.S.res[k] + v); };
MG.demolish = b => {
  const S = MG.S, d = MG.BUILDINGS[b.type], back = MG.demolishRefund(d.cost, b.level);
  if (!S.buildings.includes(b)) return '이미 없는 건물이에요';
  S.buildings = S.buildings.filter(x => x !== b);
  refund(back);  // 창고를 헐면 한도가 줄어드니, 헌 뒤의 한도로 맞춘다
  save();
  return `${d.name}을(를) 헐었어요. ${MG.costText(back)} 돌려받았어요.`;
};
MG.demolishField = idx => {
  const S = MG.S, f = S.fields[idx];
  if (!f) return '이미 없는 시설이에요';
  const d = MG.FIELDS[f.type], back = MG.demolishRefund(d.cost, f.level);
  S.fields.splice(idx, 1);
  refund(back);
  save();
  return `${d.name}을(를) 헐었어요. ${MG.costText(back)} 돌려받았어요.${d.hidden ? ' (다시 지을 수 없어요)' : ''}`;
};

// 성벽 조각 최대 체력 (국경 요새 영지면 +30%). id의 두 번째 글자 2는 성문
MG.wallMul = () => (MG.S && MG.S.domain === 'fortress' ? MG.WALL_DOMAIN_MUL : 1) * (MG.S && MG.hasRelic('crest') ? 1.15 : 1) * (MG.perk('siegehold') ? 1.5 : 1);
MG.wallMax = id => Math.round((id[1] === '2' ? MG.GATE_HP : MG.WALL_SEG_HP) * MG.wallMul() * MG.fortLevelMul(MG.S && MG.S.fort, id));

// 성벽·성문 강화와 부가 시설 (면별, 행동력 1). kind: wall gate moat oil towers
MG.fortCost = (kind, side) => {
  const F = MG.S.fort;
  if (kind === 'wall') { const n = MG.WALL_LEVELS[F.wall[side] + 1]; return n && n.cost; }
  if (kind === 'gate') { const n = MG.GATE_LEVELS[F.gate[side] + 1]; return n && n.cost; }
  if (kind === 'towers') return F.towers ? null : MG.CORNER_TOWERS.cost;
  return F[kind][side] ? null : MG.FORT_EXTRAS[kind].cost;
};
MG.actFort = (kind, side) => {
  const S = MG.S, F = S.fort, cost = MG.fortCost(kind, side);
  if (!cost) return '이미 다 지었어요';
  return act(cost, () => {
    if (kind === 'wall' || kind === 'gate') {
      // 부서진 채 남아 있던 조각은 늘어난 체력만큼 함께 늘어난다
      const ids = [0, 1, 2, 3, 4].map(i => side + i).filter(id => (id[1] === '2') === (kind === 'gate'));
      const before = Object.fromEntries(ids.map(id => [id, MG.wallMax(id)]));
      F[kind][side]++;
      for (const id of ids) if (S.walls[id] != null) S.walls[id] += MG.wallMax(id) - before[id];
    } else if (kind === 'towers') F.towers = true;
    else F[kind][side] = true;
  }) || `${MG.SIDE_NAME[side] || ''}${side ? '쪽 ' : ''}${kind === 'wall' ? MG.WALL_LEVELS[F.wall[side]].name : kind === 'gate' ? MG.GATE_LEVELS[F.gate[side]].name : kind === 'towers' ? MG.CORNER_TOWERS.name : MG.FORT_EXTRAS[kind].name}을(를) 갖췄어요.`;
};

// 수리: 성벽·성문·본성·건물을 피해가 큰 곳부터, 한 번에 일정량까지
MG.damageList = () => {
  const S = MG.S, list = [];
  for (const [id, hp] of Object.entries(S.walls)) {
    const max = MG.wallMax(id);
    if (hp < max) list.push({ kind: 'wall', id, hp, max });
  }
  if (S.keep < MG.KEEP_HP) list.push({ kind: 'keep', hp: S.keep, max: MG.KEEP_HP });
  for (const b of S.buildings) if (b.hp < b.max) list.push({ kind: 'building', b, hp: b.hp, max: b.max });
  return list;
};
// 수리 대상: 'all'(알아서), 'keep'(본성), 'side:N'(그 면 성벽·성문), 'b:건물id'
const repairFilter = spec => {
  if (!spec || typeof spec !== 'string' || spec === 'all') return () => true;
  if (spec === 'keep') return d => d.kind === 'keep';
  if (spec.startsWith('side:')) return d => d.kind === 'wall' && d.id[0] === spec[5];
  return d => d.kind === 'building' && d.b.id === +spec.slice(2);
};
// 고를 수 있는 피해 (한 번에 2000까지)
MG.repairDamage = spec => Math.min(MG.REPAIR_PER_ACTION, MG.damageList().filter(repairFilter(spec)).reduce((a, d) => a + d.max - d.hp, 0));
// 체력 1을 고치는 목재
const repairWoodPerHp = () => MG.REPAIR_WOOD_PER_HP * (MG.hasEngineers() ? 0.6 : 1) * (MG.hasRelic('chisel') ? 0.7 : 1) * (MG.perk('siegehold') ? 0.5 : 1);
// 이번에 고치는 양: 목재가 모자라면 있는 목재만큼만
MG.repairNeed = spec => Math.min(MG.repairDamage(spec), Math.floor(Math.floor(MG.S.res.wood) / repairWoodPerHp()));
// 공병 부대가 성에 있으면(원정 중 아님, 병사 있음) 수리 목재가 40% 줄어든다
MG.hasEngineers = () => MG.S.generals.some(g => g.type === 'engineer' && !g.dead && !g.away && g.healthy > 0);
MG.repairCost = spec => ({ wood: Math.ceil(MG.repairNeed(spec) * repairWoodPerHp() - 1e-9) });
MG.actRepair = spec => {
  if (!MG.repairDamage(spec)) return '고칠 곳이 없어요';
  const need = MG.repairNeed(spec);
  if (!need) return '목재가 모자라요';
  return act(MG.repairCost(spec), () => {
    let left = need;
    // 고른 대상 안에서, 무너진 곳(체력 0)부터
    for (const d of MG.damageList().filter(repairFilter(spec)).sort((a, b) => a.hp / a.max - b.hp / b.max)) {
      const add = Math.min(left, d.max - d.hp);
      left -= add;
      if (d.kind === 'wall') MG.S.walls[d.id] = d.hp + add;
      else if (d.kind === 'keep') MG.S.keep = d.hp + add;
      else d.b.hp = d.hp + add;
      if (left <= 0) break;
    }
    for (const [id, hp] of Object.entries(MG.S.walls)) if (hp >= MG.wallMax(id)) delete MG.S.walls[id];
  });
};

// 모집: 병영 단계만큼, 주민 중에서. 장수 부대의 빈자리를 먼저 채우고, 남는 신병은 모두 성주 직할로 간다.
// 직할 병력에는 상한이 없다 — 병력은 식량으로만 제한된다 (설계 문서 4장).
// 마법사·사제 부대는 마법탑·사원이 있어야 채운다.
MG.MIN_POP = 10;  // 주민을 이보다 적게 남기며 뽑지는 않는다
MG.recruitCap = () => (MG.bLevel('barracks') ? MG.bLevel('barracks') * 10 + Math.max(0, MG.S.lord.stats.admin - 3) : 0);
MG.recruitTargets = () => {
  const list = [];
  for (const g of MG.S.generals) {
    if (g.dead) continue;
    if (!MG.canRefill(g.type)) continue;
    const need = MG.genCap(g) - g.healthy - g.wounded.length;
    if (need > 0) list.push({ g, need });
  }
  return list;
};
// 병종별로 보충에 필요한 건물
MG.REFILL_BUILDING = { mage: 'tower', priest: 'temple', engineer: 'workshop', artillery: 'workshop', cavalry: 'stable' };
// ---------- 훈련소와 예비군 ----------
// 모집한 훈련병을 병종별로 훈련시키면 그 병종 예비군이 되고, 예비군을 같은 병종 장수 부대에 편제한다.
// 한 번에 훈련할 수 있는 인원 = 병영 단계 × 20. 훈련장이 있으면 기간 -1개월.
MG.trainCap = () => MG.bLevel('barracks') * MG.TRAIN_PER_BARRACKS;
MG.trainingNow = () => (MG.S.training || []).reduce((a, t) => a + t.n, 0);
MG.trainMonths = type => Math.max(0, MG.TRAINING[type].months - (MG.bLevel('training') ? 1 : 0));
MG.trainCost = (type, n) => Object.fromEntries(Object.entries(MG.TRAINING[type].cost).map(([k, v]) => [k, v * n]));
// 지금 훈련시킬 수 있는 최대 인원
MG.trainable = type => {
  const S = MG.S, cost = MG.TRAINING[type].cost;
  let n = Math.min(S.recruits || 0, Math.max(0, MG.trainCap() - MG.trainingNow()));
  for (const [k, v] of Object.entries(cost)) if (v) n = Math.min(n, Math.floor(S.res[k] / v));
  return Math.max(0, n);
};
MG.startTraining = (type, want) => {
  const S = MG.S, T = MG.TRAINING[type];
  if (!T) return '훈련할 수 없는 병종이에요';
  if (!MG.trainCap()) return '병영이 없거나 부서졌어요';
  if (!MG.canRefill(type)) return `${MG.BUILDINGS[MG.REFILL_BUILDING[type]].name}이(가) 있어야 ${MG.UNIT_TYPES[type].name}을(를) 훈련해요`;
  if (!(S.recruits > 0)) return '훈련병이 없어요. 행동의 모집으로 뽑아요';
  if (MG.trainingNow() >= MG.trainCap()) return `훈련소가 가득 찼어요 (한 번에 ${MG.trainCap()}명)`;
  const n = Math.min(want, MG.trainable(type));
  if (n <= 0) return '자원이 모자라요';
  pay(MG.trainCost(type, n));
  S.recruits -= n;
  const months = MG.trainMonths(type);
  const vet = MG.bLevel('training') * 10;
  if (months <= 0) addReserve(type, n, vet);
  else S.training.push({ type, n, left: months, vet });
  save();
  return months <= 0 ? `${MG.UNIT_TYPES[type].name} ${n}명이 바로 예비군이 되었어요.` : `${MG.UNIT_TYPES[type].name} ${n}명이 훈련을 시작했어요. ${months}개월 뒤 예비군이 돼요.`;
};
// 예비군에 병사를 더하면 그 병종 예비군 숙련도에 섞인다
function addReserve(type, n, vet) {
  const S = MG.S;
  S.reserveVet[type] = MG.vetMix(S.reserveVet[type], S.reserve[type] || 0, vet, n);
  S.reserve[type] = (S.reserve[type] || 0) + n;
}
// 매달: 훈련이 끝난 병사는 예비군으로
function tickTraining(rep) {
  const S = MG.S, done = {};
  for (const t of S.training) if (--t.left <= 0) { addReserve(t.type, t.n, t.vet || 0); done[t.type] = (done[t.type] || 0) + t.n; }
  S.training = S.training.filter(t => t.left > 0);
  const list = Object.entries(done).map(([k, n]) => `${MG.UNIT_TYPES[k].name} ${n}`).join(', ');
  if (list) rep.push(`훈련을 마친 병사가 예비군이 되었어요: ${list}`);
}
// 편제: 같은 병종 예비군을 장수 부대로 (정원까지, 행동력 없음)
// 병원에 있는 부상병은 나으면 돌아오니 그 자리를 남겨 둔다
MG.assignable = g => Math.min(Math.max(0, MG.genCap(g) - g.healthy - g.wounded.length), MG.S.reserve[g.type] || 0);
MG.assignReserve = (gid, want) => {
  const S = MG.S, g = S.generals.find(x => x.id === gid);
  if (!g || g.dead) return '장수가 없어요';
  if (g.away) return '원정·정벌에서 돌아온 뒤에 편제해요';
  const n = Math.min(want, MG.assignable(g));
  if (n <= 0) return MG.genCap(g) <= g.healthy ? '부대가 가득 찼어요' : `${MG.UNIT_TYPES[g.type].name} 예비군이 없어요. 훈련소에서 훈련시켜요`;
  g.vet = MG.vetMix(g.vet, g.healthy, S.reserveVet[g.type], n);
  S.reserve[g.type] -= n; g.healthy += n;
  save();
  return `${MG.UNIT_TYPES[g.type].name} 예비군 ${n}명을 ${g.name} 부대에 편제했어요.`;
};
// 보병·궁수 예비군과 성벽 위 직할 병력 사이를 오간다. dir: 'toGarrison' | 'toReserve'
MG.moveGarrisonReserve = (type, n, dir) => {
  const S = MG.S, from = dir === 'toGarrison' ? S.reserve : S.garrison, to = dir === 'toGarrison' ? S.garrison : S.reserve;
  const k = Math.min(n, from[type] || 0);
  if (k <= 0) return '옮길 병사가 없어요';
  if (dir === 'toGarrison') S.garrison.vet = MG.vetMix(S.garrison.vet, S.garrison.archer + S.garrison.infantry, S.reserveVet[type], k);
  else S.reserveVet[type] = MG.vetMix(S.reserveVet[type], S.reserve[type] || 0, S.garrison.vet, k);
  from[type] -= k; to[type] = (to[type] || 0) + k;
  save();
  return `${MG.UNIT_TYPES[type].name} ${k}명을 ${dir === 'toGarrison' ? '성벽 위 직할로' : '예비군으로'} 옮겼어요.`;
};
// 훈련병·훈련 중·예비군 병사 수 (유지비 계산용). cavalry: 기병만
MG.reserveCount = cavalryOnly => {
  const S = MG.S;
  if (cavalryOnly) return (S.reserve.cavalry || 0) + S.training.filter(t => t.type === 'cavalry').reduce((a, t) => a + t.n, 0);
  return (S.recruits || 0) + MG.trainingNow() + Object.values(S.reserve).reduce((a, n) => a + n, 0);
};
MG.canRefill = type => !MG.REFILL_BUILDING[type] || MG.bLevel(MG.REFILL_BUILDING[type]) > 0 || (MG.perk('siegeeng') && (type === 'engineer' || type === 'artillery'));
// 신병 비용: 싼 모병 -40%, 용병 변경백 3배 (대신 주민이 필요 없다)
MG.recruitGold = () => MG.RECRUIT_GOLD * (MG.perk('cheapdraft') ? 0.6 : 1) * (MG.perk('mercenary') ? 3 : 1);
MG.recruitAmount = () => Math.min(MG.recruitCap(), MG.perk('mercenary') ? Infinity : Math.max(0, MG.S.pop - MG.MIN_POP), Math.floor(MG.S.res.gold / MG.recruitGold()));
MG.recruitCost = () => ({ gold: Math.ceil(MG.recruitAmount() * MG.recruitGold()) });
MG.recruitPlan = () => {
  let left = MG.recruitAmount();
  const toSquads = MG.recruitTargets().reduce((a, t) => a + t.need, 0);
  const squads = Math.min(left, toSquads);
  return { total: left, squads, garrison: left - squads };
};
MG.actRecruit = () => {
  if (!MG.recruitCap()) return '병영이 없거나 부서졌어요';
  if (MG.S.pop <= MG.MIN_POP && !MG.perk('mercenary')) return '주민이 너무 적어요';
  const n = MG.recruitAmount();
  if (!n) return '골드가 모자라요';
  return act(MG.recruitCost(), () => {
    // 신병은 훈련병이 된다. 훈련소에서 병종을 골라 훈련시킨 뒤 예비군에서 편제한다
    MG.S.recruits = (MG.S.recruits || 0) + n;
    if (!MG.perk('mercenary')) MG.S.pop -= n;
  });
};

MG.trainXp = () => 30 * MG.bLevel('training') + MG.RETIRED_TRAIN_XP * (MG.S.retired || 0);
MG.actTrain = () => {
  const l = MG.bLevel('training');
  if (!l) return '훈련장이 없어요';
  return act(null, () => {
    for (const g of MG.S.generals) if (!g.dead && !g.injured) addXp(g, MG.trainXp());
    // 병사 숙련도도 훈련장 단계 × 10
    for (const g of MG.S.generals) if (!g.dead && !g.away) g.vet = Math.min(MG.VET_MAX, (g.vet || 0) + 10 * l);
    MG.S.garrison.vet = Math.min(MG.VET_MAX, (MG.S.garrison.vet || 0) + 10 * l);
  });
};

// 정찰병(명성 특성): 행동력 없이 골드만
const freeAct = (cost, fn) => { if (!MG.canPay(cost)) return '자원이 모자라요'; pay(cost); fn(); save(); return null; };
MG.actScout = () => (MG.S.nextAttack.scout >= 2 ? '더 알아낼 것이 없어요' : (MG.perk('scouts') ? freeAct : act)({ gold: 20 }, () => { MG.S.nextAttack.scout++; }));

MG.actCraft = () => {
  const l = MG.bLevel('smithy');
  if (!l) return '대장간이 없어요';
  let w;
  // 대장장이 영주(결단): 행동력 없이, 등급 +1
  const why = (MG.perk('smith') ? freeAct : act)(MG.CRAFT_COST, () => { w = rollWeapon(MG.S.level, Math.min(3, l + (MG.perk('smith') ? 1 : 0))); MG.S.inventory.push(w); });
  return why || `${MG.WEAPON_GRADES[w.grade].name} ${w.name}을(를) 만들었어요`;
};

// ---------- 시장 ----------
// 예전 저장에는 시세가 없으니 처음 볼 때 만든다
MG.ensureMarket = () => {
  const S = MG.S;
  if (!S.prices) { S.prices = { ...MG.MARKET.base }; S.prevPrices = { ...S.prices }; S.traded = 0; }
};
MG.buyPrice = r => MG.S.prices[r] * (MG.hasRelic('scales') ? 0.9 : 1);
MG.sellPrice = r => MG.S.prices[r] * MG.MARKET.sellRate(MG.bLevel('market')) * (MG.hasRelic('scales') ? 1.1 : 1);
// 시장 골드: 가장 높은 시장 단계 × 40 + 나머지 시장 단계 × 12
MG.marketGold = () => { const top = MG.bLevel('market'); return top * MG.MARKET_GOLD + (MG.bSum('market') - top) * MG.MARKET_EXTRA_GOLD; };
// 거래 한도: 가장 높은 시장 단계 기준 + 두 번째 시장부터 하나마다 +50
MG.tradeVolume = () => { const n = MG.S.buildings.filter(b => b.type === 'market' && b.hp > 0).length; return n ? MG.MARKET.volume(MG.bLevel('market')) + (n - 1) * MG.MARKET_EXTRA_VOLUME : 0; };
MG.tradeLeft = () => Math.max(0, Math.floor(MG.tradeVolume() * (MG.perk('smith') ? 0.5 : 1)) - MG.S.traded);
// 사기(qty>0) 또는 팔기(qty<0). 행동력은 쓰지 않는다.
// 소모품: 시장이 있으면 골드로 산다 (행동력 안 씀)
MG.buyItem = k => {
  const S = MG.S, I = MG.ITEMS[k];
  if (!MG.bLevel('market')) return '시장이 필요해요';
  if ((S.items[k] || 0) >= MG.ITEM_MAX) return `${I.name}은(는) ${MG.ITEM_MAX}개까지 보관해요`;
  if (S.res.gold < I.price) return '골드가 모자라요';
  S.res.gold -= I.price;
  S.items[k] = (S.items[k] || 0) + 1;
  save();
  return `${I.name}을(를) 샀어요.`;
};
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
MG.expeditionChance = (g, site) => Math.max(0.1, Math.min(0.95, 0.6 * MG.squadPower(g) / site.diff + (MG.perk('expedition') ? 0.1 : 0)));
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
    if (!g.away || g.away.type === 'march' || --g.away.months > 0) continue;
    const a = g.away, ok = Math.random() < a.chance, name = MG.SITES[a.type].name;
    g.away = null;
    let gain = '';
    if (ok) {
      if (a.type === 'nest') { S.nextAttack.mul = (S.nextAttack.mul || 1) * 0.75; gain = '다음 습격 규모가 줄었어요'; }
      if (a.type === 'mine') { const n = Math.round(randInt(150, 300) * (1 + 0.1 * S.level) * (MG.perk('raider') ? 3 : 1)); S.res.iron = Math.min(MG.storageCap(), S.res.iron + n); gain = `철 +${n}`; }
      if (a.type === 'escort') { const n = Math.round(randInt(120, 200) * (1 + 0.15 * S.level) * (MG.perk('raider') ? 3 : 1)); S.res.gold = Math.min(MG.storageCap(), S.res.gold + n); gain = `골드 +${n}`; }
      if (a.type === 'ruins') {
        const w = rollWeapon(S.level + 4); S.inventory.push(w); gain = `${MG.WEAPON_GRADES[w.grade].name} ${w.name}`;
        // 고대 유적에서는 가끔 유물도 나온다
        const r = Math.random() < 0.3 && MG.grantRelic(rollRelic(false));
        if (r) gain += ` · 유물 ${MG.RELICS[r].name}`;
      }
      // 성공하면 가끔 소모품도 챙겨 온다
      if (Math.random() < 0.4) { const k = pick(['potion', 'firepot', 'drum']); S.items[k] = Math.min(MG.ITEM_MAX, (S.items[k] || 0) + 1); gain += `${gain ? ' · ' : ''}${MG.ITEMS[k].name} +1`; }
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

// ---------- 거점 정벌 ----------
// 거점마다 정찰 여부와 실패 횟수를 기억한다
const cq = id => (MG.S.conquest[id] = MG.S.conquest[id] || { scout: false, fails: 0 });
MG.conquestInfo = cq;
MG.actConquestScout = id => {
  if (cq(id).scout) return '이미 정찰했어요';
  return (MG.perk('scouts') ? freeAct : act)(MG.CONQUEST_SCOUT, () => { cq(id).scout = true; }) || `${MG.OUTPOSTS[id].name}을(를) 정찰했어요.`;
};
// 진지 수비대 규모: 실패할 때마다 +20%, 포위 단계 반영
MG.conquestMul = id => (1 + MG.CONQUEST_FAIL_MUL * cq(id).fails) * MG.siegeEnemyMul(MG.S.siege || 0) * (MG.perk('conqueror') ? 0.85 : 1);
MG.actMarch = (id, gids, withLord) => {
  const S = MG.S, O = MG.OUTPOSTS[id];
  if (!O || MG.hasOutpost(id)) return '정벌할 수 없는 곳이에요';
  if (O.final && !MG.citadelOpen()) return '거점 3곳을 먼저 정벌해요';
  if (S.march) return '이미 정벌군이 나가 있어요';
  const gens = gids.map(i => S.generals.find(g => g.id === i)).filter(g => g && MG.canExpedition(g));
  if (gens.length < MG.MARCH_MIN) return `장수 부대를 ${MG.MARCH_MIN}개 이상 골라요`;
  if (withLord && S.lord.minor) return '어린 성주는 출정할 수 없어요';
  if (withLord && S.lord.injured && !S.lord.deployInjured) return '성주가 부상 중이에요 (가문 카드에서 부상 중 출전을 켜야 해요)';
  if (S.ap < MG.MARCH_AP) return `행동력이 ${MG.MARCH_AP} 필요해요`;
  if (S.res.food < MG.MARCH_FOOD) return `식량이 ${MG.MARCH_FOOD} 필요해요`;
  S.res.food -= MG.MARCH_FOOD;
  S.ap -= MG.MARCH_AP;
  // 행군 기간: 철벽 농성 +1, 빠른 행군·정복자 -1 (최소 1개월)
  const months = Math.max(1, O.months + (MG.perk('siegehold') ? 1 : 0) - (MG.perk('forcedmarch') ? 1 : 0) - (MG.perk('conqueror') ? 1 : 0));
  for (const g of gens) g.away = { type: 'march', months };
  // 다음 달 도착해서 싸우고, 남은 달 동안 돌아온다
  S.march = { id, gids: gens.map(g => g.id), lord: !!withLord, left: months, fought: false };
  MG.chron(`${O.name} 정벌군이 출정했어요 (${gens.map(g => g.name).join(', ')}${withLord ? ', 성주 친정' : ''}).`, 'battle');
  save();
  return `정벌군이 ${O.name}(으)로 떠났어요. 다음 달 도착해 전투를 벌여요.`;
};
function advanceMarch(rep) {
  const S = MG.S, M = S.march;
  if (!M) return;
  M.left--;
  for (const id of M.gids) { const g = S.generals.find(x => x.id === id); if (g && g.away) g.away.months = Math.max(1, M.left); }
  if (!M.fought) {
    S.pendingConquest = true;
    rep.push(`정벌군이 ${MG.OUTPOSTS[M.id].name}에 도착했어요! 정벌 전투를 치러요.`);
    return;
  }
  if (M.left > 0) return;
  for (const id of M.gids) { const g = S.generals.find(x => x.id === id); if (g) g.away = null; }
  S.march = null;
  rep.push(`${MG.OUTPOSTS[M.id].name} 정벌군이 돌아왔어요.`);
}

// 정벌 전투 결과: 이기면 거점을 얻고 보복 습격이 오고, 지면 다음 시도 때 수비가 강해진다
function applyConquest(B) {
  const S = MG.S, M = S.march, O = MG.OUTPOSTS[M.id], sum = { gens: [], wound: { light: 0, heavy: 0, dead: 0 }, weapon: null, ruined: [], conquest: M.id };
  applySquads(B, sum);
  S.pendingConquest = false;
  M.fought = true;
  S.stats.battles++;
  S.stats.kills += B.stats.kills;
  if (B.result.win) {
    S.outposts.push(M.id);
    sum.gold = MG.conquestGold(O.stars) * (MG.perk('plunder') ? 2 : 1) * (MG.perk('raider') ? 3 : 1);
    S.res.gold = Math.min(MG.storageCap(), S.res.gold + sum.gold);
    // 보스를 쓰러뜨렸으면 전설 무기
    if (B.bossDead) {
      sum.weapon = rollWeapon(S.level, 0, 'legendary');
      sum.weapon.name = `${MG.ENEMY_TYPES[O.boss].name}의 ${sum.weapon.name.replace('전설의 ', '')}`;
      S.inventory.push(sum.weapon);
      sum.relic = MG.grantRelic(rollRelic(true, ['rare', 'legendary']));
    }
    addCrown(O.final ? 30 : 10);
    S.stats.wins++;
    MG.chron(`${O.name}을(를) ${O.final ? '함락' : '정벌'}했어요!${B.bossDead ? ` ${MG.ENEMY_TYPES[O.boss].name}을(를) 쓰러뜨렸어요.` : ''}`, 'battle');
    if (O.final) {
      // 엔딩: 내정 화면에서 엔딩을 보고, 계속 다스릴지 마칠지 고른다
      S.ended = true; S.endedMonth = S.month; S.endingPending = true;
      sum.ending = true;
      MG.chron(`${S.lord.name}이(가) 검은 성채를 무너뜨려 변경에 평화가 찾아왔어요.`, 'lord');
    } else {
      // 보복 습격: 늦어도 두 달 안에 크게 온다
      const A = S.nextAttack;
      let f = MG.perk('conqueror') ? 1.25 : MG.perk('raider') ? 2.25 : MG.RETALIATION_MUL;
      // 다음 전투가 대습격이면 보복 배율을 절반만 (×1.5 → ×1.25)
      if (S.level % 5 === 0) f = 1 + (f - 1) / 2;
      A.mul = (A.mul || 1) * f;
      if (O.faction) { A.faction = O.faction; A.mix = null; }
      A.month = Math.min(A.month, S.month + 2);
      A.retaliation = M.id;
      sum.retaliation = Math.round(f * 100) / 100;
    }
  } else {
    cq(M.id).fails++;
    MG.chron(`${O.name} 정벌에 실패했어요${B.retreated ? ' (퇴각)' : ''}.`, 'battle');
  }
  // 성주 전사는 승패를 반영한 뒤에 (가문이 끊겨도 검은 성채 함락의 명성은 받는다)
  if (B.lordDead) {
    const rep = [];
    if (!lordFell(B, sum)) lordDied(rep, '정벌 전투에서 전사했어요.');
    sum.lordDied = rep.length ? rep : null;
    if (S.over) S.endingPending = false;
  }
  save();
  return sum;
}

// 엔딩 뒤: 계속 다스리거나, 여기서 이야기를 마치고 명성을 받는다
MG.continueReign = () => {
  const S = MG.S;
  S.endingPending = false;
  MG.chron('변경백 가문은 계속 변경을 다스리기로 했어요. 마물은 해마다 더 거세져요.', 'lord');
  save();
};
MG.finishStory = () => {
  MG.S.endingPending = false;
  setOver('평정');
  save();
};

// ---------- 적 세력의 시대 ----------
// 4~6년마다 주도 세력이 바뀐다. 가끔 다른 세력이 섞여 온다. 이미 정해진 다음 습격은 그대로.
function rollEra(rep) {
  const S = MG.S, keys = Object.keys(MG.FACTIONS), main = pick(keys.filter(k => k !== S.era.main));
  const mix = Math.random() < MG.ERA_MIX ? pick(keys.filter(k => k !== main)) : null;
  S.era = { main, mix, until: S.month + 12 * randInt(...MG.ERA_YEARS) };
  const text = `새 시대: ${MG.FACTIONS[main].name}이(가) 변경을 노리기 시작했어요${mix ? ` (${MG.FACTIONS[mix].name}도 섞여 와요)` : ''}.`;
  rep.push(text);
  MG.chron(text, 'event');
}
MG.factionText = (f, mix) => `${MG.FACTIONS[f || 'goblin'].name}${mix ? ` + ${MG.FACTIONS[mix].name}` : ''}`;

// ---------- 유물·3택1 보상 ----------
const freeRelics = grades => Object.keys(MG.RELICS).filter(k => !MG.hasRelic(k) && (!grades || grades.includes(MG.RELICS[k].grade)));
// 등급을 굴려 아직 없는 유물 하나 (없으면 null). big: 좋은 등급이 잘 나온다
function rollRelic(big, only) {
  const r = Math.random();
  let grade = big ? (r < 0.15 ? 'legendary' : r < 0.6 ? 'rare' : 'common') : (r < 0.05 ? 'legendary' : r < 0.3 ? 'rare' : 'common');
  if (only && !only.includes(grade)) grade = only[0];
  const pool = freeRelics([grade]), any = pool.length ? pool : freeRelics(only);
  return any.length ? pick(any) : null;
}
MG.grantRelic = id => {
  if (!id || MG.hasRelic(id)) return null;
  MG.S.relics.push(id);
  MG.chron(`유물 ${MG.RELICS[id].name}을(를) 얻었어요.`, 'etc');
  return id;
};
MG.startRelicOffer = () => Object.keys(MG.RELICS).filter(k => MG.RELICS[k].grade === 'common').sort(() => Math.random() - 0.5).slice(0, 3);
MG.originOffer = () => Object.keys(MG.ORIGINS).sort(() => Math.random() - 0.5).slice(0, 3);
const ITEM_KEYS = ['potion', 'firepot', 'drum', 'oil', 'timber'];
function makeCard(kind, big) {
  const S = MG.S, L = S.level, m = big ? 1.6 : 1;
  if (kind === 'weapon') return { kind, weapon: rollWeapon(L + (big ? 4 : 0)) };
  if (kind === 'relic') { const id = rollRelic(big); return id ? { kind, id } : null; }
  if (kind === 'res') {
    const k = pick(['food', 'wood', 'iron']);
    return { kind, res: { gold: Math.round((120 + 25 * L) * m), [k]: Math.round((k === 'iron' ? 80 : 150) * (1 + 0.1 * L) * m) } };
  }
  if (kind === 'troops') return { kind, n: Math.round((12 + L) * m), type: pick(['archer', 'infantry']) };
  if (kind === 'xp') return { kind, xp: Math.round((50 + 10 * L) * m) };
  if (kind === 'items') {
    const items = {};
    for (let i = 0; i < (big ? 3 : 2); i++) { const k = pick(ITEM_KEYS); items[k] = (items[k] || 0) + 1; }
    return { kind, items };
  }
  if (kind === 'crown') return { kind, n: Math.round(10 * m) };
  return null;
}
// 서로 다른 종류 3장. 유물은 평소 25% 확률로만 끼고, 대습격이면 맨 앞에 꼭 들어간다
function rollCards(big) {
  const others = Object.keys(MG.CARD_KINDS).filter(k => k !== 'relic').sort(() => Math.random() - 0.5);
  const order = big || Math.random() < (MG.perk('treasure') ? 0.5 : 0.25) ? ['relic', ...others] : others;
  const cards = [];
  for (const k of order) { if (cards.length >= (MG.perk('conqueror') ? 2 : 3)) break; const c = makeCard(k, big); if (c) cards.push(c); }
  return { cards, big, rerolled: false };
}
// 카드 보여줄 글: { title, desc, color }
MG.cardInfo = c => {
  if (c.kind === 'weapon') { const g = MG.WEAPON_GRADES[c.weapon.grade]; return { title: `[${g.name}] ${c.weapon.name}`, desc: `${MG.UNIT_TYPES[c.weapon.type].name}용 · ${MG.weaponDesc(c.weapon)}`, color: g.color }; }
  if (c.kind === 'relic') { const R = MG.RELICS[c.id], g = MG.RELIC_GRADES[R.grade]; return { title: `[${g.name} 유물] ${R.name}`, desc: R.desc, color: g.color }; }
  if (c.kind === 'res') return { title: '보급 물자', desc: Object.entries(c.res).map(([k, v]) => `${MG.RES[k]} +${v}`).join(' · '), color: '#e6b450' };
  if (c.kind === 'troops') return { title: '지원병', desc: `직할 ${MG.UNIT_TYPES[c.type].name} +${c.n}명`, color: '#c9d1dc' };
  if (c.kind === 'xp') return { title: '전투의 교훈', desc: `모든 장수 경험치 +${c.xp}`, color: '#6aa8ff' };
  if (c.kind === 'items') return { title: '전리품 상자', desc: Object.entries(c.items).map(([k, v]) => `${MG.ITEMS[k].name} +${v}`).join(' · '), color: '#ffd36b' };
  return { title: '왕실의 치하', desc: `본국 관계 +${c.n}`, color: '#6bdc8f' };
};
MG.pickCard = i => {
  const S = MG.S, P = S.pendingPick, c = P && P.cards[i];
  if (!c) return '고를 카드가 없어요';
  const cap = MG.storageCap();
  if (c.kind === 'weapon') S.inventory.push(c.weapon);
  if (c.kind === 'relic') MG.grantRelic(c.id);
  if (c.kind === 'res') for (const [k, v] of Object.entries(c.res)) S.res[k] = Math.min(cap, S.res[k] + v);
  if (c.kind === 'troops') S.garrison[c.type] += c.n;
  if (c.kind === 'xp') for (const g of S.generals) if (!g.dead) addXp(g, c.xp);
  if (c.kind === 'items') for (const [k, v] of Object.entries(c.items)) S.items[k] = Math.min(MG.ITEM_MAX, (S.items[k] || 0) + v);
  if (c.kind === 'crown') addCrown(c.n);
  S.pendingPick = null;
  save();
  return `${MG.cardInfo(c).title}을(를) 골랐어요.`;
};
MG.rerollCards = () => {
  const S = MG.S, P = S.pendingPick, cost = MG.rerollCost(S.level);
  if (!P || P.rerolled) return '다시 뽑기는 한 번만 할 수 있어요';
  if (S.res.gold < cost) return '골드가 모자라요';
  S.res.gold -= cost;
  S.pendingPick = { ...rollCards(P.big), rerolled: true };
  save();
  return null;
};

// ---------- 본국 ----------
MG.crown = () => MG.S.crown;
const addCrown = n => { if (n > 0 && MG.hasRelic('royalseal')) n *= 2; MG.S.crown = Math.max(0, Math.min(100, MG.S.crown + n)); };
MG.supportKind = () => (MG.S.crown >= 70 ? '장수 1명' : MG.S.crown >= 40 ? '병사 20명 또는 식량 300' : '식량 200');
MG.actSupport = () => {
  const S = MG.S;
  if (S.support) return '이미 지원을 기다리고 있어요';
  if (S.crown < MG.SUPPORT_MIN) return '본국과 관계가 너무 나빠요';
  const why = act(null, () => {
    const kind = S.crown >= 70 ? 'general' : S.crown >= 40 ? (Math.random() < 0.5 ? 'soldiers' : 'food') : 'foodSmall';
    S.support = { kind, months: randInt(2, 4) };
    addCrown(-MG.SUPPORT_COST * (MG.perk('regent') ? 0.5 : 1));
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
  const made = { gold: 0, food: 0, wood: 0, iron: 0 };
  for (const f of S.fields) for (const [k, v] of Object.entries(MG.FIELDS[f.type].prod)) made[k] += v * f.level * (mul[k] != null ? mul[k] : 1);
  // 영지 특성
  if (S.domain === 'mine') made.iron *= 1.5;
  if (MG.hasRelic('pickaxe')) made.iron *= 1.5;
  if (MG.perk('smith')) made.iron *= 1.3;
  if (MG.perk('militia')) made.food += Math.floor((S.garrison.archer + S.garrison.infantry) / 10) * 4;
  if (MG.hasRelic('sickle')) made.food *= 1.25;
  if (S.domain === 'fertile') made.food *= 1.3;
  // 정벌한 거점에서 들어오는 것
  if (MG.hasOutpost('orc')) made.iron += 20;
  if (MG.hasOutpost('troll')) { made.wood += 30; made.food += 20; }
  const generals = S.generals.filter(g => !g.dead).length;
  const cavalry = S.generals.filter(g => g.type === 'cavalry').reduce((a, g) => a + g.healthy + g.wounded.length, 0) + MG.reserveCount(true);
  const soldiers = S.generals.reduce((a, g) => a + g.healthy + g.wounded.length, 0) + MG.reserveCount()
    + S.garrison.archer + S.garrison.infantry + S.garrison.wounded.length + MG.LORD.guards;
  // 연대기 사건의 지속 효과: 세금 감면, 혹한(겨울 식량 소비 1.5배)
  const winterCold = MG.hasEffect('harshWinter') && season === '겨울';
  return {
    tax: Math.floor(S.pop * MG.TAX_PER_POP * (MG.hasEffect('lowtax') ? 0.7 : 1) * (MG.hasRelic('ledger') ? 1.15 : 1) * MG.adminMul(S.lord.stats) * (MG.perk('taxreform') ? 1.1 : 1)),
    market: Math.round(MG.marketGold() * (S.domain === 'trade' ? 1.5 : 1)),
    wages: Math.ceil(soldiers * MG.WAGE_SOLDIER * (MG.perk('militia') ? 0.5 : 1) * (MG.perk('mercenary') ? 1.5 : 1) + generals * MG.WAGE_GENERAL),
    made, eat: Math.ceil(((soldiers + generals + cavalry) * (MG.perk('rations') ? 0.85 : 1) + S.pop) * MG.FOOD_PER_PERSON * (winterCold ? 1.5 : 1)), soldiers: soldiers + generals,
  };
};
MG.production = () => {
  const e = MG.economy();
  return { gold: Math.round(e.tax + e.market + e.made.gold - e.wages), food: e.made.food - e.eat, wood: e.made.wood, iron: e.made.iron };
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
    // 집 없는 주민: 민가를 수리하면 다시 들어가 살고, 아니면 매달 1/4씩 떠난다
    const leave = Math.max(1, Math.ceil(-room * 0.25));
    S.pop -= leave;
    rep.push(`집 없는 주민 ${-room}명 중 ${leave}명이 떠났어요. 민가를 수리하면 다시 살 수 있어요.`);
  }
  // 사원이 있으면 본성이 조금씩 회복된다 (설계 문서 3장)
  if (MG.bLevel('temple') && S.keep < MG.KEEP_HP) {
    const heal = Math.min(MG.KEEP_HP - S.keep, MG.TEMPLE_KEEP_HEAL * MG.bLevel('temple'));
    S.keep += heal;
    rep.push(`사원의 기도로 본성이 ${heal} 회복했어요.`);
  }
  tickTraining(rep);
  const rec = tickHospital();
  if (rec) rep.push(`병원에서 ${rec}명이 회복했어요.`);
  if (MG.bLevel('watch') && S.nextAttack) {
    const before = S.nextAttack.scout;
    S.nextAttack.scout = Math.max(S.nextAttack.scout, MG.bLevel('watch') >= 2 ? 2 : 1);
    if (S.nextAttack.scout > before) rep.push('감시탑이 다음 습격을 알아냈어요.');
  }
  S.month++;
  S.ap = MG.apMax();
  if (S.month % 12 === 0) newYear(rep);
  if (S.month % 3 === 2) rollSites();   // 계절이 바뀌면 원정지도 바뀐다
  advanceMarch(rep);
  if (S.month >= S.era.until) rollEra(rep);
  returnExpeditions(rep);
  arriveSupport(rep);
  refreshTavern(rep);
  moveMarket();
  rollEvent(rep);
  // 연대기 사건 (2~3년에 한 번, 봄)
  if (!S.cevent && !S.pendingSuccession && S.month >= S.nextChronicle) {
    rollChronicle();
    S.nextChronicle = nextChronicleMonth(S.month);
    if (S.cevent) rep.push(`연대기 사건: ${CHRONICLES[S.cevent.type].title}`);
  }
  S.effects = S.effects.filter(e => e.until > S.month);
  S.report = rep;
  save();
  return rep;
};

// ---------- 장수 ----------
const traitsOf = g => (g.traits || []).map(t => MG.TRAITS[t]);
MG.genLead = g => g.baseLead + (g.level >= 5 ? 1 : 0) + (g.level >= 10 ? 1 : 0) + traitsOf(g).reduce((a, t) => a + (t.lead || 0), 0);
// 통솔 1당 병사 수는 병종마다 다르다 (공병·포병은 5명)
MG.genCap = g => MG.genLead(g) * (MG.UNIT_TYPES[g.type].perLead || 10);
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
  g.xp += n * traitsOf(g).reduce((a, t) => a * (t.xp || 1), 1) * (MG.perk('drill') ? 1.1 : 1);
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
function rollWeapon(level, smithy, force) {
  const r = Math.random();
  let grade = force;
  if (force) { /* 정해진 등급 */ } else if (smithy) grade = smithy === 1 ? (r < 0.7 ? 'common' : 'rare') : smithy === 2 ? (r < 0.7 ? 'rare' : 'heroic') : (r < 0.75 ? 'heroic' : 'legendary');
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
// 성주가 쓰러졌을 때: 부상 없이 나갔으면 2~4개월 부상으로 끝나고 true, 부상 중이었으면 false(전사)
function lordFell(B, sum) {
  const L = MG.S.lord;
  if (B.roster.lord.injured) return false;
  L.injured = randInt(2, 4); L.deployInjured = false;
  sum.lordHurt = L.injured;
  MG.chron(`${L.name}이(가) ${B.conquest ? '정벌 전투' : `전투 ${B.level}`}에서 쓰러져 ${L.injured}개월 부상을 입었어요.`, 'lord');
  return true;
}
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
  // 성주는 성의 의원이 돌보니 병원 칸과 상관없이 매달 낫는다
  if (S.lord.injured > 0 && --S.lord.injured <= 0) { S.lord.injured = 0; S.lord.deployInjured = false; recovered++; }
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
  // 나은 직할 병사는 성벽으로, 나은 예비군은 예비군으로
  for (const w of S.garrison.wounded) if (w.left <= 0) { if (w.reserve) S.reserve[w.type] = (S.reserve[w.type] || 0) + 1; else S.garrison[w.type]++; recovered++; }
  S.garrison.wounded = S.garrison.wounded.filter(w => w.left > 0);
  return recovered;
}

function rollWound(prev) {
  const t = MG.WOUND_ROLL[prev || 'none'], r = Math.random();
  const res = r < t.light ? 'light' : r < t.light + t.heavy ? 'heavy' : 'dead';
  return res === 'dead' && ((MG.hasRelic('bandage') && Math.random() < 0.3) || (MG.perk('medics') && Math.random() < 0.2)) ? 'light' : res;
}
// 경상 1개월, 중상 3~6개월 (설계 문서 4장)
const newWound = sev => ({ sev, left: sev === 'light' ? 1 : randInt(3, 6) });

// ---------- 전투 준비 ----------
// 전투에 나갈 구성. 저장 상태는 건드리지 않는다(전투 중 새로고침하면 전투 전으로 돌아감).
// march: 정벌군이면 그 부대만 (장수는 모두 출전, 부상병 동원 없음)
MG.buildRoster = march => {
  const S = MG.S, squads = [];
  const train = 1 + 0.03 * MG.bLevel('training');
  const typeMods = { mage: { atk: 1 + 0.1 * MG.bLevel('tower') }, priest: { heal: 1 + 0.1 * MG.bLevel('temple') },
    artillery: { atk: 1 + 0.1 * MG.bLevel('workshop') }, cavalry: { hp: 1 + 0.1 * MG.bLevel('stable') },
    // 유물·가문 내력
    archer: { atk: MG.hasRelic('arrowheads') ? 1.15 : 1, range: S.origin === 'hunter' ? 1.15 : 1 },
    infantry: { atk: MG.hasRelic('whetstone') ? 1.1 : 1 } };
  if (S.origin === 'arcane') typeMods.mage.atk *= 1.2;
  if (S.origin === 'pious') typeMods.priest.heal *= 1.2;
  if (MG.perk('archery')) typeMods.archer.range *= 1.1;
  if (MG.perk('arcane')) { typeMods.mage.atk *= 2; typeMods.priest.heal *= 0.7; }
  for (const g of S.generals) {
    if (march ? !march.gids.includes(g.id) : g.away) continue;  // 원정·정벌 간 부대는 성을 지킬 수 없다
    const withGeneral = !g.dead && (march ? true : g.deploy);
    const mob = !march && g.mobilize ? g.wounded.map((w, idx) => ({ idx, sev: w.sev })) : [];
    if (!withGeneral && g.healthy + mob.length === 0) continue;
    // 시작 자리는 출전 순서대로 큰길 → 성벽 안길
    const slot = MG.SQUAD_SLOTS[squads.length % MG.SQUAD_SLOTS.length];
    squads.push({ gid: g.id, name: g.name, type: g.type, slot, title: MG.genTitle(g),
      general: withGeneral ? { name: g.name, injured: g.injured > 0, ageMul: MG.ageMul(g.age) } : null,
      healthy: g.healthy, mob, level: g.level, train, cls: g.cls,
      mods: MG.combineMods([MG.genMods(g), typeMods[g.type], MG.perk('harsh') && { hp: 1.1 }, MG.perk('mobile') && { speed: 1.3, atk: 1.1 }, MG.vetMods(g.vet)]), vet: g.vet || 0,
      weaponAtk: g.weapon ? MG.WEAPON_GRADES[g.weapon.grade].atk : 1 });
  }
  const L = S.lord;
  // 성주가 정벌에 나가 있으면 성을 지키지 못하고, 정벌에 안 따라갔으면 정벌 전투에 없다
  const lordAway = march ? !march.lord : !!(S.march && S.march.lord);
  const roster = {
    squads, lord: { name: L.name, level: L.level || 1, minor: !!L.minor, injured: L.injured > 0, sitOut: L.injured > 0 && !L.deployInjured, away: lordAway, ageMul: MG.ageMul(L.age || 30), mul: S.origin === 'knight' ? 1.5 : 1, stats: { ...L.stats } },
    relics: [...S.relics], diff: MG.DIFFICULTY[S.difficulty || 'normal'], fort: JSON.parse(JSON.stringify(S.fort)),
    garrison: march ? { archer: 0, infantry: 0 } : { archer: S.garrison.archer, infantry: S.garrison.infantry },
    // 예비군 동원을 켰으면 병종별 예비군이 지휘관 없는 부대로 나와 싸운다 (방어전만)
    reserve: !march && S.mobilizeReserve ? { ...S.reserve } : null, reserveVet: { ...S.reserveVet }, garrisonVet: S.garrison.vet || 0,
    walls: { ...S.walls }, keep: S.keep, morale: (S.starving ? MG.STARVE_MULT : 1) * (S.unpaid ? MG.UNPAID_MULT : 1) * (MG.perk('militia') ? 0.95 : 1), perks: [...(S.perks || [])],
    buildings: S.buildings.map(b => ({ ...b })), fields: S.fields.map(f => ({ ...f })),
    dirs: S.nextAttack.dirs, waveMul: (S.nextAttack.mul || 1) * (MG.hasEffect('migration') ? 1.3 : 1) * MG.outpostWaveMul(),
    faction: S.nextAttack.faction || 'goblin', mix: S.nextAttack.mix || null, retaliation: S.nextAttack.retaliation || null,
    items: { ...S.items }, typeMul: MG.typeMul(), siegeMul: MG.siegeEnemyMul(S.siege || 0), wallMul: MG.wallMul(),
  };
  if (march) { roster.outpost = march.id; roster.fortMul = MG.conquestMul(march.id) * roster.diff.count; }
  return roster;
};

// ---------- 전투 결과 반영 ----------
MG.applyResult = B => {
  if (B.conquest) return applyConquest(B);
  const S = MG.S, sum = { gens: [], wound: { light: 0, heavy: 0, dead: 0 }, weapon: null, heir: null, lostPop: 0, homeless: 0, ruined: [] };
  applySquads(B, sum);

  // 직할 수비대: 성벽에 남은 병력 + 수비대 부대로 바뀐 생존자
  const gar = S.garrison;
  gar.archer = 0; gar.infantry = 0;
  for (const s of MG.SIDES) { gar.archer += B.garrison[s].archer; gar.infantry += B.garrison[s].infantry; }
  for (const q of B.allSquads) if (q.isGarrison) for (const s of q.soldiers) if (!s.dead) gar[s.type]++;
  // 동원한 예비군: 살아남은 병사는 예비군으로, 쓰러진 병사는 부상 판정
  if (B.roster.reserve) for (const q of B.allSquads.filter(q => q.isReserve)) { S.reserve[q.type] = q.soldiers.filter(s => !s.dead).length; S.reserveVet[q.type] = Math.min(MG.VET_MAX, (S.reserveVet[q.type] || 0) + MG.vetGain(q.xp)); }
  // 성벽 위 직할은 전투를 치를 때마다 +10 (화살은 막타 경험치를 따로 세지 않는다)
  gar.vet = Math.min(MG.VET_MAX, (gar.vet || 0) + 10);
  for (const f of B.stats.fallen.filter(f => f.gid && String(f.gid).startsWith('reserve:'))) {
    const r = rollWound(null), type = f.gid.slice(8);
    sum.wound[r]++;
    if (r === 'dead') S.stats.soldiersLost++; else gar.wounded.push({ type, reserve: true, ...newWound(r) });
  }
  for (const f of B.stats.fallen) {
    if (!f.garrison) continue;
    const r = rollWound(null);
    sum.wound[r]++;
    if (r === 'dead') S.stats.soldiersLost++; else gar.wounded.push({ type: f.type, ...newWound(r) });
  }

  // 성벽·본성·건물 피해는 다음 전투까지 남는다 (수리 전까지)
  S.walls = {};
  for (const w of B.walls) if (w.hp < w.max) S.walls[w.id] = Math.max(0, Math.round(w.hp));
  // 정비창(명성 특성): 남은 피해의 30%를 바로 고친다
  if (MG.perk('depot')) for (const id of Object.keys(S.walls)) S.walls[id] = Math.round(S.walls[id] + (MG.wallMax(id) - S.walls[id]) * 0.3);
  S.keep = Math.max(1, Math.round(B.keep.hp));
  const occRatio = Math.min(1, S.pop / Math.max(1, MG.popCap()));  // 부서지기 전 집 한도 기준
  for (const bb of B.buildings) {
    const b = S.buildings.find(x => x.id === bb.id);
    if (!b) continue;
    const was = b.hp;
    b.hp = Math.max(0, Math.round(bb.hp));
    if (was > 0 && b.hp <= 0) {
      sum.ruined.push(MG.BUILDINGS[b.type].name);
      if (b.type === 'house') {
        // 살던 사람(집 한도 대비 지금 주민 비율만큼) 중 30%만 죽고, 나머지는 집 없는 주민으로 남는다
        const occ = Math.round(MG.HOUSE_POP * b.level * occRatio), dead = Math.min(S.pop, Math.round(occ * 0.3));
        S.pop -= dead; sum.lostPop += dead;
      }
    }
  }
  // 살아남은 주민 중 다른 집 빈자리에도 못 들어간 만큼이 집 없는 주민
  sum.homeless = Math.max(0, S.pop - MG.popCap());

  // 성주가 전사하면 혈족 중에서 후계자를 고른다 (내정 화면). 혈족이 없으면 가문 단절.
  if (B.lordDead) {
    const rep = [];
    if (!lordFell(B, sum)) lordDied(rep, '전사했어요.');
    sum.lordDied = rep.length ? rep : null;
  }

  S.stats.battles++;
  S.stats.kills += B.stats.kills;
  const big = B.level % 5 === 0 ? '대습격' : '습격';
  const ret = S.nextAttack.retaliation ? `${MG.OUTPOSTS[S.nextAttack.retaliation].name}의 보복 ` : '';
  MG.chron(`전투 ${B.level}(${ret}${big}): ${B.result.win ? '막아냈어요' : '본성이 함락됐어요'} · 처치 ${B.stats.kills}${sum.ruined.length ? ` · 부서진 건물 ${sum.ruined.length}` : ''}`, 'battle');
  if (!B.result.win) {
    setOver('본성 함락');
  } else if (!S.over) {
    S.stats.wins++;
    addCrown(MG.CROWN_WIN);
    // 마물 대이동이 있는 해에는 전리품 2배
    sum.gold = MG.battleGold(S.level) * (MG.hasEffect('migration') ? 2 : 1) * (MG.perk('raider') ? 2 : 1);
    S.res.gold = Math.min(MG.storageCap(), S.res.gold + sum.gold);
    // 습격 보스를 쓰러뜨렸으면 유물
    if (B.raidBossDead) {
      sum.relic = MG.grantRelic(rollRelic(true));
      MG.chron(`${MG.ENEMY_TYPES[B.raidBossDead].name}을(를) 쓰러뜨렸어요.`, 'battle');
    }
    // 보상 카드 3장 중 하나는 내정 화면에서 고른다 (대습격은 더 좋은 카드)
    S.pendingPick = rollCards(B.level % 5 === 0);
    sum.pick = true;
    S.level++;
    scheduleAttack();
  }
  save();
  return sum;
};

// 장수 부대: 살아남은 병사, 쓰러진 병사의 부상 판정, 장수 경험치·부상·전사
function applySquads(B, sum) {
  applyLord(B, sum);
  // 전투에서 쓴 소모품
  for (const [k, n] of Object.entries(B.itemsUsed || {})) MG.S.items[k] = Math.max(0, (MG.S.items[k] || 0) - n);
  const S = MG.S, R = B.roster;
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
      MG.chron(`장수 ${g.name}이(가) ${B.conquest ? "정벌 전투" : `전투 ${B.level}`}에서 전사했어요.`, 'general');
    } else {
      if (fell) { g.injured = randInt(2, 4); g.deploy = false; line.status = `부상 (${g.injured}개월)`; }
      line.xp = Math.round((sq ? sq.xp : 0) + (fell ? 0 : MG.SURVIVE_XP));
      const vb = MG.vetRank(g.vet);
      g.vet = Math.min(MG.VET_MAX, (g.vet || 0) + MG.vetGain(sq ? sq.xp : 0));
      if (MG.vetRank(g.vet) > vb) line.vetUp = MG.VET_RANKS[MG.vetRank(g.vet)].name;
      addXp(g, line.xp);
      line.to = g.level;
    }
    sum.gens.push(line);
  }
}

// ---------- 연대기 사건 ----------
// 2~3년에 한 번 봄에 오는 큰 사건. 대부분 선택이 있고, 지속 효과를 남긴다.
const CHRONICLES = {
  draft: {
    title: '왕국 징집령', make: () => ({ n: 30 }),
    text: e => `왕국이 다른 전선에 보낼 병사 ${e.n}명을 요구해요. 보내면 왕실과 가까워지고, 거절하면 크게 서운해해요.`,
    choices: [
      { label: e => `직할 병사 ${e.n}명 보내기`, ok: e => MG.S.garrison.archer + MG.S.garrison.infantry >= e.n,
        run: e => { const g = MG.S.garrison; let n = e.n; while (n-- > 0) { if (g.infantry >= g.archer) g.infantry--; else g.archer--; } addCrown(15); return '병사를 보냈어요. 왕실 관계 +15'; } },
      { label: () => '거절하기', run: () => { addCrown(-20); return '징집을 거절했어요. 왕실 관계 -20'; } },
    ],
  },
  migration: {
    title: '마물 대이동', make: () => ({}),
    text: () => '변경 너머에서 마물 떼가 크게 움직이고 있어요. 앞으로 1년 동안 습격이 30% 커지지만, 승리 전리품도 2배가 돼요.',
    choices: [{ label: () => '대비하자', run: () => { addEffect('migration', 12); return null; } }],
  },
  winter: {
    title: '혹한의 조짐', make: () => ({ wood: 150 }),
    text: e => `올겨울은 유난히 추울 거래요. 겨울 동안 식량을 1.5배 먹어요. 땔감(목재 ${e.wood})을 미리 마련하면 피할 수 있어요.`,
    choices: [
      { label: e => `목재 ${e.wood}로 땔감 마련`, ok: e => MG.S.res.wood >= e.wood, run: e => { MG.S.res.wood -= e.wood; return '땔감을 마련해 두었어요.'; } },
      { label: () => '그냥 버티기', run: () => { addEffect('harshWinter', 12); return '겨울 동안 식량 소비가 늘어요.'; } },
    ],
  },
  goldvein: {
    title: '황금 광맥', when: () => MG.S.fields.some(f => f.type === 'mine'),
    make: () => ({}),
    text: () => '광부들이 광산 깊은 곳에서 금맥을 찾았어요. 광산 하나를 금광으로 바꾸면 철 대신 골드가 나와요.',
    choices: [
      { label: () => '금광으로 바꾸기 (그 광산의 철 수입은 사라져요)', run: () => { const f = MG.S.fields.find(x => x.type === 'mine'); f.type = 'goldmine'; return '광산 하나가 금광이 되었어요.'; } },
      { label: () => '철을 계속 캐기', run: () => '그대로 철을 캐요.' },
    ],
  },
  pilgrims: {
    title: '성지 순례단', make: () => ({ gold: 200 }),
    text: e => `먼 길을 가는 순례단이 쉬어 가길 청해요. 받아들이면 헌금 골드 ${e.gold}을 받지만, 병을 옮길지도 몰라요(30%).`,
    choices: [
      { label: () => '받아들이기', run: e => {
        MG.S.res.gold += e.gold;
        if (Math.random() < 0.3) { let n = 0; for (const g of MG.S.generals) { const k = Math.floor(g.healthy * 0.1); g.healthy -= k; n += k; for (let i = 0; i < k; i++) g.wounded.push({ sev: 'light', left: 1 }); } return `헌금을 받았지만 병이 돌아 병사 ${n}명이 앓아누웠어요.`; }
        return `헌금 골드 ${e.gold}을 받았어요.`;
      } },
      { label: () => '돌려보내기', run: () => '순례단이 다른 곳으로 떠났어요.' },
    ],
  },
  marriage: {
    title: '이웃 영주의 혼담', when: () => MG.S.lord.age >= 18 && MG.S.lord.age <= 45, make: () => ({ gold: 300 }),
    text: e => `이웃 영주가 성주에게 혼담을 넣었어요. 받아들이면 혼례 비용 골드 ${e.gold}이 들지만, 3년 동안 아이가 태어날 확률이 2배가 돼요.`,
    choices: [
      { label: e => `골드 ${e.gold}으로 혼례 치르기`, ok: e => MG.S.res.gold >= e.gold, run: e => { MG.S.res.gold -= e.gold; addEffect('marriage', 36); return '혼례를 치렀어요.'; } },
      { label: () => '정중히 거절', run: () => '혼담을 거절했어요.' },
    ],
  },
  envoy: {
    title: '마물의 사신', make: () => ({ gold: 300, food: 200 }),
    text: e => `마물 쪽에서 사신이 왔어요. 공물(골드 ${e.gold}, 식량 ${e.food})을 내면 1년 동안 습격하지 않겠대요. 거절하면 다음 습격이 20% 커져요.`,
    choices: [
      { label: e => '공물 바치기', ok: e => MG.S.res.gold >= e.gold && MG.S.res.food >= e.food,
        run: e => { const S = MG.S; S.res.gold -= e.gold; S.res.food -= e.food; S.nextAttack.month = Math.max(S.nextAttack.month, S.month + 12); return '1년 동안 습격이 없어요.'; } },
      { label: () => '거절하기', run: () => { MG.S.nextAttack.mul = (MG.S.nextAttack.mul || 1) * 1.2; return '다음 습격이 커져요.'; } },
    ],
  },
  unrest: {
    title: '반란의 기미', make: () => ({}),
    text: () => '무거운 세금에 주민들의 불만이 커졌어요. 세금을 낮추거나, 병사를 풀어 누를 수 있어요.',
    choices: [
      { label: () => '1년 동안 세금 -30%', run: () => { addEffect('lowtax', 12); return '세금을 낮췄어요.'; } },
      { label: () => '병사로 진압', run: () => {
        const S = MG.S, lost = Math.round(S.pop * 0.1); S.pop -= lost;
        const n = Math.round((S.garrison.infantry) * 0.1); S.garrison.infantry -= n; for (let i = 0; i < n; i++) S.garrison.wounded.push({ type: 'infantry', sev: 'light', left: 1 });
        return `진압했어요. 주민 ${lost}명이 떠나고 병사 ${n}명이 다쳤어요.`;
      } },
    ],
  },
};
function rollChronicle() {
  const pool = Object.entries(CHRONICLES).filter(([, c]) => !c.when || c.when());
  const [type, c] = pool[(Math.random() * pool.length) | 0];
  MG.S.cevent = { type, ...c.make() };
}
MG.chronicleView = () => {
  const e = MG.S.cevent;
  if (!e) return null;
  const c = CHRONICLES[e.type];
  return { title: c.title, text: c.text(e), choices: c.choices.map(ch => ({ label: ch.label(e), ok: !ch.ok || ch.ok(e) })) };
};
MG.resolveChronicle = i => {
  const S = MG.S, e = S.cevent, ch = e && CHRONICLES[e.type].choices[i];
  if (!ch || (ch.ok && !ch.ok(e))) return '고를 수 없어요';
  const out = ch.run(e);
  MG.chron(`${CHRONICLES[e.type].title}: ${ch.label(e)}${out ? ` — ${out}` : ''}`, 'event');
  S.cevent = null;
  save();
  return out;
};

// ---------- 명성과 해금 (캠페인 바깥에 따로 저장) ----------
const META_KEY = 'margrave_meta';
MG.meta = () => {
  if (MG._meta) return MG._meta;
  let m = null;
  try { m = JSON.parse(store.get(META_KEY)); } catch (e) { m = null; }
  m = m || {};
  m.renown = m.renown || 0;
  m.unlocked = m.unlocked || {};
  m.unlocked.domain = m.unlocked.domain || ['none'];
  m.unlocked.bonus = m.unlocked.bonus || [];
  m.unlocked.siege = m.unlocked.siege || 0;
  m.history = m.history || [];
  m.perks = m.perks || [];
  // 모은 명성 합계 (특성 칸이 늘어나는 기준). 예전 기록은 지난 캠페인에서 계산한다
  if (m.earned == null) m.earned = m.history.reduce((a, h) => a + (h.renown || 0), 0);
  return (MG._meta = m);
};
const saveMeta = () => { try { store.set(META_KEY, JSON.stringify(MG.meta())); } catch (e) { /* 무시 */ } };
MG.saveMeta = saveMeta;
MG.awardRenown = S => {
  if (S.renownAwarded) return;
  const m = MG.meta(), r = S.renown || MG.renownOf(S);
  m.renown += r.total;
  m.earned = (m.earned || 0) + r.total;
  m.history.unshift({ endedAt: Date.now(), lord: S.lord.name, gens: S.lord.gen, years: Math.floor((S.month - 2) / 12), wins: S.stats.wins,
    siege: S.siege || 0, reason: S.overReason, renown: r.total });
  m.history = m.history.slice(0, 20);
  S.renownAwarded = true;
  saveMeta();
};
// kind: 'domain' | 'bonus' | 'siege'
MG.unlockCost = (kind, id) => (kind === 'domain' ? MG.DOMAINS[id].cost : kind === 'bonus' ? MG.BONUSES[id].cost : MG.siegeCost(MG.meta().unlocked.siege + 1));
MG.buyUnlock = (kind, id) => {
  const m = MG.meta(), cost = MG.unlockCost(kind, id);
  if (kind === 'siege' && m.unlocked.siege >= MG.SIEGE_MAX) return '이미 모두 해금했어요';
  if ((kind === 'domain' && m.unlocked.domain.includes(id)) || (kind === 'bonus' && m.unlocked.bonus.includes(id))) return '이미 해금했어요';
  if (m.renown < cost) return '명성이 모자라요';
  m.renown -= cost;
  if (kind === 'domain') m.unlocked.domain.push(id);
  else if (kind === 'bonus') m.unlocked.bonus.push(id);
  else m.unlocked.siege++;
  saveMeta();
  return null;
};

// ---------- 저장 슬롯 ----------
// 자동 저장(KEY)과 별개로 수동 슬롯 3개. 슬롯에는 저장 시각과 상태 전체가 들어간다.
MG.SLOTS = 3;
const slotKey = i => `margrave_slot_${i}`;
const stateLabel = s => ({ lord: s.lord.name, gen: s.lord.gen || 1, year: 1 + Math.floor(s.month / 12), month: s.month % 12 + 1,
  battles: s.stats.battles, level: s.level });
MG.slotInfo = i => {
  try {
    const d = JSON.parse(store.get(slotKey(i)));
    return d && d.state ? { savedAt: d.savedAt, ...stateLabel(d.state) } : null;
  } catch (e) { return null; }
};
MG.saveSlot = i => {
  if (MG.S.over) return '끝난 캠페인은 저장할 수 없어요';
  try { store.set(slotKey(i), JSON.stringify({ savedAt: Date.now(), state: MG.S })); }
  catch (e) { return '저장하지 못했어요 (브라우저 저장 공간 문제)'; }
  return `슬롯 ${i}에 저장했어요.`;
};
// 불러온 상태를 검사하고, 빠진 값을 채운 뒤 지금 진행으로 삼는다 (자동 저장도 덮어씀)
function adopt(state) {
  if (!state || state.version !== 2 || !Array.isArray(state.generals)) return '올바른 저장이 아니에요';
  MG.S = state;
  migrate(state);
  MG.ensureMarket();
  save();
  return null;
}
MG.loadSlot = i => {
  let d;
  try { d = JSON.parse(store.get(slotKey(i))); } catch (e) { d = null; }
  if (!d) return '빈 슬롯이에요';
  return adopt(d.state) || `슬롯 ${i}을(를) 불러왔어요.`;
};
MG.deleteSlot = i => { try { store.remove(slotKey(i)); } catch (e) { /* 무시 */ } return `슬롯 ${i}을(를) 지웠어요.`; };
MG.exportSave = () => JSON.stringify({ game: 'margrave', savedAt: Date.now(), state: MG.S });
MG.importSave = text => {
  let d;
  try { d = JSON.parse(text); } catch (e) { return '파일을 읽지 못했어요'; }
  if (!d || d.game !== 'margrave') return '변경백 저장 파일이 아니에요';
  return adopt(d.state) || '파일에서 불러왔어요.';
};

MG.resetCampaign = opts => {
  try { store.remove(KEY); } catch (e) { /* 무시 */ }
  return MG.newCampaign(opts);
};
})();
