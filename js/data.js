// 게임 데이터: 병종, 적, 시작 병력, 웨이브 구성. 밸런스 조정은 여기서 한다.
window.MG = window.MG || {};

MG.WORLD = { w: 2000, h: 1400 };
// R: 성벽 바깥 반폭, T: 성벽 두께, gateHalf: 성문 반폭, keepR: 본성 반지름
MG.CASTLE = { x: 1000, y: 700, R: 320, T: 30, gateHalf: 30, keepR: 60 };
// 한 면 = 성벽 4조각 + 가운데 성문. 성문은 약한 요충지.
MG.WALL_SEG_HP = 1200;
MG.GATE_HP = 900;
MG.GATE_TARGET = { goblin: 0.2, wolf: 0.1, orc: 0.6 };  // 성문을 노리는 비율
MG.KEEP_HP = 1500;

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
  return { groups, dirs: L >= 3 ? [a, b, c] : [a, b] };
};
