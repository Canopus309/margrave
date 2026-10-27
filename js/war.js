// 전쟁: 습격 일정·예보, 원정, 거점 정벌과 보복, 적 세력의 시대, 전투 결과 반영.
(() => {
const { pick, randInt, save, act, freeAct, addCrown, addXp, rollWeapon, applyLord, lordDied, setOver, lordFell, woundToReserve, rollWound, newWound, rollRelic, rollCards } = MG.lib;

function scheduleAttack(gap) {
  const S = MG.S;
  if (gap == null) { const [a, b] = MG.attackGap(MG.year()); gap = randInt(a, b); }
  S.nextAttack = { month: S.month + gap, dirs: MG.rollDirs(S.level), scout: 0, faction: S.era.main, mix: S.era.mix };
}
MG.isAttackMonth = () => MG.S.nextAttack && MG.S.month >= MG.S.nextAttack.month;
// 이번 달에 꼭 치러야 하는 전투가 있는가 (정벌군 도착 또는 습격)
MG.mustFight = () => !!MG.S.pendingConquest || MG.isAttackMonth();
// 정벌한 거점이 습격을 바꾼다: 고블린 소굴은 규모 -15%, 오크 야영지는 오크 -30%

// 엔딩 뒤 계속 다스리면 해마다 습격이 커진다
MG.outpostWaveMul = () => (MG.hasOutpost('goblin') ? 0.85 : 1) * MG.endlessMul();
MG.endlessMul = () => (MG.S.endedMonth != null ? 1 + MG.ENDLESS_STEP * Math.floor((MG.S.month - MG.S.endedMonth) / 12) : 1);
MG.citadelOpen = () => Object.keys(MG.OUTPOSTS).filter(k => !MG.OUTPOSTS[k].final).every(MG.hasOutpost);
MG.typeMul = () => (MG.hasOutpost('orc') ? { orc: 0.7, orcThrower: 0.7 } : {});
// 보복 습격 배율: 다음 전투가 대습격이면 절반만 (×1.5 → ×1.25)
MG.retaliationMul = () => {
  const f = MG.perk('conqueror') ? 1.25 : MG.perk('raider') ? 2.25 : MG.RETALIATION_MUL;
  return MG.S.level % 5 === 0 ? 1 + (f - 1) / 2 : f;
};
// 이 거점을 지금 정벌하면 오는 보복 습격 (거점 카드 미리 보기)
MG.retaliationPreview = id => {
  const A = MG.S.nextAttack, O = MG.OUTPOSTS[id];
  return MG.attackGroups({ ...A, mul: (A.mul || 1) * MG.retaliationMul(), faction: O.faction || A.faction, mix: O.faction ? null : A.mix, retaliation: id });
};
// 다음 습격의 적 구성 (고블린 둥지를 소탕하면 줄어든다)
MG.attackGroups = (A = MG.S.nextAttack) => {
  const S = MG.S, tm = MG.typeMul(), diff = MG.DIFFICULTY[S.difficulty || 'normal'];
  // 전투(createBattle)와 같은 배율: 난이도 개수 배율, 어려움·악몽은 초반(전투 1~2) 배율도
  const mul = (A.mul || 1) * (MG.hasEffect('migration') ? 1.3 : 1) * MG.siegeEnemyMul(S.siege || 0) * MG.outpostWaveMul()
    * diff.count * (diff.early && S.level <= 2 ? diff.early : 1);
  return MG.buildWaves(S.level, A.dirs, A.faction, A.mix, diff, A.retaliation).groups.map(g => MG.ENEMY_TYPES[g.type].boss ? g : ({ ...g, count: Math.max(1, Math.round(g.count * mul * (tm[g.type] || 1))) }));
};
// 정찰 전에는 ±1달 범위만 보인다
MG.attackForecast = () => {
  const A = MG.S.nextAttack, left = A.month - MG.S.month;
  if (left <= 0) return { text: '이번 달', exact: true };
  // 보복 습격은 날짜를 알고 온다
  if (A.scout >= 1 || A.retaliation) return { text: `${left}개월 뒤`, exact: true };
  return { text: `약 ${Math.max(1, left - 1)}~${left + 1}개월 뒤`, exact: false };
};

MG.actScout = () => (MG.S.nextAttack.scout >= 2 ? '더 알아낼 것이 없어요' : (MG.perk('scouts') ? freeAct : act)({ gold: 20 }, () => { MG.S.nextAttack.scout++; }));

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
  return `${g.name} 부대가 ${MG.josa(MG.SITES[site.type].name, '으로')} 떠났어요. ${site.months}개월 뒤 돌아와요.`;
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
    for (let i = 0; i < hurt; i++) { const r = rollWound(null); g.healthy--; if (r === 'dead') S.stats.soldiersLost++; else woundToReserve(g, newWound(r)); }
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
  return (MG.perk('scouts') ? freeAct : act)(MG.CONQUEST_SCOUT, () => { cq(id).scout = true; }) || `${MG.josa(MG.OUTPOSTS[id].name, '을를')} 정찰했어요.`;
};
// 진지 수비대 규모: 실패할 때마다 +20%, 포위 단계 반영
MG.conquestMul = id => (1 + MG.CONQUEST_FAIL_MUL * cq(id).fails) * MG.siegeEnemyMul(MG.S.siege || 0) * (MG.perk('conqueror') ? 0.85 : 1);
// 실제 진지 수비 배율 (난이도 개수 배율 포함, 정찰 표시와 전투가 같이 쓴다)
MG.conquestFortMul = id => MG.conquestMul(id) * MG.DIFFICULTY[MG.S.difficulty || 'normal'].count;
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
  return `정벌군이 ${MG.josa(O.name, '으로')} 떠났어요. 다음 달 도착해 전투를 벌여요.`;
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
    MG.chron(`${MG.josa(O.name, '을를')} ${O.final ? '함락' : '정벌'}했어요!${B.bossDead ? ` ${MG.josa(MG.ENEMY_TYPES[O.boss].name, '을를')} 쓰러뜨렸어요.` : ''}`, 'battle');
    if (O.final) {
      // 엔딩: 내정 화면에서 엔딩을 보고, 계속 다스릴지 마칠지 고른다
      S.ended = true; S.endedMonth = S.month; S.endingPending = true;
      sum.ending = true;
      MG.chron(`${MG.josa(S.lord.name, '이가')} 검은 성채를 무너뜨려 변경에 평화가 찾아왔어요.`, 'lord');
    } else {
      // 보복 습격: 늦어도 두 달 안에 크게 온다
      const A = S.nextAttack;
      const f = MG.retaliationMul();
      A.mul = (A.mul || 1) * f;
      if (O.faction) { A.faction = O.faction; A.mix = null; }
      A.month = Math.min(A.month, S.month + MG.RETALIATION_MONTHS);
      A.retaliation = M.id;
      sum.retaliation = Math.round(f * 100) / 100;
      sum.retaliationIn = A.month - S.month;
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
  const text = `새 시대: ${MG.josa(MG.FACTIONS[main].name, '이가')} 변경을 노리기 시작했어요${mix ? ` (${MG.FACTIONS[mix].name}도 섞여 와요)` : ''}.`;
  rep.push(text);
  MG.chron(text, 'event');
}
MG.factionText = (f, mix) => `${MG.FACTIONS[f || 'goblin'].name}${mix ? ` + ${MG.FACTIONS[mix].name}` : ''}`;

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
  S.keep = B.result.win ? Math.max(1, Math.round(B.keep.hp)) : 0;
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
      MG.chron(`${MG.josa(MG.ENEMY_TYPES[B.raidBossDead].name, '을를')} 쓰러뜨렸어요.`, 'battle');
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
    g.healthy = alive.filter(s => !s.isGeneral).length;
    for (const f of fallenOf(rs.gid)) {
      if (f.general) continue;
      const r = rollWound(null);
      sum.wound[r]++;
      if (r === 'dead') S.stats.soldiersLost++; else woundToReserve(g, newWound(r));
    }
    if (!rs.general) continue;
    const fell = fallenOf(rs.gid).some(f => f.general);
    const line = { name: g.name, from: g.level, to: g.level, xp: 0, status: '생존' };
    if (fell && rs.general.injured) {
      g.dead = true; g.deploy = false; S.stats.generalsLost++;
      line.status = '전사';
      MG.chron(`장수 ${MG.josa(g.name, '이가')} ${B.conquest ? "정벌 전투" : `전투 ${B.level}`}에서 전사했어요.`, 'general');
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

Object.assign(MG.lib, { scheduleAttack, rollSites, returnExpeditions, advanceMarch, rollEra });
})();
