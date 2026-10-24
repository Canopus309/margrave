// 캠페인 상태: 장수 성장, 병원, 보충, 무기, 저장. 전투 사이에 이어지는 모든 것.
(() => {
const KEY = 'margrave_save_v1';
const pick = arr => arr[(Math.random() * arr.length) | 0];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(MG.S)); } catch (e) { /* 저장 불가 환경: 이번 세션만 유지 */ }
}
MG.saveCampaign = save;

MG.loadCampaign = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1 && !s.over) return (MG.S = s);
  } catch (e) { /* 손상된 저장은 무시하고 새로 시작 */ }
  return null;
};

MG.newCampaign = () => {
  const s = MG.S = {
    version: 1, level: 1, month: 0, nextId: 1, over: false,
    generals: [], lord: { name: MG.LORD.name, gen: 1 },
    garrison: { archer: MG.GARRISON.archer, infantry: MG.GARRISON.infantry, wounded: [] },
    inventory: [], stats: { battles: 0, wins: 0, kills: 0, generalsLost: 0, soldiersLost: 0 },
  };
  for (const a of MG.START_ARMY) {
    s.generals.push({ id: s.nextId++, name: a.general, type: a.type, baseLead: a.lead, slot: a.at,
      level: 1, xp: 0, cls: null, adv: false, weapon: null, injured: 0, dead: false,
      deploy: true, mobilize: false, healthy: a.lead * 10, wounded: [] });
  }
  save();
  return s;
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

function rollWeapon(level) {
  const r = Math.random();
  const grade = r < 0.03 + 0.01 * level ? 'legendary' : r < 0.15 + 0.03 * level ? 'heroic' : r < 0.45 + 0.03 * level ? 'rare' : 'common';
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
  let cap = MG.HOSPITAL_CAP, recovered = 0;
  for (const p of MG.patients()) {
    const fresh = p.kind === 'general' ? p.g.injFresh : p.w.fresh;
    const inCare = cap-- > 0;
    if (fresh || !inCare) continue;
    if (p.kind === 'general') { if (--p.g.injured === 0) { p.g.deploy = true; recovered++; } }
    else p.w.left--;
  }
  for (const g of S.generals) {
    g.injFresh = false;
    const back = g.wounded.filter(w => w.left <= 0).length;
    g.healthy += back; recovered += back;
    g.wounded = g.wounded.filter(w => w.left > 0);
    g.wounded.forEach(w => { w.fresh = false; });
    if (!g.wounded.length) g.mobilize = false;
  }
  for (const w of S.garrison.wounded) if (w.left <= 0) { S.garrison[w.type]++; recovered++; }
  S.garrison.wounded = S.garrison.wounded.filter(w => w.left > 0);
  S.garrison.wounded.forEach(w => { w.fresh = false; });
  return recovered;
}

function rollWound(prev) {
  const t = MG.WOUND_ROLL[prev || 'none'], r = Math.random();
  return r < t.light ? 'light' : r < t.light + t.heavy ? 'heavy' : 'dead';
}
const newWound = sev => ({ sev, left: sev === 'light' ? 1 : 2 + (Math.random() < 0.5 ? 1 : 0), fresh: true });

// ---------- 보충 ----------
function recruit() {
  const S = MG.S;
  let pool = MG.RECRUITS_PER_MONTH;
  const given = pool;
  const needs = S.generals.filter(g => !g.dead).map(g => ({ g, need: MG.genCap(g) - g.healthy - g.wounded.length }));
  while (pool > 0) {
    const n = needs.filter(x => x.need > 0).sort((a, b) => b.need - a.need)[0];
    if (!n) break;
    n.g.healthy++; n.need--; pool--;
  }
  const gar = S.garrison, base = MG.GARRISON.archer + MG.GARRISON.infantry;
  while (pool > 0 && gar.archer + gar.infantry + gar.wounded.length < base) {
    if (gar.archer < MG.GARRISON.archer) gar.archer++; else gar.infantry++;
    pool--;
  }
  return given - pool;
}

// ---------- 전투 준비 ----------
// 전투에 나갈 부대 구성. 저장 상태는 건드리지 않는다(전투 중 새로고침하면 전투 전으로 돌아감).
MG.buildRoster = () => {
  const S = MG.S, squads = [];
  for (const g of S.generals) {
    const withGeneral = !g.dead && g.deploy;
    const mob = g.mobilize ? g.wounded.map((w, idx) => ({ idx, sev: w.sev })) : [];
    if (!withGeneral && g.healthy + mob.length === 0) continue;
    squads.push({ gid: g.id, name: g.name, type: g.type, slot: g.slot, title: MG.genTitle(g),
      general: withGeneral ? { name: g.name, injured: g.injured > 0 } : null,
      healthy: g.healthy, mob, mods: MG.genMods(g), level: g.level,
      weaponAtk: g.weapon ? MG.WEAPON_GRADES[g.weapon.grade].atk : 1 });
  }
  return { squads, lord: { name: S.lord.name }, garrison: { archer: S.garrison.archer, infantry: S.garrison.infantry } };
};

// ---------- 전투 결과 반영 ----------
MG.applyResult = B => {
  const S = MG.S, R = B.roster, sum = { gens: [], wound: { light: 0, heavy: 0, dead: 0 }, weapon: null, heir: null };
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
      if (fell) { g.injured = 2 + (Math.random() < 0.5 ? 1 : 0); g.injFresh = true; g.deploy = false; line.status = `부상 (${g.injured}전투 결장)`; }
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

  if (B.lordDead) {
    // 혈족 후계(자녀 랜덤 출생)는 3단계. 지금은 이름만 바뀐 후계자가 잇는다.
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
    sum.recovered = tickHospital();
    sum.recruits = recruit();
    S.level++;
    S.month++;
  }
  save();
  return sum;
};

MG.resetCampaign = () => {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  return MG.newCampaign();
};
})();
