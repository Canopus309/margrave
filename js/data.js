// 게임 데이터: 병종, 적, 시작 병력, 웨이브 구성. 밸런스 조정은 여기서 한다.
window.MG = window.MG || {};

MG.WORLD = { w: 2000, h: 1400 };
// R: 성벽 바깥 반폭, T: 성벽 두께, gateHalf: 성문 반폭, keepR: 본성 반지름
MG.CASTLE = { x: 1000, y: 700, R: 320, T: 30, gateHalf: 30, keepR: 60 };
// 한 면 = 성벽 4조각 + 가운데 성문. 성문은 약한 요충지.
MG.WALL_SEG_HP = 1200;
MG.GATE_HP = 900;
MG.GATE_TARGET = { goblin: 0.2, wolf: 0.1, orc: 0.6 };  // 성문을 노리는 비율
MG.KEEP_HP = 3000;  // 성벽이 뚫린 뒤 병력을 돌릴 시간을 준다

MG.SIDES = ['N', 'E', 'S', 'W'];
MG.SIDE_NAME = { N: '북', E: '동', S: '남', W: '서' };
MG.NORMAL = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };

// kind: melee 근접, ranged 화살, magic 범위 마법, heal 회복
MG.UNIT_TYPES = {
  infantry: { name: '보병',       color: '#c9d1dc', hp: 60, atk: 8,  cd: 1.0, range: 14,  speed: 55, kind: 'melee' },
  archer:   { name: '궁수',       color: '#7fc4ff', hp: 35, atk: 7,  cd: 1.4, range: 170, speed: 55, kind: 'ranged' },
  mage:     { name: '견습 마법사', color: '#d79bff', hp: 30, atk: 10, cd: 2.2, range: 150, speed: 50, kind: 'magic', splash: 35 },
  priest:   { name: '수련 사제',   color: '#fff1a8', hp: 30, atk: 10, cd: 1.6, range: 120, speed: 50, kind: 'heal' },
  guard:    { name: '근위병',     color: '#e8c070', hp: 80, atk: 10, cd: 1.0, range: 14,  speed: 55, kind: 'melee' },
};

MG.ENEMY_TYPES = {
  goblin: { name: '고블린',    color: '#7bc043', hp: 36, atk: 5,  cd: 1.0, speed: 45, r: 5, wallDmg: 5,  aggro: 45 },
  wolf:   { name: '늑대 기수', color: '#b08257', hp: 45,  atk: 7,  cd: 0.9, speed: 95, r: 6, wallDmg: 6,  aggro: 0 },  // 병력을 무시하고 성벽으로
  orc:    { name: '오크 전사', color: '#3f7d3a', hp: 140, atk: 14, cd: 1.2, speed: 35, r: 8, wallDmg: 12, aggro: 50 },
};

MG.GENERAL_MULT = { hp: 4, atk: 2.5 };
MG.LEADER_DOWN_MULT = 0.8;   // 장수가 쓰러진 부대의 공격력
MG.LORD_DEAD_MULT = 0.85;    // 성주 전사 후 전군 공격력

// 장수와 통솔력 (통솔력 1당 병사 10명)
MG.START_ARMY = [
  // 시작 위치는 성 안 십자 큰길 위 (건물에 막히지 않게)
  { general: '브란',   type: 'infantry', lead: 3, at: { x: 0,    y: 140 } },
  { general: '에린',   type: 'archer',   lead: 2, at: { x: 0,    y: -140 } },
  { general: '셀레네', type: 'mage',     lead: 1, at: { x: -150, y: 0 } },
  { general: '토마스', type: 'priest',   lead: 1, at: { x: 150,  y: 0 } },
];
MG.LORD = { name: '변경백 알데른', hp: 150, atk: 10, guards: 10, aura: 130, auraBonus: 0.10, at: { x: 0, y: 215 } };
MG.GARRISON = { archer: 32, infantry: 32 };  // 성주 직할 병력 (성벽 위)

// ---------- 2단계: 병력 성장 ----------
MG.ENEMY_XP = { goblin: 2, wolf: 3, orc: 8 };
MG.MAX_LEVEL = 15;
MG.xpToNext = L => Math.round(60 * Math.pow(L, 1.4));
MG.SURVIVE_XP = 20;
MG.HEAL_XP = 0.08;  // 회복량 1당 경험치
// 장수 레벨 1당: 장수 본인 체력·공격, 부대 전체 보너스
MG.LEVEL_BONUS = { genHp: 0.08, genAtk: 0.06, squad: 0.02 };

// 부대 능력 보정. 곱하는 값(atk, dmgTaken, range, cd, splash, heal, hp)과 큰 값을 쓰는 값으로 나뉜다.
const MUL_KEYS = ['atk', 'dmgTaken', 'range', 'cd', 'splash', 'heal', 'hp'];
MG.combineMods = list => {
  const m = { atk: 1, dmgTaken: 1, range: 1, cd: 1, splash: 1, heal: 1, hp: 1, burn: 0, slow: 0, crit: 0, multishot: 1,
    freeze: 0, aura: 0, auraDef: 0, cleave: 0, healAoe: 0, tough: false, canAttack: false };
  for (const x of list) {
    if (!x) continue;
    for (const [k, v] of Object.entries(x)) {
      if (MUL_KEYS.includes(k)) m[k] *= v;
      else if (k === 'crit') m[k] += v;
      else if (typeof v === 'boolean') m[k] = m[k] || v;
      else m[k] = Math.max(m[k], v);
    }
  }
  return m;
};

// Lv.5에 A/B 중 하나, Lv.10에 그 갈래의 상위 직업으로
MG.CLASSES = {
  infantry: {
    A: { name: '중갑병', desc: '부대가 받는 피해 -25%', mods: { dmgTaken: 0.75 },
         lv10: { name: '수호기사', desc: '받는 피해 -35%, 주변 아군이 받는 피해 -15%', mods: { dmgTaken: 0.65, auraDef: 0.15 } } },
    B: { name: '검투사', desc: '부대 공격력 +25%', mods: { atk: 1.25 },
         lv10: { name: '검성', desc: '공격력 +40%, 주변 적에게 절반 피해', mods: { atk: 1.4, cleave: 0.5 } } },
  },
  archer: {
    A: { name: '저격수', desc: '사거리 +30%, 체력 높은 적부터 노림', mods: { range: 1.3, tough: true },
         lv10: { name: '명사수', desc: '사거리 +40%, 25% 확률로 2배 피해', mods: { range: 1.4, tough: true, crit: 0.25 } } },
    B: { name: '연사궁수', desc: '공격 속도 +40%', mods: { cd: 0.71 },
         lv10: { name: '폭풍궁수', desc: '공격 속도 +55%, 한 번에 화살 2발', mods: { cd: 0.65, multishot: 2 } } },
  },
  mage: {
    A: { name: '화염술사', desc: '폭발 범위 +40%, 맞은 적이 불탐', mods: { splash: 1.4, burn: 3 },
         lv10: { name: '불꽃 군주', desc: '폭발 범위 +70%, 강한 화상, 공격력 +20%', mods: { splash: 1.7, burn: 5, atk: 1.2 } } },
    B: { name: '냉기술사', desc: '맞은 적이 40% 느려짐', mods: { slow: 0.4 },
         lv10: { name: '서리 현자', desc: '60% 느려짐, 15% 확률로 1초 얼림', mods: { slow: 0.6, freeze: 0.15 } } },
  },
  priest: {
    A: { name: '치유사', desc: '회복량 +50%', mods: { heal: 1.5 },
         lv10: { name: '대주교', desc: '회복량 +80%, 주변 아군도 함께 회복', mods: { heal: 1.8, healAoe: 40 } } },
    B: { name: '전투사제', desc: '공격 가능, 주변 아군 공격력 +10%', mods: { canAttack: true, aura: 0.10 },
         lv10: { name: '성기사', desc: '주변 아군 공격력 +15%, 부대 체력 +50%', mods: { canAttack: true, aura: 0.15, hp: 1.5 } } },
  },
};

// 무기는 장수만 든다. 등급 배율은 장수 공격력, 옵션은 부대 전체에 적용.
MG.WEAPON_GRADES = {
  common:    { name: '일반', color: '#c9d1dc', atk: 1.10, opts: 0 },
  rare:      { name: '희귀', color: '#6aa8ff', atk: 1.25, opts: 1 },
  heroic:    { name: '영웅', color: '#c77dff', atk: 1.45, opts: 2 },
  legendary: { name: '전설', color: '#ffb347', atk: 1.70, opts: 3 },
};
MG.WEAPON_KINDS = { infantry: ['검', '도끼', '창'], archer: ['활', '석궁'], mage: ['지팡이', '마도서'], priest: ['홀장', '성물'] };
MG.WEAPON_OPTS = {
  fire:  { name: '화염',   desc: '맞은 적이 3초간 불탐',     mods: { burn: 3 } },
  frost: { name: '냉기',   desc: '맞은 적이 30% 느려짐',     mods: { slow: 0.3 } },
  sharp: { name: '예리함', desc: '부대 공격력 +15%',         mods: { atk: 1.15 } },
  crit:  { name: '치명',   desc: '15% 확률로 2배 피해',      mods: { crit: 0.15 } },
  swift: { name: '신속',   desc: '부대 공격 속도 +15%',      mods: { cd: 0.87 } },
  guard: { name: '수호',   desc: '부대가 받는 피해 -10%',    mods: { dmgTaken: 0.9 } },
};

// 부상: 일반 병사는 확률로 경상·중상·사망. 동원됐던 부상병이 또 쓰러지면 더 위험하다.
MG.WOUND_ROLL = {
  none:  { light: 0.5, heavy: 0.3, dead: 0.2 },
  light: { light: 0,   heavy: 0.5, dead: 0.5 },
  heavy: { light: 0,   heavy: 0.3, dead: 0.7 },
};
MG.WOUND_HP = { light: 0.7, heavy: 0.4 };  // 동원된 부상병의 시작 체력
MG.INJURED_GENERAL_HP = 0.5;               // 출전한 부상 장수의 시작 체력
MG.HOSPITAL_CAP = 20;
MG.RECRUITS_PER_MONTH = 15;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 습격 방향은 미리 정해 둔다 (정찰로 알 수 있게)
MG.rollDirs = level => shuffled(MG.SIDES).slice(0, level >= 3 ? 3 : 2);

// level이 오를수록 적이 많아지고 방향이 늘어난다
MG.buildWaves = function (level, dirs) {
  const [a, b] = dirs || MG.rollDirs(level);
  const c = (dirs && dirs[2]) || MG.SIDES.find(s => s !== a && s !== b);
  const L = level;
  const groups = [
    { wave: 1, t: 0,  dir: a, type: 'goblin', count: 36 + 8 * L },
    { wave: 1, t: 2,  dir: a, type: 'wolf',   count: 8 + 2 * L },
    { wave: 2, t: 40, dir: a, type: 'goblin', count: 30 + 6 * L },
    { wave: 2, t: 41, dir: b, type: 'goblin', count: 30 + 6 * L },
    { wave: 2, t: 44, dir: a, type: 'orc',    count: 5 + 2 * L },
    { wave: 2, t: 45, dir: b, type: 'wolf',   count: 6 + 2 * L },
    { wave: 3, t: 85, dir: b, type: 'orc',    count: 8 + 2 * L },
    { wave: 3, t: 85, dir: a, type: 'goblin', count: 40 + 8 * L },
    { wave: 3, t: 87, dir: b, type: 'goblin', count: 25 + 6 * L },
    { wave: 3, t: 88, dir: a, type: 'wolf',   count: 10 + 2 * L },
  ];
  if (L >= 3) {
    groups.push({ wave: 3, t: 90, dir: c, type: 'goblin', count: 20 + 6 * L },
                { wave: 3, t: 92, dir: c, type: 'orc',    count: 2 * L });
  }
  // 5번째 전투마다 대습격
  if (L % 5 === 0) {
    for (const g of groups) g.count = Math.round(g.count * 1.2);
    groups.push({ wave: 3, t: 95, dir: a, type: 'orc', count: 3 + Math.round(L / 2) });
  }
  return { groups, dirs: L >= 3 ? [a, b, c] : [a, b] };
};

// ---------- 3a: 성 안 건물, 민가, 자원, 달 턴 ----------
// 성 안은 40×40 칸 14×14. 가장자리 한 줄(성벽 안길), 십자 큰길(6·7번 줄), 본성(5~8)은 비워 둔다.
MG.GRID = { cell: 40, n: 14, half: 280 };
MG.cellRect = (i, j) => {
  const c = MG.GRID.cell, x0 = MG.CASTLE.x - MG.GRID.half + i * c, y0 = MG.CASTLE.y - MG.GRID.half + j * c;
  return { x0, y0, x1: x0 + c, y1: y0 + c };
};
MG.reservedCell = (i, j) => {
  const n = MG.GRID.n;
  if (i <= 0 || j <= 0 || i >= n - 1 || j >= n - 1) return true;
  if (i === 6 || i === 7 || j === 6 || j === 7) return true;
  return i >= 5 && i <= 8 && j >= 5 && j <= 8;
};

// cost는 1단계 기준, 다음 단계는 ×(단계+1). w·h는 칸 수.
MG.BUILDINGS = {
  house:    { name: '민가',   w: 1, h: 1, hp: 300, color: '#b98a5a', cost: { gold: 30, wood: 40 },           max: 3, desc: l => `주민 ${MG.HOUSE_POP * l}명이 살아요` },
  barracks: { name: '병영',   w: 2, h: 2, hp: 700, color: '#8a5a4a', cost: { gold: 80, wood: 100 },          max: 3, desc: l => `한 번에 ${10 * l}명 모집` },
  training: { name: '훈련장', w: 2, h: 2, hp: 600, color: '#7a7a4a', cost: { gold: 80, wood: 80 },           max: 3, desc: l => `훈련 경험치 ${30 * l}, 부대 능력 +${3 * l}%` },
  smithy:   { name: '대장간', w: 2, h: 2, hp: 700, color: '#5a5a6a', cost: { gold: 100, wood: 60, iron: 40 }, max: 3, desc: l => `무기 제작 (${['', '일반~희귀', '희귀~영웅', '영웅~전설'][l]})` },
  tower:    { name: '마법탑', w: 1, h: 1, hp: 500, color: '#7a5aa0', cost: { gold: 120, wood: 40, iron: 30 }, max: 3, desc: l => `마법사 보충 가능, 마법 피해 +${10 * l}%` },
  temple:   { name: '사원',   w: 2, h: 2, hp: 600, color: '#c8b46a', cost: { gold: 100, wood: 80 },          max: 3, desc: l => `사제 보충 가능, 회복량 +${10 * l}%, 매달 본성 +${150 * l}` },
  hospital: { name: '병원',   w: 2, h: 2, hp: 600, color: '#d0d0d0', cost: { gold: 60, wood: 80 },           max: 3, desc: l => `부상자 ${MG.HOSPITAL_PER_LEVEL * l}명 수용` },
  storage:  { name: '창고',   w: 2, h: 2, hp: 600, color: '#8a7050', cost: { gold: 40, wood: 100 },          max: 3, desc: l => `자원 보관 한도 +${1000 * l}` },
  market:   { name: '시장',   w: 2, h: 2, hp: 500, color: '#c07040', cost: { gold: 60, wood: 80 },           max: 3, desc: l => `매달 골드 +${40 * l}, 자원 거래 (한 달 ${150 * l}개, 파는 값 ${65 + 5 * l}%)` },
  tavern:   { name: '주점',   w: 1, h: 1, hp: 400, color: '#a0603a', cost: { gold: 80, wood: 60 },           max: 3, desc: l => `떠돌이 장수가 찾아와요 (최대 ${l + 1}명, 레벨 최대 ${l * 2 + 1})` },
  watch:    { name: '감시탑', w: 1, h: 1, hp: 400, color: '#6a8aa0', cost: { gold: 50, wood: 60 },           max: 3, desc: l => l >= 2 ? '매달 습격 날짜·방향·구성을 알아냄' : '매달 습격 날짜·방향을 알아냄' },
};
MG.HOUSE_POP = 20;
MG.RAIDER_SHARE = 0.35;  // 성 안에 들어오면 본성보다 가까운 건물부터 부수는 적의 비율
MG.HOSPITAL_PER_LEVEL = 20;

// 성 밖 들판의 생산 시설. 적은 부수지 않는다.
MG.FIELDS = {
  farm:   { name: '농장',   color: '#b8b04a', cost: { gold: 40, wood: 30 },  max: 3, prod: { food: 25 } },
  lumber: { name: '벌목장', color: '#6a8a4a', cost: { gold: 40 },            max: 3, prod: { wood: 25 } },
  mine:   { name: '광산',   color: '#7a7a7a', cost: { gold: 60, wood: 40 },  max: 3, prod: { iron: 15 } },
};
MG.FIELD_SLOTS = 8;

MG.RES = { gold: '골드', food: '식량', wood: '목재', iron: '철' };
MG.START_RES = { gold: 300, food: 400, wood: 200, iron: 100 };
MG.STORAGE_BASE = 1000;
MG.AP_PER_MONTH = 3;
MG.TAX_PER_POP = 1;
MG.FOOD_PER_PERSON = 0.25;  // 병사든 주민이든 똑같이 먹는다
MG.WAGE_SOLDIER = 0.5;      // 병사 급여 (매달 골드)
MG.WAGE_GENERAL = 3;
MG.UNPAID_MULT = 0.85;      // 급여가 밀리면 전군 공격력
MG.battleGold = level => 50 + level * 10;  // 승리 전리품

// ---------- 3b-1: 장수 영입, 특성, 나이, 가문 ----------
// 특성: 장수마다 1~2개. mods는 부대 전체, lead는 통솔, xp는 경험치 배율, bad는 단점
MG.TRAITS = {
  brave:   { name: '용맹',   desc: '부대 공격력 +10%',     mods: { atk: 1.1 } },
  iron:    { name: '철벽',   desc: '부대가 받는 피해 -10%', mods: { dmgTaken: 0.9 } },
  eagle:   { name: '매의 눈', desc: '사거리 +10%',          mods: { range: 1.1 } },
  leader:  { name: '인솔',   desc: '통솔 +1',              lead: 1 },
  gifted:  { name: '영재',   desc: '경험치 +25%',          xp: 1.25 },
  swift:   { name: '날쌘',   desc: '공격 속도 +10%',       mods: { cd: 0.9 } },
  tough:   { name: '강골',   desc: '부대 체력 +10%',       mods: { hp: 1.1 } },
  coward:  { name: '겁쟁이', desc: '부대 공격력 -10%',     mods: { atk: 0.9 }, bad: true },
  sickly:  { name: '병약',   desc: '부대 체력 -15%',       mods: { hp: 0.85 }, bad: true },
  slow:    { name: '둔재',   desc: '경험치 -25%',          xp: 0.75, bad: true },
};
MG.GIVEN_NAMES = ['가렌', '리아나', '오도', '세린', '바르크', '유리엘', '토린', '하나', '케일', '미렐', '도란', '아델', '로완', '실바',
  '이반', '노엘', '라스', '엘다', '마커스', '루시엔', '고드릭', '피오나', '헨릭', '소냐', '브람', '테사', '울릭', '카야'];
MG.FAMILY_NAME = '알데른';  // 변경백 가문의 이름 (성주 이름 앞에 '변경백'이 붙는다)

MG.LORD_START_AGE = 30;
MG.BIRTH_CHANCE = 0.25;      // 성주가 20~45세일 때 해마다
MG.ADULT_AGE = 16;
MG.AGE_DECLINE = 50;         // 이 나이부터 해마다 능력 -3%
MG.AGE_DEATH = 60;           // 이 나이부터 해마다 10% + 5%×(나이-60) 확률로 세상을 떠남
MG.ageMul = age => (age > MG.AGE_DECLINE ? Math.max(0.6, 1 - 0.03 * (age - MG.AGE_DECLINE)) : 1);
MG.deathChance = age => (age >= MG.AGE_DEATH ? 0.1 + 0.05 * (age - MG.AGE_DEATH) : 0);

MG.hireCost = level => 150 + 50 * level;
MG.PROMOTE_COST = { gold: 100 };
MG.RETIRED_TRAIN_XP = 10;    // 은퇴한 교관 1명당 훈련 경험치 +

// 장수 부대의 시작 자리: 십자 큰길 → 성벽 안길 순서
MG.SQUAD_SLOTS = [
  { x: 0, y: 140 }, { x: 0, y: -140 }, { x: -150, y: 0 }, { x: 150, y: 0 },
  { x: -215, y: 0 }, { x: 215, y: 0 }, { x: 0, y: -215 },
  { x: -170, y: -260 }, { x: 170, y: -260 }, { x: -170, y: 260 }, { x: 170, y: 260 },
  { x: -260, y: -170 }, { x: 260, y: -170 }, { x: -260, y: 170 }, { x: 260, y: 170 },
];

// ---------- 3b-2: 원정, 이벤트, 본국 ----------
// 원정지는 계절마다 3곳. 난이도는 전투 레벨에 따라 오른다. 전력 = 병사 수 + 장수 레벨×8 (부대 공격·체력 보정 반영)
MG.SITES = {
  nest:   { name: '고블린 둥지',  desc: '소탕하면 다음 습격 규모 -25%', diff: 1.2 },
  mine:   { name: '버려진 광산',  desc: '철을 얻어요',                  diff: 0.9 },
  escort: { name: '상인 호위',    desc: '골드를 얻어요',                diff: 0.8 },
  ruins:  { name: '고대 유적',    desc: '좋은 무기를 얻을 수 있어요',    diff: 1.4 },
};
MG.EXPEDITION_AP = 2;
MG.siteDifficulty = (level, mul) => Math.round((25 + 12 * level) * mul);
MG.EXPEDITION_XP = 40;

// 본국 관계 0~100 (해임은 없다)
MG.CROWN_START = 50;
MG.CROWN_WIN = 3;               // 습격을 막을 때마다
MG.SUPPORT_COST = 15;           // 지원 요청 한 번에 관계 -
MG.SUPPORT_MIN = 20;            // 이보다 낮으면 본국이 응하지 않는다
MG.EVENT_CHANCE = 0.2;

// 시장 거래: 골드로 사고판다. 시세는 매달 랜덤하게 움직이고 기준값으로 천천히 돌아온다.
MG.MARKET = {
  base: { food: 1.0, wood: 1.5, iron: 3.0 },       // 사는 값 기준 (1개당 골드)
  drift: 0.12, pull: 0.3, min: 0.4, max: 2.5,       // 매달 ±12%, 기준값으로 30% 복귀, 기준의 0.4~2.5배
  season: { food: { 봄: 1.2, 여름: 1.0, 가을: 0.7, 겨울: 1.4 } },
  sellRate: l => 0.65 + 0.05 * l,                   // 파는 값 = 사는 값 × (70% / 75% / 80%)
  volume: l => 150 * l,                             // 한 달 거래 한도 (개수)
};
MG.POP_GROWTH = 0.05;      // 매달 빈자리 쪽으로 늘어나는 비율
MG.RECRUIT_GOLD = 5;       // 신병 1명 비용
MG.REPAIR_WOOD_PER_HP = 0.1;
MG.REPAIR_PER_ACTION = 2000;  // 한 번 수리할 때 고치는 체력 총량
MG.CRAFT_COST = { gold: 80, iron: 60 };
MG.TEMPLE_KEEP_HEAL = 150;  // 사원 단계당 매달 본성 회복량
MG.STARVE_MULT = 0.85;     // 식량이 바닥나면 전군 공격력
MG.SEASON = m => ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'][m % 12];
MG.SEASON_PROD = { 봄: { food: 1, wood: 1 }, 여름: { food: 1, wood: 1.2 }, 가을: { food: 2, wood: 1 }, 겨울: { food: 0, wood: 0.5 } };

// 습격 간격(달): 해가 갈수록 잦아진다
MG.attackGap = year => (year <= 5 ? [5, 8] : year <= 15 ? [3, 5] : [2, 4]);

// 시작 배치
MG.START_BUILDINGS = [
  { type: 'barracks', i: 1, j: 1 }, { type: 'hospital', i: 11, j: 1 },
  { type: 'house', i: 1, j: 10 }, { type: 'house', i: 2, j: 10 }, { type: 'house', i: 1, j: 11 },
  { type: 'house', i: 2, j: 11 }, { type: 'house', i: 11, j: 11 },
];
MG.START_FIELDS = ['farm', 'farm', 'farm', 'lumber', 'mine'];
MG.START_POP = 90;
