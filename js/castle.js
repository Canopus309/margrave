// 성: 건물·들판, 철거, 성벽 강화, 수리, 대장간 제작, 시장, 매달 수입·지출.
(() => {
const { addRes, save, act, freeAct, rollWeapon } = MG.lib;

// ---------- 건물 ----------
const B_ = () => MG.S.buildings;
MG.buildingAtCell = (i, j) => B_().find(b => i >= b.i && i < b.i + MG.BUILDINGS[b.type].w && j >= b.j && j < b.j + MG.BUILDINGS[b.type].h);
MG.canPlace = (type, i, j) => {
  const d = MG.BUILDINGS[type];
  for (let x = i; x < i + d.w; x++) for (let y = j; y < j + d.h; y++) {
    if (x >= MG.GRID.n || y >= MG.GRID.n || MG.reservedCell(x, y) || MG.buildingAtCell(x, y)) return false;
  }
  return true;
};
function placeBuilding(type, i, j) {
  const d = MG.BUILDINGS[type];
  const b = { id: MG.S.nextId++, type, i, j, level: 1, hp: d.hp, max: d.hp };
  MG.S.buildings.push(b);
  return b;
}
// 빈자리 중 위쪽·왼쪽부터 처음 맞는 곳에 짓는다 (자리가 없으면 undefined)
function placeAnywhere(type) {
  for (let j = 1; j < MG.GRID.n; j++) for (let i = 1; i < MG.GRID.n; i++) if (MG.canPlace(type, i, j)) return placeBuilding(type, i, j);
}
// 멀쩡한 건물 중 가장 높은 단계 (부서진 건물은 기능 없음)
MG.bLevel = type => B_().filter(b => b.type === type && b.hp > 0).reduce((m, b) => Math.max(m, b.level), 0);
MG.bSum = type => B_().filter(b => b.type === type && b.hp > 0).reduce((m, b) => m + b.level, 0);
MG.popCap = () => MG.bSum('house') * MG.HOUSE_POP;
MG.hospitalCap = () => MG.bSum('hospital') * MG.HOSPITAL_PER_LEVEL * (MG.hasRelic('reliquary') ? 2 : 1);
MG.storageCap = () => MG.STORAGE_BASE + MG.bSum('storage') * 1000 + (MG.perk('granary') ? 500 : 0);

MG.actBuild = (type, i, j) => act(MG.costOf(MG.BUILDINGS[type].cost, 1), () => (MG.canPlace(type, i, j) ? (placeBuilding(type, i, j), null) : '여기에는 지을 수 없어요'));
MG.upgradeCost = b => MG.costOf(MG.BUILDINGS[b.type].cost, b.level + 1);
MG.actUpgrade = b => {
  if (b.level >= MG.BUILDINGS[b.type].max) return '최고 단계예요';
  if (b.hp <= 0) return '먼저 수리해야 해요';
  return act(MG.upgradeCost(b), () => { b.level++; b.max = Math.round(MG.BUILDINGS[b.type].hp * (1 + 0.3 * (b.level - 1))); b.hp = b.max; });
};
MG.actField = type => act(MG.costOf(MG.FIELDS[type].cost, 1), () => (MG.S.fields.length < MG.FIELD_SLOTS ? (MG.S.fields.push({ type, level: 1 }), null) : '들판에 빈자리가 없어요'));
MG.fieldUpgradeCost = f => MG.costOf(MG.FIELDS[f.type].cost, f.level + 1);
MG.actFieldUpgrade = f => (f.level >= MG.FIELDS[f.type].max ? '최고 단계예요' : act(MG.fieldUpgradeCost(f), () => { f.level++; }));

// 철거: 행동력 없이, 짓고 강화하는 데 든 자원의 절반을 돌려받는다
MG.demolishRefund = (base, level) => {
  const out = {};
  for (let l = 1; l <= level; l++) for (const [k, v] of Object.entries(MG.costOf(base, l))) out[k] = (out[k] || 0) + v;
  for (const k of Object.keys(out)) out[k] = Math.floor(out[k] / 2);
  return out;
};
const refund = cost => { for (const [k, v] of Object.entries(cost)) addRes(k, v); };
MG.demolish = b => {
  const S = MG.S, d = MG.BUILDINGS[b.type], back = MG.demolishRefund(d.cost, b.level);
  if (!S.buildings.includes(b)) return '이미 없는 건물이에요';
  S.buildings = S.buildings.filter(x => x !== b);
  refund(back);  // 창고를 헐면 한도가 줄어드니, 헌 뒤의 한도로 맞춘다
  save();
  return `${MG.josa(d.name, '을를')} 헐었어요. ${MG.costText(back)} 돌려받았어요.`;
};
MG.demolishField = idx => {
  const S = MG.S, f = S.fields[idx];
  if (!f) return '이미 없는 시설이에요';
  const d = MG.FIELDS[f.type], back = MG.demolishRefund(d.cost, f.level);
  S.fields.splice(idx, 1);
  refund(back);
  save();
  return `${MG.josa(d.name, '을를')} 헐었어요. ${MG.costText(back)} 돌려받았어요.${d.hidden ? ' (다시 지을 수 없어요)' : ''}`;
};

// 성벽 조각 최대 체력 (국경 요새 영지면 +30%). id의 두 번째 글자 2는 성문
MG.wallMul = () => (MG.S && MG.S.domain === 'fortress' ? MG.WALL_DOMAIN_MUL : 1) * (MG.S && MG.hasRelic('crest') ? 1.15 : 1) * (MG.perk('siegehold') ? 1.5 : 1);
MG.wallMax = id => Math.round((id[1] === '2' ? MG.GATE_HP : MG.WALL_SEG_HP) * MG.wallMul() * MG.fortLevelMul(MG.S && MG.S.fort, id));

// 성벽·성문 강화와 부가 시설 (면별, 행동력 1). kind: wall gate moat oil towers
MG.fortCost = (kind, side) => {
  const F = MG.S.fort;
  if (kind === 'wall') { const n = MG.WALL_LEVELS[F.wall[side] + 1]; return n && n.cost; }
  if (kind === 'gate') { const n = MG.GATE_LEVELS[F.gate[side] + 1]; return n && n.cost; }
  if (kind === 'towers') return F.towers ? null : MG.CORNER_TOWERS.cost;
  return F[kind][side] ? null : MG.FORT_EXTRAS[kind].cost;
};
MG.actFort = (kind, side) => {
  const S = MG.S, F = S.fort, cost = MG.fortCost(kind, side);
  if (!cost) return '이미 다 지었어요';
  return act(cost, () => {
    if (kind === 'wall' || kind === 'gate') {
      // 부서진 채 남아 있던 조각은 늘어난 체력만큼 함께 늘어난다
      const ids = [0, 1, 2, 3, 4].map(i => side + i).filter(id => (id[1] === '2') === (kind === 'gate'));
      const before = Object.fromEntries(ids.map(id => [id, MG.wallMax(id)]));
      F[kind][side]++;
      for (const id of ids) if (S.walls[id] != null) S.walls[id] += MG.wallMax(id) - before[id];
    } else if (kind === 'towers') F.towers = true;
    else F[kind][side] = true;
  }) || `${MG.SIDE_NAME[side] || ''}${side ? '쪽 ' : ''}${MG.josa(kind === 'wall' ? MG.WALL_LEVELS[F.wall[side]].name : kind === 'gate' ? MG.GATE_LEVELS[F.gate[side]].name : kind === 'towers' ? MG.CORNER_TOWERS.name : MG.FORT_EXTRAS[kind].name, '을를')} 갖췄어요.`;
};

// 수리: 성벽·성문·본성은 일괄(목재만큼), 건물은 한 채씩
MG.damageList = () => {
  const S = MG.S, list = [];
  for (const [id, hp] of Object.entries(S.walls)) {
    const max = MG.wallMax(id);
    if (hp < max) list.push({ kind: 'wall', id, hp, max });
  }
  if (S.keep < MG.KEEP_HP) list.push({ kind: 'keep', hp: S.keep, max: MG.KEEP_HP });
  for (const b of S.buildings) if (b.hp < b.max) list.push({ kind: 'building', b, hp: b.hp, max: b.max });
  return list;
};
// 수리 대상: 'all'(성벽·성문·본성 일괄), 'keep'(본성), 'side:N'(그 면 성벽·성문), 'b:건물id'
// 성벽·성문·본성은 목재가 모자라면 있는 만큼만, 건물은 한 채를 다 고칠 목재가 있어야 고친다
const repairFilter = spec => {
  if (!spec || typeof spec !== 'string' || spec === 'all') return d => d.kind !== 'building';
  if (spec === 'keep') return d => d.kind === 'keep';
  if (spec.startsWith('side:')) return d => d.kind === 'wall' && d.id[0] === spec[5];
  return d => d.kind === 'building' && d.b.id === +spec.slice(2);
};
const isBuildingSpec = spec => typeof spec === 'string' && spec.startsWith('b:');
// 고를 수 있는 피해 (양 제한 없음)
MG.repairDamage = spec => Math.round(MG.damageList().filter(repairFilter(spec)).reduce((a, d) => a + d.max - d.hp, 0));
// 체력 1을 고치는 목재
const repairWoodPerHp = () => MG.REPAIR_WOOD_PER_HP * (MG.hasEngineers() ? 0.6 : 1) * (MG.hasRelic('chisel') ? 0.7 : 1) * (MG.perk('siegehold') ? 0.5 : 1);
const woodFor = hp => Math.ceil(hp * repairWoodPerHp() - 1e-9);
// 이번에 고치는 양: 성벽은 목재만큼만, 건물은 다 고치거나(목재 충분) 못 고치거나
MG.repairNeed = spec => {
  const dmg = MG.repairDamage(spec);
  if (isBuildingSpec(spec)) return woodFor(dmg) <= Math.floor(MG.S.res.wood) ? dmg : 0;
  return Math.min(dmg, Math.floor(Math.floor(MG.S.res.wood) / repairWoodPerHp()));
};
// 공병 부대가 성에 있으면(원정 중 아님, 병사 있음) 수리 목재가 40% 줄어든다
MG.hasEngineers = () => MG.S.generals.some(g => g.type === 'engineer' && !g.dead && !g.away && g.healthy > 0);
MG.repairCost = spec => ({ wood: woodFor(MG.repairNeed(spec)) });
// 다 고치는 데 드는 목재 (건물 버튼 표시용)
MG.repairFullCost = spec => ({ wood: woodFor(MG.repairDamage(spec)) });
MG.actRepair = spec => {
  if (!MG.repairDamage(spec)) return '고칠 곳이 없어요';
  const need = MG.repairNeed(spec);
  if (!need) return isBuildingSpec(spec) ? `목재가 모자라요 (다 고치려면 목재 ${MG.repairFullCost(spec).wood})` : '목재가 모자라요';
  return act(MG.repairCost(spec), () => {
    let left = need;
    // 무너진 성벽·성문 먼저, 그다음 본성, 그다음 많이 부서진 비율 순
    const rank = d => (d.kind === 'wall' && d.hp <= 0 ? 0 : d.kind === 'keep' ? 1 : 2);
    for (const d of MG.damageList().filter(repairFilter(spec)).sort((a, b) => rank(a) - rank(b) || a.hp / a.max - b.hp / b.max)) {
      const add = Math.min(left, d.max - d.hp);
      left -= add;
      if (d.kind === 'wall') MG.S.walls[d.id] = d.hp + add;
      else if (d.kind === 'keep') MG.S.keep = d.hp + add;
      else d.b.hp = d.max;
      if (left <= 0) break;
    }
    for (const [id, hp] of Object.entries(MG.S.walls)) if (hp >= MG.wallMax(id)) delete MG.S.walls[id];
  });
};

MG.actCraft = () => {
  const l = MG.bLevel('smithy');
  if (!l) return '대장간이 없어요';
  let w;
  // 대장장이 영주(결단): 행동력 없이, 등급 +1
  const why = (MG.perk('smith') ? freeAct : act)(MG.CRAFT_COST, () => { w = rollWeapon(MG.S.level, Math.min(3, l + (MG.perk('smith') ? 1 : 0))); MG.S.inventory.push(w); });
  return why || `${MG.WEAPON_GRADES[w.grade].name} ${MG.josa(w.name, '을를')} 만들었어요`;
};

// ---------- 시장 ----------
// 예전 저장에는 시세가 없으니 처음 볼 때 만든다
MG.ensureMarket = () => {
  const S = MG.S;
  if (!S.prices) { S.prices = { ...MG.MARKET.base }; S.prevPrices = { ...S.prices }; S.traded = 0; }
};
MG.buyPrice = r => MG.S.prices[r] * (MG.hasRelic('scales') ? 0.9 : 1);
MG.sellPrice = r => MG.S.prices[r] * MG.MARKET.sellRate(MG.bLevel('market')) * (MG.hasRelic('scales') ? 1.1 : 1);
// 시장 골드: 가장 높은 시장 단계 × 40 + 나머지 시장 단계 × 12
MG.marketGold = () => { const top = MG.bLevel('market'); return top * MG.MARKET_GOLD + (MG.bSum('market') - top) * MG.MARKET_EXTRA_GOLD; };
// 거래 한도: 가장 높은 시장 단계 기준 + 두 번째 시장부터 하나마다 +50
MG.tradeVolume = () => { const n = MG.S.buildings.filter(b => b.type === 'market' && b.hp > 0).length; return n ? MG.MARKET.volume(MG.bLevel('market')) + (n - 1) * MG.MARKET_EXTRA_VOLUME : 0; };
MG.tradeLeft = () => Math.max(0, Math.floor(MG.tradeVolume() * (MG.perk('smith') ? 0.5 : 1)) - MG.S.traded);
// 사기(qty>0) 또는 팔기(qty<0). 행동력은 쓰지 않는다.
// 소모품: 시장이 있으면 골드로 산다 (행동력 안 씀)
MG.buyItem = k => {
  const S = MG.S, I = MG.ITEMS[k];
  if (!MG.bLevel('market')) return '시장이 필요해요';
  if ((S.items[k] || 0) >= MG.ITEM_MAX) return `${MG.josa(I.name, '은는')} ${MG.ITEM_MAX}개까지 보관해요`;
  if (S.res.gold < I.price) return '골드가 모자라요';
  S.res.gold -= I.price;
  S.items[k] = (S.items[k] || 0) + 1;
  save();
  return `${MG.josa(I.name, '을를')} 샀어요.`;
};
MG.trade = (r, qty) => {
  const S = MG.S;
  MG.ensureMarket();
  if (!MG.bLevel('market')) return '시장이 없거나 부서졌어요';
  const n = Math.min(Math.abs(qty), MG.tradeLeft());
  if (!n) return '이번 달 거래 한도를 다 썼어요';
  if (qty > 0) {
    const room = MG.storageCap() - S.res[r], k = Math.min(n, room, Math.floor(S.res.gold / MG.buyPrice(r)));
    if (k <= 0) return room <= 0 ? '창고가 가득 찼어요' : '골드가 모자라요';
    S.res.gold -= Math.ceil(k * MG.buyPrice(r)); S.res[r] += k; S.traded += k;
  } else {
    const k = Math.min(n, Math.floor(S.res[r]));
    if (k <= 0) return `팔 ${MG.josa(MG.RES[r], '이가')} 없어요`;
    S.res[r] -= k; addRes('gold', Math.floor(k * MG.sellPrice(r))); S.traded += k;
  }
  save();
  return null;
};
function moveMarket() {
  const S = MG.S, M = MG.MARKET, season = MG.SEASON(S.month);
  MG.ensureMarket();
  S.prevPrices = { ...S.prices };
  for (const r of Object.keys(M.base)) {
    const target = M.base[r] * ((M.season[r] && M.season[r][season]) || 1);
    let p = S.prices[r] * (1 + (Math.random() * 2 - 1) * M.drift);
    p += (target - p) * M.pull;
    S.prices[r] = Math.round(Math.max(M.base[r] * M.min, Math.min(M.base[r] * M.max, p)) * 100) / 100;
  }
  S.traded = 0;
}

// ---------- 한 달 마치기 ----------
// 매달 수입·지출 내역. 식량은 병사와 주민이 똑같이 먹고, 병사에게는 급여가 나간다.
MG.economy = () => {
  const S = MG.S, season = MG.SEASON(S.month), mul = MG.SEASON_PROD[season];
  const made = { gold: 0, food: 0, wood: 0, iron: 0 };
  for (const f of S.fields) for (const [k, v] of Object.entries(MG.FIELDS[f.type].prod)) made[k] += v * f.level * (mul[k] != null ? mul[k] : 1);
  // 영지 특성
  if (S.domain === 'mine') made.iron *= 1.5;
  if (MG.hasRelic('pickaxe')) made.iron *= 1.5;
  if (MG.perk('smith')) made.iron *= 1.3;
  if (MG.perk('militia')) made.food += Math.floor((S.garrison.archer + S.garrison.infantry) / 10) * 4;
  if (MG.hasRelic('sickle')) made.food *= 1.25;
  if (S.domain === 'fertile') made.food *= 1.3;
  // 정벌한 거점에서 들어오는 것
  if (MG.hasOutpost('orc')) made.iron += 20;
  if (MG.hasOutpost('troll')) { made.wood += 30; made.food += 20; }
  const generals = S.generals.filter(g => !g.dead).length;
  const cavalry = S.generals.filter(g => g.type === 'cavalry').reduce((a, g) => a + g.healthy, 0) + MG.reserveCount(true);
  const soldiers = S.generals.reduce((a, g) => a + g.healthy, 0) + MG.reserveCount()
    + S.garrison.archer + S.garrison.infantry + S.garrison.wounded.length + MG.LORD.guards;
  // 연대기 사건의 지속 효과: 세금 감면, 혹한(겨울 식량 소비 1.5배)
  const winterCold = MG.hasEffect('harshWinter') && season === '겨울';
  return {
    tax: Math.floor(S.pop * MG.TAX_PER_POP * (MG.hasEffect('lowtax') ? 0.7 : 1) * (MG.hasRelic('ledger') ? 1.15 : 1) * MG.adminMul(S.lord.stats) * (MG.perk('taxreform') ? 1.1 : 1)),
    market: Math.round(MG.marketGold() * (S.domain === 'trade' ? 1.5 : 1)),
    wages: Math.ceil(soldiers * MG.WAGE_SOLDIER * (MG.perk('militia') ? 0.5 : 1) * (MG.perk('mercenary') ? 1.5 : 1) + generals * MG.WAGE_GENERAL),
    made, eat: Math.ceil(((soldiers + generals + cavalry) * (MG.perk('rations') ? 0.85 : 1) + S.pop) * MG.FOOD_PER_PERSON * (winterCold ? 1.5 : 1)), soldiers: soldiers + generals,
  };
};
MG.production = () => {
  const e = MG.economy();
  return { gold: Math.round(e.tax + e.market + e.made.gold - e.wages), food: e.made.food - e.eat, wood: e.made.wood, iron: e.made.iron };
};

Object.assign(MG.lib, { placeBuilding, placeAnywhere, moveMarket });
})();
