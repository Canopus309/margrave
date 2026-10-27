// 캠페인 시작과 진행: 새 캠페인, 예전 저장 이관, 한 달 마치기, 저장 슬롯.
(() => {
const { KEY, store, pick, randInt, save, nextChronicleMonth, newGeneral, lordGrowth, newYear, refreshTavern, placeBuilding, moveMarket, tickTraining, tickHospital, woundToReserve, arriveSupport, rollEvent, CHRONICLES, rollChronicle, scheduleAttack, rollSites, returnExpeditions, advanceMarch, rollEra } = MG.lib;

MG.loadCampaign = () => {
  try {
    const s = JSON.parse(store.get(KEY));
    if (s && s.version === 2 && !s.over) { MG.S = s; migrate(s); return s; }
  } catch (e) { /* 손상된 저장은 무시하고 새로 시작 */ }
  return null;
};

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
  // 예전 저장: 장수 부대에 남아 있던 부상병은 예비군 부상병으로
  for (const g of s.generals) {
    for (const w of g.wounded || []) s.garrison.wounded.push({ type: g.type, reserve: true, vet: g.vet || 0, sev: w.sev, left: w.left });
    delete g.wounded; delete g.mobilize;
  }
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
  MG.chron(`${MG.josa(MG.LORD.name, '이가')} 변경의 전진 기지에 부임했어요.${extra.length ? ` (${extra.join(', ')})` : ''}`, 'lord');
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
  return adopt(d.state) || `슬롯 ${MG.josa(i, '을를')} 불러왔어요.`;
};
MG.deleteSlot = i => { try { store.remove(slotKey(i)); } catch (e) { /* 무시 */ } return `슬롯 ${MG.josa(i, '을를')} 지웠어요.`; };
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
