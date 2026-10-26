// 게임 데이터: 병종, 적, 시작 병력, 웨이브 구성. 밸런스 조정은 여기서 한다.
window.MG = window.MG || {};

MG.WORLD = { w: 2000, h: 1400 };
// R: 성벽 바깥 반폭, T: 성벽 두께, gateHalf: 성문 반폭, keepR: 본성 반지름
MG.CASTLE = { x: 1000, y: 700, R: 320, T: 30, gateHalf: 30, keepR: 60 };
// 한 면 = 성벽 4조각 + 가운데 성문. 성문은 약한 요충지.
MG.WALL_SEG_HP = 1200;
MG.GATE_HP = 900;
MG.GATE_TARGET = { goblin: 0.2, wolf: 0.1, orc: 0.6, goblinArcher: 0, orcThrower: 0.3,
  skeleton: 0.2, ghoul: 0.1, necro: 0, harpy: 0, wyvern: 0, goblinChief: 0.3, orcChampion: 1, lich: 0, wyvernQueen: 0 };  // 성문을 노리는 비율
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
  // repair: 1초에 고치는 체력(1명당), perLead: 통솔 1당 병사 수
  engineer: { name: '공병',       color: '#c8a060', hp: 45, atk: 5,  cd: 1.2, range: 14,  speed: 50, kind: 'melee', repair: 6, perLead: 5 },
  // minRange: 너무 가까운 적은 못 쏜다
  artillery:{ name: '포병',       color: '#9aa0b0', hp: 40, atk: 25, cd: 6.0, range: 330, speed: 30, kind: 'siege', splash: 35, minRange: 90, perLead: 3 },
  // charge: 움직인 뒤 첫 타격 배율, noWall: 성벽 위에 못 올라감
  cavalry:  { name: '기병',       color: '#d88a5a', hp: 110, atk: 12, cd: 1.0, range: 14, speed: 110, kind: 'melee', charge: 3, noWall: true },
};

MG.ENEMY_TYPES = {
  goblin: { name: '고블린',    color: '#7bc043', hp: 36, atk: 5,  cd: 1.0, speed: 45, r: 5, wallDmg: 5,  aggro: 45 },
  wolf:   { name: '늑대 기수', color: '#b08257', hp: 45,  atk: 7,  cd: 0.9, speed: 95, r: 6, wallDmg: 6,  aggro: 0 },  // 병력을 무시하고 성벽으로
  orc:    { name: '오크 전사', color: '#3f7d3a', hp: 140, atk: 14, cd: 1.2, speed: 35, r: 8, wallDmg: 12, aggro: 50 },
  // ranged: 사거리. 성벽 밖에서 멈춰 쏜다. siege: 성벽을 겨냥해 돌을 던진다
  goblinArcher: { name: '고블린 궁수',  color: '#b4d050', hp: 28, atk: 6,  cd: 1.6, speed: 42, r: 5, wallDmg: 2,  aggro: 0, ranged: 170 },
  orcThrower:   { name: '오크 투석병',  color: '#6a8a40', hp: 90, atk: 10, cd: 3.5, speed: 30, r: 7, wallDmg: 40, aggro: 0, ranged: 220, siege: true },
  // 정벌 전투에만 나온다. regen: 1초에 최대 체력의 비율만큼 회복
  troll:        { name: '늪 트롤',      color: '#5f8a7a', hp: 260, atk: 18, cd: 1.6, speed: 32, r: 9, wallDmg: 20, aggro: 60, regen: 0.01 },
  goblinKing:   { name: '고블린 왕',     color: '#d8c040', hp: 2700, atk: 22, cd: 1.0, speed: 50, r: 12, wallDmg: 0, aggro: 220, boss: true },
  orcWarlord:   { name: '오크 대족장',   color: '#2f6a2a', hp: 4800, atk: 35, cd: 1.3, speed: 40, r: 14, wallDmg: 0, aggro: 220, boss: true },
  trollChief:   { name: '거인 트롤 족장', color: '#4a7a6a', hp: 7500, atk: 50, cd: 1.8, speed: 34, r: 16, wallDmg: 0, aggro: 220, boss: true, regen: 0.008 },
  // fly: 벽·지형을 무시하고 날아다닌다
  ancientDragon: { name: '고대 드래곤',  color: '#8a2020', hp: 16000, atk: 60, cd: 1.5, speed: 62, r: 20, wallDmg: 0, aggro: 280, boss: true, fly: true },
  // B2: 망자의 군단 (undead: 마법·신성 공격에 약함, revive: 쓰러지면 한 번 다시 일어남, raise: 해골을 일으킴)
  skeleton: { name: '해골 병사',    color: '#d8d4c0', hp: 40, atk: 7,  cd: 1.1, speed: 42, r: 5, wallDmg: 6, aggro: 45, undead: true, revive: true },
  ghoul:    { name: '구울',        color: '#7a8a6a', hp: 60, atk: 9,  cd: 0.8, speed: 80, r: 6, wallDmg: 6, aggro: 60, undead: true },
  necro:    { name: '망령 주술사',   color: '#6a4a8a', hp: 60, atk: 6,  cd: 2.0, speed: 35, r: 6, wallDmg: 2, aggro: 0, undead: true, ranged: 160, raise: true },
  // 하늘 마물 (fly: 성벽을 넘어 날아온다. 근접 공격은 절반만 먹힌다)
  harpy:    { name: '하피',        color: '#c08aa0', hp: 32, atk: 6,  cd: 1.0, speed: 85, r: 5, wallDmg: 6, aggro: 120, fly: true },
  wyvern:   { name: '와이번',      color: '#7a4040', hp: 240, atk: 18, cd: 1.4, speed: 60, r: 10, wallDmg: 20, aggro: 120, fly: true },
  // 습격 보스: 대습격마다 그 시대 세력의 보스가 온다
  goblinChief: { name: '고블린 대족장', color: '#c8b040', hp: 2400, atk: 25, cd: 1.0, speed: 48, r: 12, wallDmg: 20, aggro: 90, boss: true },
  orcChampion: { name: '오크 투사',    color: '#3a7a3a', hp: 3600, atk: 40, cd: 1.3, speed: 40, r: 13, wallDmg: 45, aggro: 60, boss: true },
  lich:        { name: '리치',        color: '#8a6ac8', hp: 2800, atk: 22, cd: 1.6, speed: 34, r: 12, wallDmg: 10, aggro: 0, boss: true, undead: true, ranged: 220 },
  wyvernQueen: { name: '와이번 여왕',  color: '#9a3030', hp: 3200, atk: 30, cd: 1.3, speed: 58, r: 15, wallDmg: 40, aggro: 100, boss: true, fly: true, raider: true },
};
MG.UPHILL_HIT = 0.5;      // 아래에서 성벽 위를 쏘면 명중률
MG.RETREAT_AFTER = 60;    // 모든 적이 나온 뒤 이만큼(초) 적이 하나도 안 죽으면 남은 적은 물러난다
MG.GARRISON_HP = 35;      // 직할 병사 한 명이 쓰러지는 데 드는 피해

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
MG.GARRISON = { archer: 24, infantry: 24 };  // 성주 직할 병력 (성벽 위)

// ---------- 2단계: 병력 성장 ----------
MG.ENEMY_XP = { goblin: 2, wolf: 3, orc: 8, goblinArcher: 3, orcThrower: 7, troll: 12, goblinKing: 120, orcWarlord: 160, trollChief: 200, ancientDragon: 400, tower: 6, hq: 40,
  skeleton: 2, ghoul: 3, necro: 6, harpy: 3, wyvern: 12, goblinChief: 100, orcChampion: 120, lich: 120, wyvernQueen: 120 };
MG.MAX_LEVEL = 15;
MG.xpToNext = L => Math.round(60 * Math.pow(L, 1.4));
MG.SURVIVE_XP = 20;
MG.HEAL_XP = 0.08;  // 회복량 1당 경험치
// 장수 레벨 1당: 장수 본인 체력·공격, 부대 전체 보너스
MG.LEVEL_BONUS = { genHp: 0.08, genAtk: 0.06, squad: 0.02 };

// 부대 능력 보정. 곱하는 값(atk, dmgTaken, range, cd, splash, heal, hp)과 큰 값을 쓰는 값으로 나뉜다.
const MUL_KEYS = ['atk', 'dmgTaken', 'range', 'cd', 'splash', 'heal', 'hp', 'repair', 'speed'];
MG.combineMods = list => {
  const m = { atk: 1, dmgTaken: 1, range: 1, cd: 1, splash: 1, heal: 1, hp: 1, repair: 1, speed: 1, charge: 0, burn: 0, slow: 0, crit: 0, multishot: 1,
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
  engineer: {
    A: { name: '축성기사', desc: '수리 속도 +50%', mods: { repair: 1.5 },
         lv10: { name: '요새장인', desc: '수리 속도 +100%, 주변 아군이 받는 피해 -10%', mods: { repair: 2, auraDef: 0.1 } } },
    B: { name: '전투공병', desc: '공격력 +40%, 체력 +20%', mods: { atk: 1.4, hp: 1.2 },
         lv10: { name: '파쇄공병', desc: '공격력 +70%, 주변 적에게 절반 피해', mods: { atk: 1.7, hp: 1.2, cleave: 0.5 } } },
  },
  artillery: {
    A: { name: '중포병', desc: '폭발 범위 +40%', mods: { splash: 1.4 },
         lv10: { name: '공성포대', desc: '폭발 범위 +70%, 공격력 +30%', mods: { splash: 1.7, atk: 1.3 } } },
    B: { name: '속사포병', desc: '공격 속도 +35%', mods: { cd: 0.74 },
         lv10: { name: '화염포병', desc: '공격 속도 +45%, 맞은 적이 크게 불탐', mods: { cd: 0.69, burn: 6 } } },
  },
  cavalry: {
    A: { name: '중기병', desc: '받는 피해 -25%, 돌격 4배', mods: { dmgTaken: 0.75, charge: 4 },
         lv10: { name: '성전기사', desc: '받는 피해 -35%, 돌격 5배', mods: { dmgTaken: 0.65, charge: 5 } } },
    B: { name: '경기병', desc: '이동 속도 +25%, 공격 속도 +20%', mods: { speed: 1.25, cd: 0.83 },
         lv10: { name: '질풍기병', desc: '이동 속도 +40%, 주변 적에게 절반 피해', mods: { speed: 1.4, cd: 0.8, cleave: 0.5 } } },
  },
};

// 무기는 장수만 든다. 등급 배율은 장수 공격력, 옵션은 부대 전체에 적용.
MG.WEAPON_GRADES = {
  common:    { name: '일반', color: '#c9d1dc', atk: 1.10, opts: 0 },
  rare:      { name: '희귀', color: '#6aa8ff', atk: 1.25, opts: 1 },
  heroic:    { name: '영웅', color: '#c77dff', atk: 1.45, opts: 2 },
  legendary: { name: '전설', color: '#ffb347', atk: 1.70, opts: 3 },
};
MG.WEAPON_KINDS = { infantry: ['검', '도끼', '창'], archer: ['활', '석궁'], mage: ['지팡이', '마도서'], priest: ['홀장', '성물'],
  engineer: ['망치', '곡괭이'], artillery: ['투석기', '노포'], cavalry: ['기창', '장검'] };
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
// ---------- B2: 적 세력 ----------
// 기본 습격 구성(고블린·늑대·오크·궁수·투석병)의 역할을 세력마다 다른 적으로 바꾼다. [적, 수 배율]
MG.FACTIONS = {
  goblin: { name: '고블린 부족',   desc: '수가 많고 약해요. 늑대 기수가 빨라요', boss: 'goblinChief',
    units: { goblin: ['goblin', 1], wolf: ['wolf', 1], orc: ['orc', 1], goblinArcher: ['goblinArcher', 1], orcThrower: ['orcThrower', 1] } },
  orc:    { name: '오크 전쟁무리', desc: '수는 적지만 튼튼하고, 투석병이 성벽을 노려요', boss: 'orcChampion',
    units: { goblin: ['goblin', 0.6], wolf: ['wolf', 0.7], orc: ['orc', 1.7], goblinArcher: ['goblinArcher', 0.8], orcThrower: ['orcThrower', 1.6] } },
  undead: { name: '망자의 군단',   desc: '해골은 한 번 다시 일어나고, 주술사가 해골을 일으켜요. 마법사·사제에 약해요', boss: 'lich',
    units: { goblin: ['skeleton', 0.75], wolf: ['ghoul', 1], orc: ['ghoul', 2], goblinArcher: ['necro', 0.4], orcThrower: ['necro', 0.8] } },
  sky:    { name: '하늘 마물',     desc: '하피와 와이번이 성벽을 날아 넘어와요. 궁수·마법사가 중요해요', boss: 'wyvernQueen',
    units: { goblin: ['goblin', 0.8], wolf: ['harpy', 1], orc: ['wyvern', 0.5], goblinArcher: ['goblinArcher', 1], orcThrower: ['orcThrower', 1] } },
};
MG.ERA_YEARS = [4, 6];     // 시대(주도 세력)가 바뀌는 간격(년)
MG.ERA_MIX = 0.35;         // 새 시대에 두 세력이 섞여 올 확률

// faction: 주도 세력, mix: 섞여 오는 세력(습격 무리 중 절반이 이쪽)
MG.buildWaves = function (level, dirs, faction, mix) {
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
  // 원거리 적: 3번째 전투부터 고블린 궁수, 5번째부터 오크 투석병
  if (L >= 3) groups.push({ wave: 2, t: 46, dir: a, type: 'goblinArcher', count: 4 + 2 * L },
                         { wave: 3, t: 89, dir: b, type: 'goblinArcher', count: 3 + 2 * L });
  if (L >= 5) groups.push({ wave: 3, t: 92, dir: a, type: 'orcThrower', count: 1 + Math.floor(L / 2) });
  // 5번째 전투마다 대습격
  if (L % 5 === 0) {
    for (const g of groups) g.count = Math.round(g.count * 1.2);
    groups.push({ wave: 3, t: 95, dir: a, type: 'orc', count: 3 + Math.round(L / 2) });
  }
  // 초반(전투 1~3)은 적을 더 보내고(+30% → +15%), 파 사이 쉬는 시간을 줄인다
  const early = L <= 3 ? 1.3 - 0.075 * (L - 1) : 1;
  for (const g of groups) { g.count = Math.round(g.count * early); if (g.wave === 2) g.t -= 10; if (g.wave === 3) g.t -= 20; }
  // 세력에 맞게 적을 바꾼다. 섞인 시대에는 무리를 번갈아 두 세력으로.
  groups.forEach((g, i) => {
    const F = MG.FACTIONS[(mix && i % 2) ? mix : (faction || 'goblin')], u = F.units[g.type];
    if (u) { g.type = u[0]; g.count = Math.max(1, Math.round(g.count * u[1])); }
  });
  // 대습격에는 그 시대 세력의 보스가 온다
  if (L % 5 === 0) groups.push({ wave: 3, t: 96, dir: a, type: MG.FACTIONS[faction || 'goblin'].boss, count: 1 });
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
  workshop: { name: '공방',   w: 2, h: 2, hp: 600, color: '#8a6a3a', cost: { gold: 100, wood: 120, iron: 40 }, max: 3, desc: l => `공병·포병 보충 가능, 포병 공격력 +${10 * l}%` },
  stable:   { name: '마구간', w: 2, h: 2, hp: 500, color: '#9a7a50', cost: { gold: 120, wood: 100 },          max: 3, desc: l => `기병 보충 가능, 기병 체력 +${10 * l}%` },
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
  // 연대기 사건(황금 광맥)으로만 생긴다. 들판에 새로 지을 수는 없다
  goldmine: { name: '금광', color: '#d8b040', cost: { gold: 60, wood: 40 }, max: 3, prod: { gold: 40 }, hidden: true },
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

// ---------- C1: 명성과 해금, 연대기 ----------
// 명성으로 해금하는 것: 한 번 해금하면 다음 캠페인부터 계속 고를 수 있다
MG.DOMAINS = {
  none:     { name: '평범한 변경', desc: '특별한 점이 없어요', cost: 0 },
  mine:     { name: '광산 지대',   desc: '철 생산 +50%',        cost: 40 },
  fertile:  { name: '비옥한 들판', desc: '식량 생산 +30%',      cost: 40 },
  fortress: { name: '국경 요새',   desc: '성벽·성문 체력 +30%', cost: 50 },
  trade:    { name: '상업 도시',   desc: '시장 골드 +50%',      cost: 40 },
};
MG.BONUSES = {
  res:      { name: '넉넉한 창고', desc: '시작 자원 +50%',                 cost: 30 },
  general:  { name: '객장',       desc: '시작 장수 +1 (병종 랜덤, 부대 가득)', cost: 50 },
  workshop: { name: '공방',       desc: '공방을 짓고 시작',               cost: 30 },
  stable:   { name: '마구간',     desc: '마구간을 짓고 시작',             cost: 30 },
};
// 포위 단계: 높을수록 적이 많고 튼튼하지만 명성을 더 받는다. 순서대로 해금
MG.SIEGE_MAX = 5;
MG.siegeCost = l => 40 * l;
MG.siegeEnemyMul = l => 1 + 0.15 * l;
MG.siegeRenownMul = l => 1 + 0.25 * l;
MG.WALL_DOMAIN_MUL = 1.3;
// 명성: 버틴 햇수×2 + 승리×3 + 함락한 거점×50 + 이어진 대×10 + 엔딩 100, 포위 단계 배율
MG.renownOf = S => {
  const years = Math.floor((S.month - 2) / 12), outposts = (S.outposts || []).length;
  const parts = { years: years * 2, wins: S.stats.wins * 3, outposts: outposts * 50, gens: S.lord.gen * 10, ending: S.ended ? MG.ENDING_RENOWN : 0 };
  const base = parts.years + parts.wins + parts.outposts + parts.gens + parts.ending;
  // 몰락 귀족 +20%, 변경백의 관 +25%
  const extra = (S.origin === 'fallen' ? 1.2 : 1) * ((S.relics || []).includes('circlet') ? 1.25 : 1) * MG.DIFFICULTY[S.difficulty || 'normal'].renown;
  return { parts, base, extra, total: Math.round(base * MG.siegeRenownMul(S.siege || 0) * extra) };
};
MG.CHRONICLE_GAP = [24, 36];  // 연대기 사건 간격(달), 봄에 온다

// ---------- C2: 거점 정벌 ----------
// 정벌 전투: 넓은 들판에서 적 진지(목책·망루·본진)를 친다. 본진을 부수면 이긴다.
// garrison: 진지 수비대 [적 종류, 수], reinf: 보스가 살아 있는 동안 본진에서 나오는 증원, power: 적 체력 배율
MG.OUTPOSTS = {
  goblin: { name: '고블린 소굴', boss: 'goblinKing', biome: 'forest', stars: 1, months: 2,
    garrison: [['goblin', 140], ['goblinArcher', 40], ['wolf', 30]], towers: 2, hq: 5000, reinf: 'goblin', power: 1.3,
    bossDesc: '졸개를 불러내고, 체력이 낮아지면 진지 안쪽으로 달아나요', reward: '앞으로의 습격 규모 -15%' },
  orc: { name: '오크 전쟁 야영지', boss: 'orcWarlord', biome: 'plain', stars: 2, months: 2,
    garrison: [['orc', 90], ['goblin', 120], ['orcThrower', 15]], towers: 3, hq: 8000, reinf: 'orc', power: 1.7,
    bossDesc: '함성으로 주변 적을 강하게 하고, 돌진해서 병사들을 밀쳐내요', reward: '매달 철 +20, 습격에서 오크 -30%' },
  troll: { name: '트롤 늪 요새', boss: 'trollChief', biome: 'swamp', stars: 3, months: 3,
    garrison: [['troll', 60], ['orc', 90], ['goblinArcher', 80]], towers: 4, hq: 12000, reinf: 'troll', power: 2.2,
    bossDesc: '체력이 계속 차오르고, 강타로 넓은 범위를 때려요', reward: '매달 목재 +30, 식량 +20' },
  // 마지막 목표: 거점 3곳을 모두 정벌해야 열린다. 목책 대신 돌벽.
  citadel: { name: '검은 성채', boss: 'ancientDragon', biome: 'stone', stars: 4, months: 3, final: true, wall: 'stonewall',
    garrison: [['orc', 110], ['troll', 50], ['goblinArcher', 90], ['orcThrower', 20]], towers: 4, hq: 18000, reinf: 'orc', power: 2.6,
    bossDesc: '날아다녀서 벽과 지형을 무시하고, 불숨으로 부채꼴 범위를 태워요', reward: '변경의 평화 (엔딩)' },
};
MG.STRUCTS = {
  palisade: { name: '목책', color: '#8a6a40', hp: 350 },
  stonewall: { name: '돌벽', color: '#5a5660', hp: 900 },
  tower:    { name: '망루', color: '#7a5a3a', hp: 700, range: 210, atk: 9, cd: 1.6 },
  hq:       { name: '적 본진', color: '#6a3a2a' },
};
MG.BIOME_NAME = { forest: '숲', plain: '평원', swamp: '늪', stone: '돌 요새' };
MG.ENDING_RENOWN = 100;      // 검은 성채를 함락하면 명성 +
MG.ENDLESS_STEP = 0.1;       // 엔딩 뒤 계속 다스리면 해마다 습격 규모 +10%
MG.MARCH_FOOD = 300;
MG.MARCH_AP = 2;
MG.MARCH_MIN = 2;            // 장수 부대 최소 수
MG.CONQUEST_SCOUT = { gold: 50 };
MG.CONQUEST_FAIL_MUL = 0.2;  // 실패할 때마다 거점 수비 +20%
MG.RETALIATION_MUL = 1.5;    // 정벌 직후 보복 습격 규모
MG.REINF_GAP = 30;           // 본진 증원 간격(초)
MG.conquestGold = stars => 200 * stars;

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

// ---------- A: 전투 스킬과 소모품 ----------
// 스킬은 병종마다 하나. 장수가 살아 있는 부대만 쓸 수 있고, Lv.5 전직 갈래(A/B)에 따라 강해진다.
// target: self(바로), point(땅을 찍음, 부대에서 SKILL_RANGE 안)
MG.SKILLS = {
  infantry:  { name: '방패벽',      cd: 30, target: 'self',  desc: '8초간 받는 피해 -50%', A: '피해 -70%, 12초', B: '끝날 때 주변 적에게 반격' },
  archer:    { name: '화살비',      cd: 25, target: 'point', desc: '지정한 곳 반경 60에 3초간 화살', A: '범위가 좁고 피해 2배', B: '5초로 늘어남' },
  mage:      { name: '대폭발',      cd: 30, target: 'point', desc: '지정한 곳에 큰 폭발', A: '불바다가 4초간 남음', B: '맞은 적이 2초간 얼어붙음' },
  priest:    { name: '축복',        cd: 35, target: 'self',  desc: '부대 전원 체력 30% 회복', A: '50%, 주변 부대도', B: '주변 아군 공격력 +25% 8초' },
  engineer:  { name: '긴급 보수',   cd: 40, target: 'self',  desc: '근처 성벽·건물·본성 즉시 +400', A: '+800', B: '폭약: 근처 진지 구조물에 큰 피해' },
  artillery: { name: '집중 포격',   cd: 40, target: 'point', desc: '지정한 곳에 5발 연속 포격', A: '범위 확대', B: '맞은 곳이 불탐' },
  cavalry:   { name: '돌파',        cd: 25, target: 'point', desc: '지정한 곳까지 돌진, 지나는 적에게 피해와 넉백', A: '피해 증가', B: '쿨 절반' },
  guard:     { name: '변경백의 깃발', cd: 60, target: 'self', desc: '전군 공격력 +15% 10초 (성주가 살아 있어야)' },
};
MG.SKILL_RANGE = 420;
// 소모품: 시장에서 사고, 전투마다 최대 3종을 챙겨 간다. defense: 방어전에서만
MG.ITEMS = {
  potion:  { name: '치유 물약',   price: 60, target: 'squad', desc: '고른 부대 체력 40% 회복' },
  firepot: { name: '화염 항아리', price: 80, target: 'point', desc: '던진 곳 반경 50에 피해와 화상' },
  drum:    { name: '전투 북',     price: 70, target: 'none',  desc: '전군 공격 속도 +20%, 15초' },
  oil:     { name: '끓는 기름',   price: 90, target: 'wall',  defense: true, desc: '성벽 한 조각 앞의 적에게 큰 피해' },
  timber:  { name: '응급 목재',   price: 50, target: 'wall',  defense: true, desc: '성벽 한 조각 즉시 +500' },
};
MG.ITEM_CARRY = 3;   // 전투마다 챙겨 가는 종류 수
MG.ITEM_MAX = 9;     // 종류마다 보관 한도

// ---------- B1: 유물, 3택1 보상, 가문 내력 ----------
// 유물: 캠페인 내내 붙는 효과. 같은 것은 하나만. 효과는 쓰는 곳에서 MG.hasRelic(id)로 확인한다.
MG.RELICS = {
  warflag:     { name: '낡은 전쟁 깃발',   grade: 'common',    desc: '성주 오라 범위 +50%' },
  chisel:      { name: '석공의 끌',       grade: 'common',    desc: '수리 목재 -30%' },
  arrowheads:  { name: '화살촉 주머니',    grade: 'common',    desc: '궁수 부대와 직할 궁수 공격력 +15%' },
  horn:        { name: '용사의 뿔나팔',    grade: 'common',    desc: '전투 시작 30초 동안 전군 공격력 +20%' },
  pickaxe:     { name: '황금 곡괭이',      grade: 'common',    desc: '광산 철 생산 +50%' },
  sickle:      { name: '풍요의 낫',       grade: 'common',    desc: '농장 식량 생산 +25%' },
  goblinskull: { name: '고블린 해골',      grade: 'common',    desc: '고블린·고블린 궁수가 받는 피해 +25%' },
  whetstone:   { name: '숫돌',           grade: 'common',    desc: '보병·근위병 공격력 +10%' },
  ledger:      { name: '세리의 장부',      grade: 'common',    desc: '세금 +15%' },
  bandage:     { name: '붕대 꾸러미',      grade: 'common',    desc: '전투 후 사망 판정의 30%가 경상으로' },
  reliquary:   { name: '순례자의 성유물',  grade: 'rare',      desc: '병원 수용 인원 2배' },
  crystal:     { name: '마법사의 수정',    grade: 'rare',      desc: '모든 스킬 쿨 -20%' },
  crest:       { name: '성벽 문장',       grade: 'rare',      desc: '성벽·성문 체력 +15%' },
  orcfang:     { name: '오크 송곳니',      grade: 'rare',      desc: '오크·투석병·트롤이 받는 피해 +20%' },
  scales:      { name: '상인의 저울',      grade: 'rare',      desc: '시장에서 사는 값 -10%, 파는 값 +10%' },
  boots:       { name: '전령의 장화',      grade: 'rare',      desc: '매달 행동력 +1' },
  royalseal:   { name: '왕실 인장',       grade: 'rare',      desc: '본국 관계가 오를 때 2배' },
  dragonscale: { name: '용의 비늘',       grade: 'legendary', desc: '장수와 성주가 받는 피해 -30%' },
  grail:       { name: '성배',           grade: 'legendary', desc: '전투 중 모든 아군이 1초에 체력 0.5%씩 회복' },
  wardrum:     { name: '전쟁의 북',       grade: 'legendary', desc: '전군 공격 속도 +10%' },
  circlet:     { name: '변경백의 관',      grade: 'legendary', desc: '캠페인이 끝날 때 얻는 명성 +25%' },
};
MG.RELIC_GRADES = { common: { name: '일반', color: '#c9d1dc' }, rare: { name: '희귀', color: '#6aa8ff' }, legendary: { name: '전설', color: '#ffb347' } };
// 3택1 카드: 습격을 막을 때마다 하나. 대습격은 등급이 오르고 유물이 한 장 꼭 나온다.
MG.CARD_KINDS = { weapon: '무기', relic: '유물', res: '자원', troops: '직할 병사', xp: '장수 경험치', items: '소모품', crown: '본국 관계' };
MG.rerollCost = level => 40 + 10 * level;
// 가문 내력: 새 캠페인마다 무작위 셋 중 하나를 고른다
MG.ORIGINS = {
  knight:   { name: '기사 가문',     desc: '성주 체력·공격력 +50%' },
  merchant: { name: '상인 가문',     desc: '시작 골드 2배, 시장을 짓고 시작' },
  arcane:   { name: '마법 가문',     desc: '마법탑을 짓고 시작, 마법사 공격력 +20%' },
  hunter:   { name: '변방 사냥꾼',   desc: '궁수 사거리 +15%' },
  fallen:   { name: '몰락 귀족',     desc: '본국 관계 20에서 시작, 얻는 명성 +20%' },
  iron:     { name: '철기 가문',     desc: '시작 철 +200, 대장간을 짓고 시작' },
  pious:    { name: '신앙 가문',     desc: '사원을 짓고 시작, 사제 회복량 +20%' },
};

// ---------- 성주 능력치 ----------
// 기준값 3. 레벨이 오르면 2점: 1점은 무작위 능력치에 자동, 1점은 직접 분배
MG.LORD_STATS = {
  might: { name: '무용', desc: '성주 공격력·체력 (3에서 1점당 ±10%)' },
  lead:  { name: '통솔', desc: '근위대 수 (1점당 2명, 3이면 10명)' },
  cmd:   { name: '지휘', desc: '성주 오라: 1점당 범위 +5%, 공격력 보너스 +2%p' },
  admin: { name: '정무', desc: '3에서 1점당 세금 ±4%, 모집 인원 +1 (병영이 있을 때)' },
};
MG.rollLordStats = () => {
  const st = { might: 2, lead: 2, cmd: 2, admin: 2 }, keys = Object.keys(st);
  for (let i = 0; i < 6; i++) st[keys[(Math.random() * 4) | 0]]++;  // 합 14, 무작위로
  return st;
};
MG.lordGuards = st => 4 + 2 * (st ? st.lead : 3);
MG.lordMight = st => Math.max(0.5, 1 + 0.1 * ((st ? st.might : 3) - 3));
MG.lordAura = st => {
  const c = (st ? st.cmd : 3) - 3;
  return { r: MG.LORD.aura * (1 + 0.05 * c), bonus: Math.max(0.04, MG.LORD.auraBonus + 0.02 * c) };
};
MG.adminMul = st => 1 + 0.04 * ((st ? st.admin : 3) - 3);

// ---------- 난이도 ----------
// 습격 적 공격력·성벽 피해: 첫 전투부터 1.15배, 전투마다 +6%
MG.enemyAtkScale = L => 1.15 * (1 + 0.06 * (L - 1));
// count: 적 수, hp: 적 체력, atk: 적 공격력, renown: 얻는 명성. 새 캠페인 준비 창에서 고른다 (해금 없음)
MG.DIFFICULTY = {
  easy:      { name: '쉬움',  desc: '예전 밸런스에 가까워요', count: 0.8,  hp: 0.85, atk: 0.75, renown: 0.7 },
  normal:    { name: '보통',  desc: '기본',                  count: 1,    hp: 1,    atk: 1,    renown: 1 },
  hard:      { name: '어려움', desc: '적 수 +25%, 체력·공격 +15%', count: 1.25, hp: 1.15, atk: 1.15, renown: 1.3 },
  nightmare: { name: '악몽',  desc: '적 수 +50%, 체력·공격 +30%', count: 1.5,  hp: 1.3,  atk: 1.3,  renown: 1.6 },
};

// ---------- 성벽·성문 강화와 부가 시설 (면별) ----------
MG.WALL_LEVELS = [
  { name: '기본 성벽', mul: 1 },
  { name: '석벽', mul: 1.4, cost: { gold: 150, wood: 250, iron: 40 } },
  { name: '강화 석벽', mul: 1.8, cost: { gold: 300, wood: 400, iron: 120 }, desc: '성벽 위 궁수 사거리 +10%' },
];
MG.GATE_LEVELS = [
  { name: '나무 성문', mul: 1 },
  { name: '철 성문', mul: 1.6, cost: { gold: 120, wood: 100, iron: 120 } },
  { name: '쇠창살 성문', mul: 2.2, cost: { gold: 250, wood: 150, iron: 250 }, desc: '성문 앞 적 이동 -30%' },
];
MG.FORT_EXTRAS = {
  moat: { name: '해자',     desc: '이 면 성벽 바로 앞 적 이동 -40% (날아다니는 적 제외)', cost: { gold: 200, wood: 150 } },
  oil:  { name: '기름 구멍', desc: '이 면 성문 앞에 8초마다 범위 피해와 화상', cost: { gold: 180, wood: 100, iron: 60 } },
};
MG.CORNER_TOWERS = { name: '모서리 망루', desc: '성 네 모서리에서 1.2초마다 가까운 적에게 화살', cost: { gold: 250, wood: 200, iron: 80 } };
MG.newFort = () => {
  const side = v => Object.fromEntries(MG.SIDES.map(s => [s, v]));
  return { wall: side(0), gate: side(0), moat: side(false), oil: side(false), towers: false };
};
// 성벽 조각 id('N0'~'W4', 가운데 2가 성문)의 강화 배율
MG.fortLevelMul = (fort, id) => (fort ? (id[1] === '2' ? MG.GATE_LEVELS[fort.gate[id[0]]] : MG.WALL_LEVELS[fort.wall[id[0]]]).mul : 1);

// ---------- 훈련소와 예비군 ----------
// 모집(1명당 골드 5) 뒤에 병종별로 드는 훈련 기간과 비용(1명당). 필요 건물은 MG.REFILL_BUILDING과 같다.
MG.TRAINING = {
  infantry:  { months: 0, cost: {} },
  archer:    { months: 1, cost: { gold: 2 } },
  engineer:  { months: 1, cost: { wood: 2 } },
  priest:    { months: 2, cost: { gold: 5 } },
  mage:      { months: 2, cost: { gold: 5 } },
  artillery: { months: 2, cost: { gold: 15, iron: 4 } },  // 포값
  cavalry:   { months: 2, cost: { gold: 8, food: 5 } },   // 말값. 기병은 말 먹이로 식량을 2배 먹는다
};
MG.TRAIN_PER_BARRACKS = 20;  // 병영 단계당 한 번에 훈련하는 인원

// ---------- 병사 숙련도 ----------
// 부대마다 0~400. 100마다 계급. 새 병사를 넣으면 평균이 낮아진다(희석).
MG.VET_MAX = 400;
MG.VET_RANKS = [
  { name: '신병',    mul: 1 },
  { name: '숙련병',  mul: 1.05 },
  { name: '정예병',  mul: 1.10 },
  { name: '고참병',  mul: 1.15 },
  { name: '백전노장', mul: 1.20, dmgTaken: 0.95 },
];
MG.vetRank = v => Math.min(4, Math.floor((v || 0) / 100));
MG.vetMods = v => { const R = MG.VET_RANKS[MG.vetRank(v)]; return { atk: R.mul, hp: R.mul, dmgTaken: R.dmgTaken || 1 }; };
// 숙련도 va인 na명 + vb인 nb명을 합친 평균
MG.vetMix = (va, na, vb, nb) => (na + nb > 0 ? ((va || 0) * na + (vb || 0) * nb) / (na + nb) : 0);
MG.vetGain = xp => Math.min(40, xp * 0.4);  // 전투 한 번에 오르는 숙련도
