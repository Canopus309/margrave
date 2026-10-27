// 성주와 가문: 장수 만들기·성장, 성주 능력치, 후계, 해마다 나이·출생, 주점·발탁·은퇴, 무기.
(() => {
const { pick, randInt, save, act, addCrown } = MG.lib;

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
    deploy: true, healthy: o.healthy || 0, vet: o.vet || 0,
    age: o.age || randInt(20, 35), traits: o.traits || MG.rollTraits(), blood: !!o.blood };
}

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
  if (g.weapon) S.inventory.push(g.weapon);
  S.generals = S.generals.filter(x => x !== g);
}

function lordDied(rep, why) {
  const S = MG.S, cur = S.lineage[S.lineage.length - 1];
  rep.push(`${MG.josa(S.lord.name, '이가')} ${why}`);
  MG.chron(`${MG.josa(S.lord.name, '이가')} ${why}`, 'lord');
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
    ? `${MG.josa(S.lord.name, '이가')} 변경을 지킨 이야기를 마쳤어요.` : '본성이 함락되어 변경 기지가 무너졌어요.', 'lord');
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
  MG.chron(`${MG.josa(S.lord.name, '이가')} ${gen}대 성주가 되었어요${S.lord.minor ? ` (${S.lord.age}세, 어린 성주)` : ''}.`, 'lord');
  // 본국이 계승을 인정하며 선물을 보낸다 (관계가 좋을수록 크다)
  // 명성 특성: 혈통 계승(선대 능력치 1/3), 양자 계승(+2, 본국 관계 -10), 무가의 피(+2)
  const statKeys = Object.keys(S.lord.stats), bump = n => { for (let i = 0; i < n; i++) S.lord.stats[pick(statKeys)]++; };
  if (prevStats && MG.perk('lineage')) for (const k of statKeys) S.lord.stats[k] += Math.floor((prevStats[k] || 0) / 3);
  if (MG.perk('adoption')) { bump(2); addCrown(-10); }
  if (MG.perk('martial')) bump(2);
  const gift = 100 + 3 * S.crown;
  S.res.gold = Math.min(MG.storageCap(), S.res.gold + gift);
  S.report = [`${MG.josa(S.lord.name, '이가')} ${gen}대 성주가 되었어요.${S.lord.minor ? ` 아직 ${S.lord.age}세라 ${MG.ADULT_AGE}세까지는 전투에 나가지 않아요.` : ''}`,
    `본국이 계승을 인정하며 축하 선물로 골드 ${gift}을 보냈어요.`];
  save();
};

// 해가 바뀔 때: 나이, 출생, 성년, 노환
function newYear(rep) {
  // 왕의 대리인: 해마다 지원병 20명, 대신 가진 골드의 10%를 공물로
  if (MG.perk('regent')) { MG.S.garrison.archer += 10; MG.S.garrison.infantry += 10; const t = Math.floor(MG.S.res.gold * 0.1); MG.S.res.gold -= t; rep.push(`왕실이 지원병 20명을 보냈고, 공물로 골드 ${t}을 바쳤어요.`); }
  const S = MG.S, L = S.lord;
  L.age++;
  if (L.minor && L.age >= MG.ADULT_AGE) { L.minor = false; rep.push(`${MG.josa(L.name, '이가')} 성년이 되어 이제 전투에 나가요.`); }
  for (const g of S.generals) if (!g.dead) g.age++;
  for (const c of S.family) c.age++;
  // 혼담을 받아들였으면 3년 동안 출생 확률 2배
  const birth = (MG.BIRTH_CHANCE + (MG.perk('fertile') ? 0.1 : 0)) * (MG.hasEffect('marriage') ? 2 : 1);
  if (L.age >= 20 && L.age <= 45 && Math.random() < birth) {
    const c = { id: S.nextId++, name: MG.randomName(), age: 0, traits: MG.rollTraits() };
    S.family.push(c);
    rep.push(`성주에게 아이가 태어났어요: ${c.name} (${c.traits.map(t => MG.TRAITS[t].name).join(', ')})`);
    MG.chron(`성주에게 아이 ${MG.josa(c.name, '이가')} 태어났어요.`, 'lord');
  }
  for (const c of S.family.filter(c => c.age >= MG.ADULT_AGE)) {
    const type = pick(Object.keys(MG.WEAPON_KINDS));
    S.generals.push(newGeneral({ name: c.name, type, lead: (Math.random() < 0.3 ? 2 : 1) + (MG.perk('schooling') ? 1 : 0), level: MG.perk('academy') ? 3 : 1, age: c.age, traits: c.traits, blood: true }));
    rep.push(`${MG.josa(c.name, '이가')} 성년이 되어 장수가 되었어요 (${MG.UNIT_TYPES[type].name}).`);
    MG.chron(`${MG.josa(c.name, '이가')} 성년이 되어 장수가 되었어요.`, 'general');
  }
  S.family = S.family.filter(c => c.age < MG.ADULT_AGE);
  for (const g of S.generals) {
    if (g.dead || Math.random() >= MG.deathChance(g.age) * (MG.perk('healthy') ? 0.5 : 1)) continue;
    g.dead = true; g.deploy = false; S.stats.generalsLost++;
    rep.push(`장수 ${MG.josa(g.name, '이가')} ${g.age}세로 세상을 떠났어요.`);
    MG.chron(`장수 ${MG.josa(g.name, '이가')} ${g.age}세로 세상을 떠났어요.`, 'general');
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
  MG.chron(`떠돌이 장수 ${MG.josa(t.g.name, '을를')} 고용했어요 (${MG.UNIT_TYPES[t.g.type].name} Lv.${t.g.level}).`, 'general');
  save();
  return `${MG.josa(t.g.name, '을를')} 고용했어요. 병사는 모집으로 채워요.`;
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
    MG.chron(`직할 ${MG.UNIT_TYPES[type].name} ${MG.josa(g.name, '을를')} 장수로 발탁했어요.`, 'general');
  });
  return why || `직할 ${MG.UNIT_TYPES[type].name} ${MG.josa(g.name, '을를')} 장수로 발탁했어요.`;
};
// 해고: 가문 장수(후계 후보)는 내보낼 수 없다. 원정 중이면 돌아온 뒤에.
MG.canDismiss = g => !g.dead && !g.blood && !g.away;
MG.dismiss = g => {
  if (g.blood) return '가문 장수는 해고할 수 없어요';
  if (g.away) return '원정에서 돌아온 뒤에 해고할 수 있어요';
  if (g.dead) return '이미 세상을 떠났어요';
  disband(g);
  save();
  return `${MG.josa(g.name, '을를')} 내보냈어요. 부대 병사는 직할로 갔어요.`;
};
MG.retire = g => {
  if (g.dead || g.age < 45) return '45세부터 은퇴할 수 있어요';
  if (g.away) return '돌아온 뒤에 은퇴할 수 있어요';
  disband(g);
  MG.S.retired++;
  save();
  return `${MG.josa(g.name, '이가')} 은퇴해 교관이 되었어요. 훈련 경험치가 늘어요.`;
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

// 성주가 쓰러졌을 때: 부상 없이 나갔으면 2~4개월 부상으로 끝나고 true, 부상 중이었으면 false(전사)
function lordFell(B, sum) {
  const L = MG.S.lord;
  if (B.roster.lord.injured) return false;
  L.injured = randInt(2, 4); L.deployInjured = false;
  sum.lordHurt = L.injured;
  MG.chron(`${MG.josa(L.name, '이가')} ${B.conquest ? '정벌 전투' : `전투 ${B.level}`}에서 쓰러져 ${L.injured}개월 부상을 입었어요.`, 'lord');
  return true;
}

Object.assign(MG.lib, { newGeneral, lordGrowth, applyLord, lordDied, setOver, newYear, refreshTavern, addXp, rollWeapon, lordFell });
})();
