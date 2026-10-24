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
  { general: '브란',   type: 'infantry', lead: 3, at: { x: -140, y: 140 } },
  { general: '에린',   type: 'archer',   lead: 2, at: { x: 140,  y: -140 } },
  { general: '셀레네', type: 'mage',     lead: 1, at: { x: -140, y: -140 } },
  { general: '토마스', type: 'priest',   lead: 1, at: { x: 140,  y: 140 } },
];
MG.LORD = { name: '변경백 알데른', hp: 150, atk: 10, guards: 10, aura: 130, auraBonus: 0.10, at: { x: 0, y: 130 } };
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
MG.HEIR_NAMES = ['레오릭', '아이린', '카스텔', '미라벨', '오스윈', '세라핀', '테오도르', '엘리스'];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// level이 오를수록 적이 많아지고 방향이 늘어난다
MG.buildWaves = function (level) {
  const [a, b, c] = shuffled(MG.SIDES);
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
