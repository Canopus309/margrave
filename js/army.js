// 군대: 모집, 훈련소와 예비군, 편제, 장수 훈련, 병원과 부상, 전투에 나갈 구성.
(() => {
const { randInt, save, pay, act, addXp } = MG.lib;

// 다친 장수 부대 병사는 바로 부대에서 빠져 예비군 부상병이 된다 (병원에서 나으면 예비군으로)
function woundToReserve(g, w) { MG.S.garrison.wounded.push({ type: g.type, reserve: true, vet: g.vet || 0, ...w }); }

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
    const need = MG.genCap(g) - g.healthy;
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
  if (!MG.canRefill(type)) return `${MG.josa(MG.BUILDINGS[MG.REFILL_BUILDING[type]].name, '이가')} 있어야 ${MG.josa(MG.UNIT_TYPES[type].name, '을를')} 훈련해요`;
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
MG.assignable = g => Math.min(Math.max(0, MG.genCap(g) - g.healthy), MG.S.reserve[g.type] || 0);
function fillSquad(g, n) {
  const S = MG.S;
  g.vet = MG.vetMix(g.vet, g.healthy, S.reserveVet[g.type], n);
  S.reserve[g.type] -= n; g.healthy += n;
}
MG.assignReserve = (gid, want) => {
  const S = MG.S, g = S.generals.find(x => x.id === gid);
  if (!g || g.dead) return '장수가 없어요';
  if (g.away) return '원정·정벌에서 돌아온 뒤에 편제해요';
  const n = Math.min(want, MG.assignable(g));
  if (n <= 0) return MG.genCap(g) <= g.healthy ? '부대가 가득 찼어요' : `${MG.UNIT_TYPES[g.type].name} 예비군이 없어요. 훈련소에서 훈련시켜요`;
  fillSquad(g, n);
  save();
  return `${MG.UNIT_TYPES[g.type].name} 예비군 ${n}명을 ${g.name} 부대에 편제했어요.`;
};
// 모든 장수 부대의 빈자리를 같은 병종 예비군으로 채운다 (성에 있는 부대만, 목록 순서대로)
MG.assignAllCount = () => {
  const pool = { ...MG.S.reserve };
  let n = 0;
  for (const g of MG.S.generals) {
    if (g.dead || g.away) continue;
    const k = Math.min(Math.max(0, MG.genCap(g) - g.healthy), pool[g.type] || 0);
    pool[g.type] = (pool[g.type] || 0) - k; n += k;
  }
  return n;
};
MG.assignAll = () => {
  const S = MG.S, done = [];
  for (const g of S.generals) {
    if (g.dead || g.away) continue;
    const n = MG.assignable(g);
    if (n <= 0) continue;
    fillSquad(g, n);
    done.push(`${g.name} +${n}`);
  }
  if (!done.length) return '채울 빈자리나 맞는 예비군이 없어요';
  save();
  return `빈자리를 채웠어요: ${done.join(', ')}.`;
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
// 훈련받는 장수: 성에 있고 다치지 않은 장수
MG.trainees = () => MG.S.generals.filter(g => !g.dead && !g.injured && !g.away);
MG.actTrain = () => {
  const l = MG.bLevel('training');
  if (!l) return '훈련장이 없어요';
  if (!MG.trainees().length) return '성에 훈련할 장수가 없어요 (원정·정벌·부상 중)';
  return act(null, () => {
    for (const g of MG.trainees()) addXp(g, MG.trainXp());
    // 병사 숙련도도 훈련장 단계 × 10
    for (const g of MG.S.generals) if (!g.dead && !g.away) g.vet = Math.min(MG.VET_MAX, (g.vet || 0) + 10 * l);
    MG.S.garrison.vet = Math.min(MG.VET_MAX, (MG.S.garrison.vet || 0) + 10 * l);
  });
};

// ---------- 병원 ----------
// 장수 먼저, 그다음 들어온 순서대로 수용 인원만큼만 회복이 진행된다

MG.patients = () => {
  const S = MG.S, list = [];
  for (const g of S.generals) if (!g.dead && g.injured > 0) list.push({ kind: 'general', g });
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
  // 나은 직할 병사는 성벽으로, 나은 예비군은 예비군으로
  for (const w of S.garrison.wounded) if (w.left <= 0) { if (w.reserve) addReserve(w.type, 1, w.vet != null ? w.vet : S.reserveVet[w.type]); else S.garrison[w.type]++; recovered++; }
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
    if (!withGeneral && g.healthy === 0) continue;
    // 시작 자리는 출전 순서대로 큰길 → 성벽 안길
    const slot = MG.SQUAD_SLOTS[squads.length % MG.SQUAD_SLOTS.length];
    squads.push({ gid: g.id, name: g.name, type: g.type, slot, title: MG.genTitle(g),
      general: withGeneral ? { name: g.name, injured: g.injured > 0, ageMul: MG.ageMul(g.age) } : null,
      healthy: g.healthy, level: g.level, train, cls: g.cls,
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
  if (march) { roster.outpost = march.id; roster.fortMul = MG.conquestFortMul(march.id); }
  return roster;
};

Object.assign(MG.lib, { woundToReserve, tickTraining, tickHospital, rollWound, newWound });
})();
