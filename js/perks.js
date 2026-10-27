// 명성 특성 트리: 5갈래 × 4단. 한 번 사면 계속 갖고, 판마다 칸에 끼워 쓴다.
// 1단은 산 순간부터 항상 켜짐(칸 안 씀), 2·3단은 칸에 끼운 것만, 4단 '결단'은 결단 칸 하나에 하나만.
(() => {
MG.PERK_BRANCHES = {
  military: { name: '군사',     icon: 'shield' },
  economy:  { name: '내정',     icon: 'coins' },
  family:   { name: '가문',     icon: 'crown' },
  conquest: { name: '원정·정벌', icon: 'flag-3' },
  combat:   { name: '전투 기술', icon: 'swords' },
};
MG.PERK_COST = [0, 20, 40, 70, 120];  // 단별 명성
MG.PERK_SLOTS = { start: 4, max: 8, per: 250 };  // 모은 명성 250마다 칸 +1

// b: 갈래, t: 단 (4 = 결단). 결단은 cons(제약)를 따로 적는다.
MG.PERKS = {
  recruits:   { b: 'military', t: 1, name: '정예 신병',   desc: '시작 직할 궁수·보병 +6명씩' },
  drill:      { b: 'military', t: 1, name: '훈련 교범',   desc: '장수 경험치 +10%' },
  harsh:      { b: 'military', t: 2, name: '혹독한 훈련', desc: '장수 부대 체력 +10%' },
  wallwatch:  { b: 'military', t: 2, name: '성벽 망대',   desc: '직할 궁수 공격력 +15%' },
  veterans:   { b: 'military', t: 3, name: '노련한 장수들', desc: '시작 장수가 Lv.3' },
  depot:      { b: 'military', t: 3, name: '정비창',     desc: '전투가 끝나면 성벽·성문 피해의 30%를 바로 복구' },
  siegehold:  { b: 'military', t: 4, name: '철벽 농성',   desc: '성벽·성문 체력 +50%, 수리 목재 절반, 직할 궁수 공격력 +20%', cons: '정벌 행군 +1개월' },
  mobile:     { b: 'military', t: 4, name: '기동 방어',   desc: '직할 병력이 성벽 대신 기동 부대로 나오고, 전군 이동 +30%, 장수 부대 공격력 +10%', cons: '성벽 위 직할 수비 없음' },

  stockpile:  { b: 'economy', t: 1, name: '비축',       desc: '시작 자원 +25%' },
  thrift:     { b: 'economy', t: 1, name: '절약',       desc: '건설·강화·들판 비용 -10%' },
  taxreform:  { b: 'economy', t: 2, name: '세제 개혁',   desc: '세금 +10%' },
  rations:    { b: 'economy', t: 2, name: '군량 관리',   desc: '병사 식량 소비 -15%' },
  granary:    { b: 'economy', t: 3, name: '큰 창고',     desc: '보관 한도 +500' },
  cheapdraft: { b: 'economy', t: 3, name: '싼 모병',     desc: '신병 비용 -40%' },
  militia:    { b: 'economy', t: 4, name: '둔전병',     desc: '직할 10명당 매달 식량 +4, 병사 급여 절반', cons: '전군 공격력 -5%' },
  mercenary:  { b: 'economy', t: 4, name: '용병 변경백', desc: '모집에 주민이 필요 없어요 (용병을 고용)', cons: '신병 비용 3배, 병사 급여 1.5배' },

  fertile:    { b: 'family', t: 1, name: '다산',       desc: '성주 자녀 출생 확률 +10%p' },
  schooling:  { b: 'family', t: 1, name: '명문 교육',   desc: '성년이 된 자녀의 통솔 +1' },
  martial:    { b: 'family', t: 2, name: '무가의 피',   desc: '새 성주의 시작 능력치 +2점' },
  healthy:    { b: 'family', t: 2, name: '건강한 핏줄', desc: '성주·장수 노환 사망 확률 절반' },
  lineage:    { b: 'family', t: 3, name: '혈통 계승',   desc: '후계자가 선대 능력치의 1/3씩을 더 받아요' },
  academy:    { b: 'family', t: 3, name: '장수 학교',   desc: '성년이 된 자녀가 Lv.3 장수로 시작' },
  adoption:   { b: 'family', t: 4, name: '양자 계승',   desc: '혈족이 아닌 장수도 후계자가 될 수 있어 가문이 끊기지 않아요. 후계자 능력치 +2', cons: '계승할 때마다 본국 관계 -10' },
  regent:     { b: 'family', t: 4, name: '왕의 대리인', desc: '본국 지원 비용 절반, 해마다 본국 지원병 20명', cons: '해마다 가진 골드의 10%를 공물로' },

  scouts:     { b: 'conquest', t: 1, name: '정찰병',     desc: '습격·거점 정찰에 행동력이 들지 않아요' },
  expedition: { b: 'conquest', t: 1, name: '원정 경험',   desc: '원정 성공 확률 +10%p' },
  forcedmarch:{ b: 'conquest', t: 2, name: '빠른 행군',   desc: '정벌군 귀환 1개월 단축' },
  plunder:    { b: 'conquest', t: 2, name: '약탈',       desc: '정벌 전리품 골드 2배' },
  treasure:   { b: 'conquest', t: 3, name: '보물 사냥꾼', desc: '보상 카드에 유물이 낄 확률 2배' },
  siegemaster:{ b: 'conquest', t: 3, name: '공성 지휘관', desc: '진지 구조물에 주는 피해 +50%' },
  raider:     { b: 'conquest', t: 4, name: '약탈 군주',   desc: '정벌·원정 보상 3배, 습격 승리 전리품 골드 2배', cons: '보복 습격이 1.5배 더 커요' },
  conqueror:  { b: 'conquest', t: 4, name: '정복자',     desc: '보복 습격 증가 절반, 정벌 행군 1개월 단축, 거점 수비 -15%', cons: '습격 보상 카드 3장 → 2장' },

  tactics:    { b: 'combat', t: 1, name: '전술 교본',   desc: '모든 스킬 쿨 -10%' },
  supply:     { b: 'combat', t: 1, name: '보급 전문가', desc: '전투마다 소모품 4종까지 챙겨요' },
  archery:    { b: 'combat', t: 2, name: '궁술 훈련장', desc: '궁수 사거리 +10%' },
  cavtrad:    { b: 'combat', t: 2, name: '기병 전통',   desc: '기병 돌격 배율 +1' },
  siegeeng:   { b: 'combat', t: 3, name: '공성 기술자', desc: '공방 없이도 공병·포병을 보충해요' },
  medics:     { b: 'combat', t: 3, name: '전장 의무병', desc: '전투 후 사망 판정의 20%가 경상으로' },
  arcane:     { b: 'combat', t: 4, name: '마법 요새',   desc: '마법탑이 있으면 전투 중 6초마다 스스로 화염구, 마법사 공격력 2배', cons: '사제 회복량 -30%' },
  smith:      { b: 'combat', t: 4, name: '대장장이 영주', desc: '무기 제작에 행동력이 들지 않고 등급 +1, 철 생산 +30%', cons: '시장 거래 한도 절반' },
};

// ---------- 해금 (명성) ----------
const meta = () => MG.meta();
MG.perkOwned = id => meta().perks.includes(id);
MG.perkSlots = () => Math.min(MG.PERK_SLOTS.max, MG.PERK_SLOTS.start + Math.floor((meta().earned || 0) / MG.PERK_SLOTS.per));
// 그 단을 사려면 같은 갈래 아래 단 특성이 하나 이상 있어야 한다
MG.perkUnlockable = id => {
  const P = MG.PERKS[id];
  return P.t === 1 || Object.entries(MG.PERKS).some(([k, Q]) => Q.b === P.b && Q.t === P.t - 1 && MG.perkOwned(k));
};
MG.buyPerk = id => {
  const m = meta(), P = MG.PERKS[id], cost = MG.PERK_COST[P.t];
  if (MG.perkOwned(id)) return '이미 가졌어요';
  if (!MG.perkUnlockable(id)) return `${MG.PERK_BRANCHES[P.b].name} ${P.t - 1}단 특성을 먼저 사요`;
  if (m.renown < cost) return '명성이 모자라요';
  m.renown -= cost;
  m.perks.push(id);
  MG.saveMeta();
  return `${MG.josa(P.name, '을를')} 배웠어요.`;
};
// 초기화: 산 특성을 모두 내려놓고 명성을 돌려받는다 (무료)
MG.resetPerks = () => {
  const m = meta();
  m.renown += m.perks.reduce((a, id) => a + MG.PERK_COST[MG.PERKS[id].t], 0);
  m.perks = [];
  MG.saveMeta();
  return '특성을 모두 돌려받았어요.';
};
// 이번 판에 켤 특성: 1단 전부 + 칸에 끼운 2·3단 + 결단 하나
MG.activePerks = (slots, keystone) => {
  const owned = meta().perks;
  const base = owned.filter(id => MG.PERKS[id].t === 1);
  const picked = (slots || []).filter(id => owned.includes(id) && MG.PERKS[id].t >= 2 && MG.PERKS[id].t <= 3).slice(0, MG.perkSlots());
  const key = keystone && owned.includes(keystone) && MG.PERKS[keystone].t === 4 ? [keystone] : [];
  return [...base, ...picked, ...key];
};
// 전투마다 챙기는 소모품 종류 (보급 전문가 +1)
MG.itemCarry = () => MG.ITEM_CARRY + (MG.perk('supply') ? 1 : 0);
// 캠페인·전투에서 켜져 있는지
MG.perk = id => !!(MG.S && MG.S.perks && MG.S.perks.includes(id));
})();
