// 캠페인 공용: 저장소, 행동·비용 처리, 연대기 기록, 본국 관계, 명성. 다른 캠페인 파일이 MG.lib로 함께 쓴다.
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
const shuffle = arr => arr.sort(() => Math.random() - 0.5);
// 자원을 더한다 (창고 한도까지)
const addRes = (k, n) => { MG.S.res[k] = Math.min(MG.storageCap(), MG.S.res[k] + n); };

function save() {
  try { store.set(KEY, JSON.stringify(MG.S)); } catch (e) { /* 저장 불가 환경: 이번 세션만 유지 */ }
}
MG.saveCampaign = save;

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

// ---------- 시간 ----------
MG.year = () => 1 + Math.floor(MG.S.month / 12);
MG.monthName = () => `${MG.year()}년차 ${MG.S.month % 12 + 1}월 (${MG.SEASON(MG.S.month)})`;

MG.hasRelic = id => (MG.S.relics || []).includes(id);
MG.apMax = () => MG.AP_PER_MONTH + (MG.hasRelic('boots') ? 1 : 0);
MG.hasOutpost = id => (MG.S.outposts || []).includes(id);

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

// 정찰병(명성 특성): 행동력 없이 골드만
const freeAct = (cost, fn) => { if (!MG.canPay(cost)) return '자원이 모자라요'; pay(cost); fn(); save(); return null; };

// ---------- 본국 ----------
MG.crown = () => MG.S.crown;
const addCrown = n => { if (n > 0 && MG.hasRelic('royalseal')) n *= 2; MG.S.crown = Math.max(0, Math.min(100, MG.S.crown + n)); };

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

MG.lib = { KEY, store, pick, randInt, shuffle, addRes, save, nextChronicleMonth, addEffect, pay, act, freeAct, addCrown };
})();
