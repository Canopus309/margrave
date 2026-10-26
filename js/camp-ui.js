// 내정 화면: 달마다 행동력으로 성 안 건물·들판·수리·모집·훈련·정찰·제작을 하고, 장수와 병원을 관리한다
(() => {
const $ = id => document.getElementById(id);
const el = $('camp');
const CELL_PX = 30;
let resetArmed = false;
let dismissArmed = null;  // 해고 확인 중인 장수 id
let demolishArmed = null; // 철거 확인 중: 'b'+건물 id 또는 'f'+들판 번호
let saveOpen = false;     // 저장·불러오기 창
let chronOpen = false;    // 연대기 창
let setupOpen = false;    // 새 캠페인 준비 창
let perkOpen = false;     // 특성 트리 창 (준비 창 위에)
let perkResetArmed = false;
let setup = { perkSlots: [], keystone: null, difficulty: 'normal', domain: 'none', bonuses: [], siege: 0, originOffer: null, relicOffer: null, origin: null, relic: null };
let slotArmed = null;     // 두 번 눌러 확인 중인 슬롯 동작 'save:1', 'load:2', 'del:3'
let tab = 'castle';         // 내정 화면 탭: castle army war market family
let openGen = new Set();    // 펼쳐 둔 장수 카드
let marchPick = new Set();  // 정벌군으로 고른 장수 id
let marchLord = false;      // 성주 친정
let sel = null;   // { i, j } 빈 칸 또는 { b } 건물
let msg = '';

const pct = (a, b) => (b ? Math.max(0, Math.min(100, a / b * 100)) : 0);
const gradeTag = w => {
  const g = MG.WEAPON_GRADES[w.grade];
  return `<b style="color:${g.color}">[${g.name}] ${w.name}</b>`;
};
const woundCounts = list => {
  const light = list.filter(w => w.sev === 'light').length;
  return `경상 ${light} · 중상 ${list.length - light}`;
};
const sign = v => (v >= 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);

// ---------- 머리말: 날짜, 자원, 습격 예고 ----------
function headerBlock() {
  const S = MG.S, prod = MG.production(), eco = MG.economy(), cap = MG.storageCap(), fc = MG.attackForecast(), A = S.nextAttack;
  let intel = '';
  if (A.scout >= 1) intel += ` <span class="tag" title="${MG.FACTIONS[A.faction || 'goblin'].desc}">${MG.ic(MG.ICONS.faction[A.faction || 'goblin'])} ${MG.factionText(A.faction, A.mix)}</span>`;
  if (A.scout >= 1) intel += A.dirs.map(d => ` <span class="tag" title="${MG.SIDE_NAME[d]}쪽에서 와요">${MG.ic(MG.ICONS.side[d])}${MG.SIDE_NAME[d]}</span>`).join('');
  if (A.scout >= 2) {
    const sum = {};
    for (const g of MG.attackGroups()) sum[g.type] = (sum[g.type] || 0) + g.count;
    intel += ` <span class="muted small">${Object.entries(sum).map(([t, n]) => `${MG.ENEMY_TYPES[t].name} ${n}`).join(' · ')}</span>`;
  }
  if (A.mul && A.mul < 1) intel += ` <span class="tag ok" title="고블린 둥지 소탕">${MG.ic('arrow-down')}${Math.round((1 - A.mul) * 100)}%</span>`;
  if (A.retaliation) intel += ` <span class="tag danger">${MG.ic('flame')} ${MG.OUTPOSTS[A.retaliation].name}의 보복</span>`;
  const attackNow = MG.isAttackMonth();
  const marchNow = S.pendingConquest && S.march;
  const I = MG.ICONS, season = MG.SEASON(S.month);
  // 자원 칩: 아이콘 + 값 + 달 변화. 자세한 내역은 말풍선으로
  const tip = { gold: `세금 +${eco.tax}${eco.market ? ` · 시장 +${eco.market}` : ''} · 급여 -${eco.wages} (병력 ${eco.soldiers}명)`,
    food: `생산 +${Math.round(eco.made.food)} · 소비 -${eco.eat} (병사·주민 1인당 ${MG.FOOD_PER_PERSON})`, wood: '들판 벌목장', iron: '들판 광산' };
  const chips = Object.keys(MG.RES).map(k => `<div class="chip" title="${MG.RES[k]} · ${tip[k]} · 보관 한도 ${cap}">${MG.icRes(k)}<b>${Math.floor(S.res[k])}</b>
    <i class="${prod[k] < 0 ? 'danger' : 'ok'}">${sign(prod[k])}</i></div>`).join('');
  const warns = [
    S.starving && ['grain', '식량이 바닥났어요 — 공격력이 떨어지고 주민·병사가 떠나요', 'danger'],
    S.unpaid && ['coins', '급여가 밀렸어요 — 공격력이 떨어지고 병사가 탈영해요', 'danger'],
    !S.unpaid && prod.gold < 0 && S.res.gold + prod.gold < 0 && ['coins', '이대로면 다음 달 급여를 다 못 줘요', 'warn'],
    S.keep < MG.KEEP_HP * 0.5 && ['building-castle', `본성 체력 ${Math.round(S.keep)} / ${MG.KEEP_HP} — 수리하세요`, 'danger'],
    MG.damageList().some(d => d.kind === 'wall' && d.hp <= 0) && ['wall', '무너진 성벽이 그대로예요 — 수리하지 않으면 뚫린 채로 싸워요', 'warn'],
    S.pop > MG.popCap() && ['home-off', `집 없는 주민 ${S.pop - MG.popCap()}명 — 민가를 수리하지 않으면 매달 1/4씩 떠나요`, 'warn'],
  ].filter(Boolean);
  return `<header>
    <div class="crest">${MG.ic('crown')}</div>
    <div class="titleBox"><h1>${S.lord.name}의 변경 기지</h1>
      <div class="muted small">${MG.ic(I.season[season])} ${MG.monthName()} · ${S.lord.gen}대${S.origin ? ` · ${MG.ORIGINS[S.origin].name}` : ''}${S.domain && S.domain !== 'none' ? ` · ${MG.DOMAINS[S.domain].name}` : ''}${S.siege ? ` · 포위 ${S.siege}단계` : ''}${S.difficulty && S.difficulty !== 'normal' ? ` · ${MG.ic('flame')} ${MG.DIFFICULTY[S.difficulty].name}` : ''}
      ${effectTags()}</div></div>
    <div class="eraChip" title="지금 시대 · ${MG.FACTIONS[S.era.main].desc}">${MG.ic(I.faction[S.era.main])} ${MG.factionText(S.era.main, S.era.mix)}</div>
    <div class="headRight">
      <div class="ap" title="행동력 ${S.ap} / ${MG.apMax()}">${Array.from({ length: MG.apMax() }, (_, i) => MG.ic('bolt', i < S.ap ? 'on' : 'off')).join('')}</div>
      <button class="iconBtn" id="chronBtn" title="연대기">${MG.ic('book')}</button>
      <button class="iconBtn" id="saveMenuBtn" title="저장·불러오기">${MG.ic('device-floppy')}</button></div>
  </header>
  <div class="resBar">${chips}
    <div class="chip" title="주민 / 집 한도 (민가 1단계당 ${MG.HOUSE_POP}명)">${MG.icRes('pop')}<b>${S.pop}</b><i class="muted">/${MG.popCap()}</i></div>
    <div class="chip" title="병력 (장수 부대·직할·부상병 포함)">${MG.ic('shield')}<b>${eco.soldiers}</b></div>
  </div>
  <div class="attackBar ${attackNow || marchNow ? 'now' : ''}">
    <div class="atkIcon">${MG.ic(marchNow ? 'flag-3' : 'swords')}</div>
    <div class="atkText"><b>${marchNow ? `정벌군 도착 · ${MG.OUTPOSTS[S.march.id].name}` : `습격 ${fc.text}`}</b>
      <span class="muted small">전투 ${S.level}${S.level % 5 === 0 ? ' · 대습격' : ''}</span>${intel}
      ${A.scout < 2 && !marchNow ? `<span class="muted small" title="행동의 정찰로 더 알 수 있어요"> ${MG.ic('eye')} ${A.scout ? '구성 모름' : '세력·방향 모름'}</span>` : ''}</div>
    <div class="btns">${marchNow
      ? `<button class="main danger" id="conquestBtn">${MG.ic('flag-3')} 정벌 전투</button>`
      : attackNow
      ? `<button class="main danger" id="goBtn">${MG.ic('swords')} 전투 준비</button>`
      : `<button id="skipBtn" title="다음 습격까지 넘기기">${MG.ic('player-skip-forward')}</button><button class="main" id="endBtn">${MG.ic('player-track-next')} 한 달 마치기</button>`}</div>
  </div>
  ${warns.map(([ic, t, c]) => `<div class="warnLine ${c}">${MG.ic(ic)} ${t}</div>`).join('')}
  ${S.report && S.report.length ? `<details class="report small" open><summary>${MG.ic('news')} 지난달 소식 ${S.report.length}</summary>${S.report.map(r => `<div>${r}</div>`).join('')}</details>` : ''}`;
}

// 연대기 사건이 남긴 지속 효과 표시
function effectTags() {
  const names = { migration: '마물 대이동(습격 +30%, 전리품 2배)', harshWinter: '혹한(겨울 식량 소비 1.5배)', marriage: '혼인(출생 확률 2배)', lowtax: '세금 감면(-30%)' };
  const icons = { migration: 'paw', harshWinter: 'snowflake', marriage: 'heart', lowtax: 'coins' };
  const endless = MG.S.ended ? ` <span class="effTag" title="검은 성채를 무너뜨린 뒤 해마다 습격이 커져요">${MG.ic('infinity')} 습격 +${Math.round((MG.endlessMul() - 1) * 100)}%</span>` : '';
  return endless + (MG.S.effects || []).filter(e => e.until > MG.S.month)
    .map(e => ` <span class="effTag" title="${names[e.type] || e.type} · ${MG.monthLabel(e.until)}까지">${MG.ic(icons[e.type] || 'clock')} ${e.until - MG.S.month}개월</span>`).join('');
}

// ---------- 성 안 지도 ----------
function mapBlock() {
  const S = MG.S, n = MG.GRID.n;
  let cells = '';
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (MG.buildingAtCell(i, j)) continue;
    const reserved = MG.reservedCell(i, j), keep = i >= 5 && i <= 8 && j >= 5 && j <= 8;
    if (keep) continue;
    const on = sel && sel.i === i && sel.j === j;
    cells += `<div class="cell ${reserved ? 'road' : 'free'} ${on ? 'on' : ''}" style="left:${i * CELL_PX}px;top:${j * CELL_PX}px"
      ${reserved ? '' : `data-cell="${i},${j}"`}></div>`;
  }
  const blds = S.buildings.map(b => {
    const d = MG.BUILDINGS[b.type], on = sel && sel.b === b;
    // 건물 칸: 아이콘(큰 건물은 이름도), 단계는 별, 이름·설명은 말풍선
    return `<div class="bld ${b.hp <= 0 ? 'ruin' : ''} ${on ? 'on' : ''} ${d.w > 1 ? 'big' : ''}" data-bld="${b.id}" title="${d.name} ${b.level}단계 · ${d.desc(b.level)}${b.hp <= 0 ? ' · 부서짐' : ''}"
      style="left:${b.i * CELL_PX}px;top:${b.j * CELL_PX}px;width:${d.w * CELL_PX}px;height:${d.h * CELL_PX}px;background:${b.hp <= 0 ? '#4a4038' : d.color}">
      ${MG.ic(b.hp <= 0 ? 'barrier-block' : MG.ICONS.building[b.type])}${d.w > 1 ? `<span>${d.name}</span>` : ''}${b.level > 1 ? `<sup>${'★'.repeat(b.level - 1)}</sup>` : ''}
      ${b.hp > 0 && b.hp < b.max ? `<em style="width:${pct(b.hp, b.max)}%"></em>` : ''}</div>`;
  }).join('');
  const keep = `<div class="keepCell" style="left:${5 * CELL_PX}px;top:${5 * CELL_PX}px;width:${4 * CELL_PX}px;height:${4 * CELL_PX}px" title="본성 ${Math.round(S.keep)} / ${MG.KEEP_HP}">
    ${MG.ic('building-castle')}<small>${Math.round(S.keep)}</small><em style="width:${pct(S.keep, MG.KEEP_HP)}%"></em></div>`;
  const gates = ['북', '동', '남', '서'].map((g, k) => {
    const pos = [[6.5, -0.9], [n - 0.1, 6.5], [6.5, n - 0.1], [-0.9, 6.5]][k];
    return `<div class="gateTag" style="left:${pos[0] * CELL_PX}px;top:${pos[1] * CELL_PX}px">${g}문</div>`;
  }).join('');
  return `<section class="card castle"><h3>${MG.ic('building-castle')} 성 안 <span class="muted">빈 칸: 건설 · 건물: 정보·강화</span></h3>
    <div class="mapWrap"><div class="map" style="width:${n * CELL_PX}px;height:${n * CELL_PX}px">${cells}${keep}${blds}${gates}</div></div>
    ${selBlock()}</section>`;
}

function selBlock() {
  const S = MG.S;
  if (!sel) return '<div class="selPanel muted small">밝은 칸에 건물을 지을 수 있어요. 길(어두운 칸)과 본성 자리는 비워 둬요.</div>';
  if (sel.b) {
    const b = sel.b, d = MG.BUILDINGS[b.type], maxed = b.level >= d.max, cost = MG.upgradeCost(b);
    return `<div class="selPanel"><b>${d.name} ${b.level}단계</b> <span class="muted small">체력 ${Math.round(b.hp)} / ${b.max}</span>
      <div class="small">${d.desc(b.level)}</div>
      ${b.hp <= 0 ? '<div class="danger small">부서져서 기능을 잃었어요. 아래 "이 건물 수리"로 고쳐요.</div>' : ''}
      ${b.hp < b.max ? repairBtn(`b:${b.id}`, '이 건물 수리') : ''}
      <button class="mini ${demolishArmed === 'b' + b.id ? 'danger' : ''}" data-demolish="${b.id}" title="행동력 없이 헐고, 들인 자원의 절반(${MG.costText(MG.demolishRefund(d.cost, b.level))})을 돌려받아요">
        ${MG.ic('trash')} ${demolishArmed === 'b' + b.id ? '정말 헐까요? 한 번 더' : `철거 · ${MG.costText(MG.demolishRefund(d.cost, b.level))} 환불`}</button>
      ${maxed ? '<div class="muted small">최고 단계예요</div>' : `<button data-upgrade="${b.id}" ${S.ap && MG.canPay(cost) && b.hp > 0 ? '' : 'disabled'}>
        ${b.level + 1}단계로 강화 · ${MG.costText(cost)} · 행동력 1</button><div class="muted small">다음: ${d.desc(b.level + 1)}</div>`}</div>`;
  }
  const opts = Object.entries(MG.BUILDINGS).map(([k, d]) => {
    const fit = MG.canPlace(k, sel.i, sel.j), ok = fit && S.ap && MG.canPay(MG.costOf(d.cost, 1));
    return `<button class="buildOpt" data-build="${k}" ${ok ? '' : 'disabled'}>
      <b>${MG.ic(MG.ICONS.building[k])} ${d.name}</b> <span class="muted">${d.w}×${d.h}</span><span>${d.desc(1)}</span>
      <span class="${MG.canPay(MG.costOf(d.cost, 1)) ? 'muted' : 'danger'}">${MG.costText(MG.costOf(d.cost, 1))}${fit ? '' : ' · 자리 부족'}</span></button>`;
  }).join('');
  return `<div class="selPanel"><b>여기에 짓기</b> <span class="muted small">(${sel.i}, ${sel.j}칸을 왼쪽 위로) · 행동력 1</span>
    <div class="buildList">${opts}</div></div>`;
}

// ---------- 행동 ----------
function recruitNote() {
  if (!MG.recruitCap()) return '병영이 필요해요 (부서졌으면 수리)';
  if (MG.S.pop <= MG.MIN_POP && !MG.perk('mercenary')) return '주민이 너무 적어요';
  const n = MG.recruitAmount();
  if (!n) return `골드가 모자라요 (1명당 ${Math.ceil(MG.recruitGold())})`;
  return `주민 ${n}명 → 훈련병 · ${MG.costText(MG.recruitCost())} (훈련은 군대 탭 훈련소)`;
}

function actionsBlock() {
  const S = MG.S, ap = S.ap > 0;
  const rows = [
    { id: 'repair', name: '수리', note: MG.repairNeed() ? `피해 ${Math.round(MG.damageList().reduce((a, d) => a + d.max - d.hp, 0))} 중 ${MG.repairNeed()} 복구 · ${MG.costText(MG.repairCost())}` : '고칠 곳이 없어요',
      ok: MG.repairNeed() && MG.canPay(MG.repairCost()) },
    { id: 'recruit', name: '모집', note: recruitNote(), ok: MG.recruitAmount() > 0 },
    { id: 'train', name: '훈련', note: MG.bLevel('training') ? `건강한 장수 모두 경험치 +${30 * MG.bLevel('training')}` : '훈련장이 필요해요', ok: MG.bLevel('training') },
    { id: 'scout', name: '정찰', note: S.nextAttack.scout >= 2 ? '다 알아냈어요' : `${S.nextAttack.scout ? '적 구성' : '날짜와 방향'}을 알아내요 · 골드 20`,
      ok: S.nextAttack.scout < 2 && S.res.gold >= 20 },
    { id: 'craft', name: '제작', note: MG.bLevel('smithy') ? `무기 1개 · ${MG.costText(MG.CRAFT_COST)}` : '대장간이 필요해요',
      ok: MG.bLevel('smithy') && MG.canPay(MG.CRAFT_COST) },
  ];
  const promote = MG.canPromote()
    ? `<div class="actRow"><span class="small"><b>${MG.ic('chevrons-up')} 발탁</b> <span class="muted">직할 병사를 장수로 · ${MG.costText(MG.PROMOTE_COST)}</span></span>
        <span>${['infantry', 'archer'].map(t => `<button class="mini" data-promote="${t}" ${ap && S.garrison[t] > 0 && MG.canPay(MG.PROMOTE_COST) ? '' : 'disabled'}>${MG.icUnit(t)} ${MG.UNIT_TYPES[t].name}</button>`).join(' ')}</span></div>`
    : '<div class="actRow"><span class="small muted">발탁: 훈련장 2단계가 있으면 직할 병사를 장수로 키울 수 있어요</span></div>';
  return `<section class="card"><h3>${MG.ic('bolt')} 행동 <span class="muted">행동력 1씩</span></h3>
    ${rows.map(r => `<div class="actRow"><button class="actBtn" data-act="${r.id}" ${ap && r.ok ? '' : 'disabled'}>${MG.ic(MG.ICONS.act[r.id])} ${r.name}</button><span class="small muted">${r.note}</span></div>`).join('')}
    ${S.keep < MG.KEEP_HP ? `<div class="actRow"><span class="small">${MG.ic('building-castle')} <b>본성</b> <span class="muted">${Math.round(S.keep)} / ${MG.KEEP_HP}</span></span>${repairBtn('keep', '본성 수리')}</div>` : ''}
    ${promote}
    ${msg ? `<div class="msg small">${msg}</div>` : ''}</section>`;
}

// 골라서 수리하는 버튼: spec = 'keep' · 'side:N' · 'b:건물id' (행동력 1, 한 번에 2000까지)
function repairBtn(spec, label, small) {
  const S = MG.S, need = MG.repairNeed(spec), cost = MG.repairCost(spec);
  return `<button class="mini" data-repair="${spec}" ${S.ap && need && MG.canPay(cost) ? '' : 'disabled'}
    title="${need}만큼 고쳐요 · ${MG.costText(cost)} · 행동력 1">${MG.ic('hammer')}${small ? '' : ` ${label} · ${MG.costText(cost)}`}</button>`;
}

// 성벽·성문 강화와 부가 시설 (면별, 행동력 1)
function fortBlock() {
  const S = MG.S, F = S.fort, ap = S.ap > 0;
  const btn = (kind, side, label, tip) => {
    const cost = MG.fortCost(kind, side);
    if (!cost) return `<span class="ok small" title="${tip}">${MG.ic('check')} ${label}</span>`;
    return `<button class="mini" data-fort="${kind},${side || ''}" ${ap && MG.canPay(cost) ? '' : 'disabled'} title="${tip} · ${MG.costText(cost)} · 행동력 1">${label}</button>`;
  };
  const lvl = (L, i) => `${'★'.repeat(i)}${'☆'.repeat(L.length - 1 - i)}`;
  const rows = MG.SIDES.map(s => {
    const wn = MG.WALL_LEVELS[F.wall[s] + 1], gn = MG.GATE_LEVELS[F.gate[s] + 1];
    return `<tr><td><b>${MG.SIDE_NAME[s]}</b></td>
      <td title="${MG.WALL_LEVELS[F.wall[s]].name}">${MG.ic('wall')} ${lvl(MG.WALL_LEVELS, F.wall[s])} ${wn ? btn('wall', s, MG.ic('arrow-up'), `${wn.name}: 체력 ×${wn.mul}${wn.desc ? ' · ' + wn.desc : ''}`) : ''}</td>
      <td title="${MG.GATE_LEVELS[F.gate[s]].name}">${MG.ic('door')} ${lvl(MG.GATE_LEVELS, F.gate[s])} ${gn ? btn('gate', s, MG.ic('arrow-up'), `${gn.name}: 체력 ×${gn.mul}${gn.desc ? ' · ' + gn.desc : ''}`) : ''}</td>
      <td>${btn('moat', s, MG.ic('ripple'), `해자 · ${MG.FORT_EXTRAS.moat.desc}`)}</td>
      <td>${btn('oil', s, MG.ic('flame'), `기름 구멍 · ${MG.FORT_EXTRAS.oil.desc}`)}</td>
      <td>${MG.repairNeed('side:' + s) ? repairBtn('side:' + s, '', true) : ''}</td></tr>`;
  }).join('');
  return `<section class="card"><h3>${MG.ic('wall')} 성벽과 성문 <span class="muted">면마다 강화 · 행동력 1</span></h3>
    <table class="fortTable"><tr class="muted small"><td></td><td>성벽</td><td>성문</td><td>해자</td><td>기름</td><td>수리</td></tr>${rows}</table>
    <div class="actRow"><span class="small">${MG.ic('building-lighthouse')} ${MG.CORNER_TOWERS.name} <span class="muted">${MG.CORNER_TOWERS.desc}</span></span>
      ${btn('towers', null, F.towers ? '있음' : MG.costText(MG.CORNER_TOWERS.cost), MG.CORNER_TOWERS.desc)}</div>
    <div class="muted small">버튼에 마우스를 올리면 효과와 비용이 보여요. 석벽 ×1.4 → 강화 석벽 ×1.8(성벽 위 궁수 사거리 +10%), 철 성문 ×1.6 → 쇠창살 ×2.2(성문 앞 적 이동 -30%)</div></section>`;
}

// 전투 소모품: 보유 수와 사기 (시장이 있어야)
function itemShop() {
  const S = MG.S, market = MG.bLevel('market') > 0;
  const rows = Object.entries(MG.ITEMS).map(([k, I]) => `<div class="tradeRow" title="${I.desc}${I.defense ? ' (방어전에서만)' : ''}">
    <span><b>${MG.ic(MG.ICONS.item[k])} ${I.name}</b> <span class="count">×${S.items[k] || 0}</span></span>
    <span class="small muted">${I.desc}${I.defense ? ' (방어전)' : ''}</span>
    ${market ? `<button class="mini" data-buyitem="${k}" ${S.res.gold >= I.price && (S.items[k] || 0) < MG.ITEM_MAX ? '' : 'disabled'}>${MG.icRes('gold')} ${I.price}</button>` : ''}</div>`).join('');
  return `<h3 style="margin-top:10px">${MG.ic('gift')} 전투 소모품 <span class="muted">전투마다 ${MG.itemCarry()}종까지</span></h3>${rows}`;
}

function fieldsBlock() {
  const S = MG.S, ap = S.ap > 0;
  const list = S.fields.map((f, idx) => {
    const d = MG.FIELDS[f.type], cost = MG.fieldUpgradeCost(f), prod = Object.entries(d.prod).map(([k, v]) => `${MG.icRes(k)}${v * f.level}`).join('');
    return `<div class="actRow"><span><b>${MG.ic(MG.ICONS.field[f.type])} ${d.name}</b> ${'★'.repeat(f.level)} <span class="muted small">${prod}/월</span></span>
      <span class="fbtns">${f.level >= d.max ? '<span class="muted small">최고</span>' : `<button class="mini" data-fup="${idx}" ${ap && MG.canPay(cost) ? '' : 'disabled'}>강화 · ${MG.costText(cost)}</button>`}
      <button class="mini ${demolishArmed === 'f' + idx ? 'danger' : ''}" data-fdel="${idx}" title="철거: 행동력 없이, ${MG.costText(MG.demolishRefund(d.cost, f.level))} 돌려받아요${d.hidden ? ' · 다시 지을 수 없어요' : ''}">
        ${MG.ic('trash')}${demolishArmed === 'f' + idx ? ' 한 번 더' : ''}</button></span></div>`;
  }).join('');
  const add = S.fields.length < MG.FIELD_SLOTS ? Object.entries(MG.FIELDS).filter(([, d]) => !d.hidden).map(([k, d]) =>
    `<button class="mini" data-field="${k}" ${ap && MG.canPay(MG.costOf(d.cost, 1)) ? '' : 'disabled'} title="${MG.costText(MG.costOf(d.cost, 1))}">${MG.ic('plus')} ${MG.ic(MG.ICONS.field[k])} ${d.name}</button>`).join(' ') : '<span class="muted small">빈자리 없음</span>';
  return `<section class="card"><h3>${MG.ic('plant-2')} 성 밖 들판 ${S.fields.length} / ${MG.FIELD_SLOTS} <span class="muted">적이 부수지 않아요</span></h3>
    ${list}<div class="fieldAdd">${add}</div>
    <div class="muted small">가을엔 식량 2배, 겨울엔 식량 0·목재 절반</div></section>`;
}

function marketBlock() {
  const S = MG.S;
  MG.ensureMarket();
  const l = MG.bLevel('market');
  if (!l) return `<section class="card"><h3>${MG.ic('building-store')} 시장</h3><div class="muted small">시장을 지으면 식량·목재·철을 골드로 사고팔고, 전투 소모품도 살 수 있어요. 시세는 매달 바뀌어요.</div>${itemShop()}</section>`;
  const arrow = r => {
    const d = S.prices[r] - S.prevPrices[r];
    return Math.abs(d) < 0.01 ? `<span class="muted">${MG.ic('minus')}</span>` : d > 0 ? `<span class="danger">${MG.ic('trending-up')}</span>` : `<span class="ok">${MG.ic('trending-down')}</span>`;
  };
  const rows = Object.keys(MG.MARKET.base).map(r => `<div class="tradeRow">
    <span><b>${MG.icRes(r)} ${MG.RES[r]}</b> ${arrow(r)}</span>
    <span class="small">${MG.ic('shopping-cart')} ${MG.buyPrice(r).toFixed(2)} · ${MG.ic('cash')} ${MG.sellPrice(r).toFixed(2)}</span>
    <span class="tbtns">${[50, 10].map(q => `<button class="mini buy" data-trade="${r},${q}" title="${q}개 사기">+${q}</button>`).join('')}
      ${[10, 50].map(q => `<button class="mini sell" data-trade="${r},${-q}" title="${q}개 팔기">-${q}</button>`).join('')}</span></div>`).join('');
  return `<section class="card"><h3>${MG.ic('building-store')} 시장 거래 <span class="muted">행동력 안 씀 · 남은 거래 ${MG.tradeLeft()}개</span></h3>
    ${rows}<div class="muted small">1개당 골드 (${MG.ic('shopping-cart')} 살 때 · ${MG.ic('cash')} 팔 때). 화살표는 지난달보다 오름·내림. 식량은 가을에 싸고 겨울·봄에 비싸요.</div>
    ${itemShop()}</section>`;
}

// ---------- 장수 ----------
function classBlock(g) {
  const C = MG.CLASSES[g.type];
  if (MG.canClass(g)) {
    return `<div class="choose"><div class="hint">Lv.5 전직을 고르세요</div>
      ${['A', 'B'].map(k => `<button data-cls="${g.id},${k}"><b>${C[k].name}</b><span>${C[k].desc}</span><span class="muted">스킬 강화: ${MG.SKILLS[g.type][k]}</span></button>`).join('')}</div>`;
  }
  if (MG.canAdvance(g)) {
    const n = C[g.cls].lv10;
    return `<div class="choose"><div class="hint">Lv.10 승급 가능</div>
      <button data-adv="${g.id}"><b>${n.name}(으)로 승급</b><span>${n.desc}</span></button></div>`;
  }
  const c = MG.genClass(g);
  if (c) return `<div class="clsDesc">${c.desc}</div>`;
  return `<div class="clsDesc muted">Lv.5에 전직할 수 있어요</div>`;
}

// 편제: 같은 병종 예비군을 이 장수 부대로
function assignRow(g) {
  if (g.away) return '';
  const room = MG.genCap(g) - g.healthy, have = MG.S.reserve[g.type] || 0, n = MG.assignable(g);
  if (room <= 0) return '';
  return `<div class="actRow"><span class="small">${MG.ic('users-plus')} 예비군에서 편제 <span class="muted">${MG.icUnit(g.type)} 예비군 ${have} · 빈자리 ${room}</span></span>
    <span>${n ? `<button class="mini" data-assign="${g.id},10">+${Math.min(10, n)}</button>
      <button class="mini" data-assign="${g.id},999">가득 +${n}</button>` : '<span class="muted small">군대 탭 훈련소에서 훈련시켜요</span>'}</span></div>`;
}

// 훈련소: 훈련병 → 병종별 훈련 → 예비군. 보병·궁수 예비군은 성벽 위 직할과 오갈 수 있다
function trainingBlock() {
  const S = MG.S, cap = MG.trainCap(), now = MG.trainingNow();
  const rows = Object.keys(MG.TRAINING).map(t => {
    const T = MG.TRAINING[t], months = MG.trainMonths(t), ok = MG.canRefill(t), n = MG.trainable(t);
    const per = MG.costText(MG.trainCost(t, 1)) || '추가 비용 없음';
    const going = S.training.filter(x => x.type === t).map(x => `${x.n}명 ${x.left}개월`).join(', ');
    const btn = (k, label) => `<button class="mini" data-train="${t},${k}" ${ok && n ? '' : 'disabled'} title="1명당 ${per} · ${months ? months + '개월' : '바로'}">${label}</button>`;
    return `<tr class="${ok ? '' : 'muted'}"><td>${MG.icUnit(t)} ${MG.UNIT_TYPES[t].name}</td>
      <td class="small">${months ? `${months}개월` : '바로'} · ${per}${ok ? '' : ` · <span class="warn">${MG.BUILDINGS[MG.REFILL_BUILDING[t]].name} 필요</span>`}</td>
      <td class="small">${going ? `${MG.ic('hourglass')} ${going}` : ''}</td>
      <td><b>${S.reserve[t] || 0}</b>${S.reserve[t] ? ` ${MG.vetBadge(S.reserveVet[t])}` : ''}</td><td>${btn(10, '+10')} ${btn(999, `전부${n ? ` ${n}` : ''}`)}</td></tr>`;
  }).join('');
  const gar = ['infantry', 'archer'].map(t => `<div class="actRow"><span class="small">${MG.icUnit(t)} ${MG.UNIT_TYPES[t].name} · 직할 ${S.garrison[t]} · 예비군 ${S.reserve[t] || 0}</span>
    <span><button class="mini" data-gmove="${t},10,toGarrison" ${S.reserve[t] ? '' : 'disabled'} title="예비군 → 성벽 위 직할">${MG.ic('arrow-up')} 성벽으로 10</button>
      <button class="mini" data-gmove="${t},10,toReserve" ${S.garrison[t] ? '' : 'disabled'} title="성벽 위 직할 → 예비군">${MG.ic('arrow-down')} 예비군으로 10</button></span></div>`).join('');
  return `<section class="card wideCard"><h3>${MG.ic('tent')} 훈련소 <span class="muted">훈련병 <b>${S.recruits || 0}</b>명 · 훈련 중 ${now} / ${cap}명 (병영 단계 × ${MG.TRAIN_PER_BARRACKS})${MG.bLevel('training') ? ' · 훈련장: 기간 -1개월' : ''}</span></h3>
    <table class="trainTable"><tr class="muted small"><td>병종</td><td>훈련</td><td>훈련 중</td><td>예비군</td><td></td></tr>${rows}</table>
    <div class="small muted">행동의 모집으로 뽑은 주민이 훈련병이 돼요(1명당 골드 ${Math.ceil(MG.recruitGold())}). 훈련을 마친 예비군을 장수 카드에서 같은 병종 부대에 편제해요. 훈련병·예비군도 급여와 식량이 나가요 (기병은 식량 2배).</div>
    <h3 style="margin-top:8px">${MG.ic('wall')} 성벽 위 직할 ↔ 예비군</h3>${gar}
    <label class="tog"><input type="checkbox" id="mobReserve" ${S.mobilizeReserve ? 'checked' : ''}><span>예비군 동원 <span class="muted small">습격이 오면 예비군이 병종별로 지휘관 없는 부대가 되어 싸워요 (공격력 -20%, 쓰러지면 부상 판정)</span></span></label></section>`;
}

function skillLine(g) {
  const K = MG.SKILLS[g.type];
  return `<div class="small">스킬 <b>${K.name}</b> <span class="muted">${K.desc}${g.cls ? ` · 강화: ${K[g.cls]}` : ''} · 쿨 ${K.cd}초</span></div>`;
}

function weaponBlock(g) {
  const S = MG.S, usable = S.inventory.filter(w => w.type === g.type);
  const cur = g.weapon
    ? `${gradeTag(g.weapon)} <button class="mini" data-unequip="${g.id}">해제</button><div class="muted small">${MG.weaponDesc(g.weapon)}</div>`
    : '<span class="muted">무기 없음</span>';
  const pickList = usable.length
    ? `<select data-equip="${g.id}"><option value="">보유 무기로 바꾸기 (${usable.length})</option>
        ${usable.map(w => `<option value="${w.id}">[${MG.WEAPON_GRADES[w.grade].name}] ${w.name} — ${MG.weaponDesc(w)}</option>`).join('')}</select>`
    : '';
  return `<div class="weapon">${cur}${pickList}</div>`;
}

function genCard(g) {
  const cap = MG.genCap(g), need = g.level < MG.MAX_LEVEL ? MG.xpToNext(g.level) : 0;
  const refill = !MG.canRefill(g.type)
    ? `<div class="warn small">${MG.BUILDINGS[MG.REFILL_BUILDING[g.type]].name}이 있어야 병사를 보충할 수 있어요</div>` : '';
  const role = { engineer: '전투 중 근처 성벽·건물·본성을 수리해요. 성에 있으면 수리 목재 -40%', artillery: '사거리가 아주 길지만 가까운 적은 못 쏴요',
    cavalry: '움직인 뒤 첫 타격이 몇 배. 성벽 위에는 못 올라가요' }[g.type];
  if (g.dead) {
    return `<div class="gen dead"><div class="gtop"><span class="unitBadge">${MG.ic('skull')}</span><b>${g.name}</b><span class="danger small">세상을 떠남</span></div>
      <div class="muted small">${MG.genTitle(g)} · Lv.${g.level} · 남은 병사 ${g.healthy}명은 지휘관 없이 출전해요.</div></div>`;
  }
  // 상태는 아이콘 하나로 (원정·정벌 / 부상 / 건강), 자세한 건 말풍선
  const status = g.away ? `<span class="warn" title="${g.away.type === 'march' ? '정벌' : '원정'} 중 · ${g.away.months}개월 뒤 귀환">${MG.ic(g.away.type === 'march' ? 'flag-3' : 'map-2')}${g.away.months}</span>`
    : g.injured ? `<span class="warn" title="부상 · ${g.injured}개월 남음">${MG.ic('bandage')}${g.injured}</span>` : `<span class="ok" title="건강">${MG.ic('heart')}</span>`;
  const old = MG.ageMul(g.age) < 1 ? ` <span class="warn" title="노쇠: 능력 -${Math.round((1 - MG.ageMul(g.age)) * 100)}%">${MG.ic('hourglass')}</span>` : '';
  const K = MG.SKILLS[g.type], open = openGen.has(g.id), alert = MG.canClass(g) || MG.canAdvance(g);
  const flags = [
    g.weapon && `<span title="${g.weapon.name} · ${MG.weaponDesc(g.weapon)}" style="color:${MG.WEAPON_GRADES[g.weapon.grade].color}">${MG.ic('sword')}</span>`,
    `<span title="스킬 ${K.name}: ${K.desc}${g.cls ? ` · 강화: ${K[g.cls]}` : ''}">${MG.ic(MG.ICONS.skill[g.type])}</span>`,
    g.wounded.length && `<span class="warn" title="부상병 ${g.wounded.length}명 (${woundCounts(g.wounded)})">${MG.ic('first-aid-kit')}${g.wounded.length}</span>`,
    !g.deploy && !g.away && `<span class="muted" title="출전하지 않아요">${MG.ic('eye-off')}</span>`,
    !g.away && MG.assignable(g) > 0 && `<span class="ok" title="빈자리가 있어요. 펼쳐서 직할 병사를 편제할 수 있어요">${MG.ic('users-plus')}</span>`,
    !MG.canRefill(g.type) && `<span class="warn" title="${MG.BUILDINGS[MG.REFILL_BUILDING[g.type]].name}이 있어야 보충돼요">${MG.ic('alert-triangle')}</span>`,
  ].filter(Boolean).join('');
  return `<div class="gen ${g.injured ? 'hurt' : ''} ${open ? 'open' : ''}">
    <div class="gtop" data-gopen="${g.id}" title="눌러서 ${open ? '접기' : '자세히'}">
      <span class="unitBadge u-${g.type}">${MG.icUnit(g.type)}</span>
      <div class="gname"><b>${g.name}${g.blood ? ` <span class="blood" title="가문 (후계 후보)">${MG.ic('crown')}</span>` : ''}</b>
        <span class="muted small">${MG.genTitle(g)} · Lv.${g.level}${old}</span></div>
      ${alert ? `<span class="tag ok" title="전직·승급할 수 있어요">${MG.ic('chevrons-up')}</span>` : ''}${status}
      <span class="muted">${MG.ic(open ? 'chevron-up' : 'chevron-down')}</span></div>
    <div class="bar thin" title="경험치 ${Math.floor(g.xp)} / ${need || '최고'}"><div style="width:${need ? pct(g.xp, need) : 100}%;background:#6aa8ff"></div></div>
    <div class="gline small"><span title="병사 / 정원 (통솔 ${MG.genLead(g)})">${MG.ic('users')} ${g.healthy}/${cap}</span>${MG.vetBadge(g.vet)}${flags}</div>
    ${traitTags(g.traits)}
    ${open ? `<div class="gdetail">
    <div class="muted small">통솔 ${MG.genLead(g)} · ${g.age}세</div>
    ${role ? `<div class="muted small">${role}</div>` : ''}${skillLine(g)}${refill}${classBlock(g)}${weaponBlock(g)}
    ${assignRow(g)}
    ${g.away ? `<div class="warn small">${g.away.type === 'march' ? '정벌' : '원정'} 중이라 습격이 와도 성을 지킬 수 없어요.</div>` : `<label class="tog"><input type="checkbox" data-deploy="${g.id}" ${g.deploy ? 'checked' : ''}>
      ${g.injured ? '<span class="warn">부상 중에도 출전 (체력 절반, 쓰러지면 전사)</span>' : '장수 출전'}</label>`}
    ${g.wounded.length ? `<label class="tog"><input type="checkbox" data-mob="${g.id}" ${g.mobilize ? 'checked' : ''}>
      <span class="warn">부상병 ${g.wounded.length}명 동원 (체력 감소, 또 쓰러지면 사망 위험 큼)</span></label>` : ''}
    <div class="genBtns">
      ${g.age >= 45 ? `<button class="mini" data-retire="${g.id}">${MG.ic('school')} 은퇴 (교관, 훈련 경험치 +${MG.RETIRED_TRAIN_XP})</button>` : ''}
      ${MG.canDismiss(g) ? `<button class="mini ${dismissArmed === g.id ? 'danger' : ''}" data-dismiss="${g.id}">${MG.ic('door-exit')} ${dismissArmed === g.id ? '정말 해고? 한 번 더' : '해고'}</button>` : ''}
    </div></div>` : (alert ? classBlock(g) : '')}
  </div>`;
}

const traitTags = traits => `<div class="traits">${(traits || []).map(t => {
  const d = MG.TRAITS[t];
  return `<span class="trait ${d.bad ? 'bad' : ''}" title="${d.desc}">${d.name}</span>`;
}).join('')}</div>`;

// ---------- 가문·주점 ----------
// 성주 레벨·경험치와 능력치 (분배할 점수가 있으면 + 버튼)
function lordStatsBlock(L) {
  const need = L.level < MG.MAX_LEVEL ? MG.xpToNext(L.level) : 0, aura = MG.lordAura(L.stats);
  const eff = { might: `공격·체력 ×${MG.lordMight(L.stats).toFixed(1)}`, lead: `근위대 ${MG.lordGuards(L.stats)}명`,
    cmd: `오라 ${Math.round(aura.r)} · +${Math.round(aura.bonus * 100)}%`, admin: `세금 ×${MG.adminMul(L.stats).toFixed(2)}` };
  return `<div class="lv"><span>Lv.${L.level}</span><div class="bar"><div style="width:${pct(L.xp || 0, need)}%;background:#e6b450"></div></div>
      <span class="small muted">${need ? `${Math.floor(L.xp || 0)} / ${need}` : '최고 레벨'}</span></div>
    <table class="lordStats">${Object.entries(MG.LORD_STATS).map(([k, D]) => `<tr title="${D.desc}"><td>${MG.ic(MG.ICONS.stat[k])} ${D.name}</td><td><b>${L.stats[k]}</b></td>
      <td class="muted small">${eff[k]}</td><td>${L.points ? `<button class="mini" data-lstat="${k}">+</button>` : ''}</td></tr>`).join('')}</table>
    ${L.points ? `<div class="warn small">분배할 능력치 ${L.points}점이 있어요</div>`
      : '<div class="muted small">전투에서 근위대가 적을 쓰러뜨리고 살아남으면 경험치를 얻어요. 레벨마다 능력치 1점은 자동, 1점은 직접 분배.</div>'}`;
}

function familyBlock() {
  const S = MG.S, L = S.lord;
  const kids = S.family.map(c => `<li>${c.name} · ${c.age}세 ${traitTags(c.traits)}</li>`).join('');
  const blood = S.generals.filter(g => g.blood && !g.dead).map(g => `<li>${g.name} · ${g.age}세 · 장수</li>`).join('');
  return `<section class="card"><h3>${MG.ic('crown')} 가문 · ${L.gen}대 성주</h3>
    <div><b>${L.name}</b> · ${L.age}세${L.minor ? ' <span class="warn">(어린 성주: 전투 불참)</span>' : ''}${L.injured ? ` <span class="warn" title="쓰러져서 다쳤어요. 매달 나아요">${MG.ic('bandage')} 부상 ${L.injured}개월</span>` : ''}</div>
    ${traitTags(L.traits)}
    ${lordStatsBlock(L)}
    ${L.injured ? `<label class="tog"><input type="checkbox" id="lordDeploy" ${L.deployInjured ? 'checked' : ''}><span class="warn">부상 중에도 출전 (체력 절반, 또 쓰러지면 전사)</span></label>` : ''}
    ${MG.ageMul(L.age) < 1 ? `<div class="warn small">나이가 들어 능력이 ${Math.round((1 - MG.ageMul(L.age)) * 100)}% 떨어졌어요.</div>` : ''}
    ${MG.deathChance(L.age) ? `<div class="danger small">해마다 ${Math.round(MG.deathChance(L.age) * 100)}% 확률로 세상을 떠날 수 있어요.</div>` : ''}
    <ul class="small">${blood}${kids || (blood ? '' : '<li class="muted">아직 자녀가 없어요</li>')}</ul>
    <div class="muted small">성주가 20~45세일 때 해마다 ${Math.round(MG.BIRTH_CHANCE * 100)}% 확률로 아이가 태어나고, ${MG.ADULT_AGE}세에 장수가 돼요.
      성주가 세상을 떠나면 혈족 중에서 후계자를 골라요. 혈족이 없으면 가문이 끊겨요.</div></section>`;
}

function tavernBlock() {
  const S = MG.S, l = MG.bLevel('tavern');
  if (!l) return `<section class="card"><h3>${MG.ic('beer')} 주점</h3><div class="muted small">주점을 지으면 떠돌이 장수가 찾아와요. 골드로 고용할 수 있어요.</div></section>`;
  const list = S.tavern.map((t, i) => {
    const g = t.g, cost = MG.hireCost(g.level);
    return `<div class="hireRow"><div><b>${g.name}</b> <span class="muted small">${MG.UNIT_TYPES[g.type].name} · Lv.${g.level} · ${g.age}세 · ${t.left}개월 뒤 떠남</span>
      ${traitTags(g.traits)}</div><button class="mini" data-hire="${i}" ${S.res.gold >= cost ? '' : 'disabled'}>고용 · 골드 ${cost}</button></div>`;
  }).join('');
  return `<section class="card"><h3>${MG.ic('beer')} 주점 (최대 ${l + 1}명)</h3>${list || '<div class="muted small">지금은 찾아온 장수가 없어요. 매달 찾아올 수 있어요.</div>'}
    <div class="muted small">고용한 장수의 부대는 빈 채로 시작해요. 모집으로 채워요.</div></section>`;
}

// ---------- 정벌 ----------
// 거점 3곳(순서 자유)과 검은 성채. 장수 부대를 2개 이상 골라 출정한다.
function conquestBlock() {
  const S = MG.S, M = S.march, ready = S.generals.filter(MG.canExpedition);
  for (const id of [...marchPick]) if (!ready.some(g => g.id === id)) marchPick.delete(id);
  const rows = Object.entries(MG.OUTPOSTS).map(([id, O]) => {
    const info = MG.conquestInfo(id), done = MG.hasOutpost(id), boss = MG.ENEMY_TYPES[O.boss];
    const head = `<b>${MG.ic(O.final ? 'building-fortress' : 'tent')} ${O.name}</b> <span class="warn">${'★'.repeat(O.stars)}</span>
      <span class="muted small">${MG.BIOME_NAME[O.biome]} · 성을 ${O.months}개월 비움${info.fails ? ` · 실패 ${info.fails}번 (수비 +${Math.round(info.fails * MG.CONQUEST_FAIL_MUL * 100)}%)` : ''}</span>`;
    if (done) return `<div class="siteRow"><div>${head}<div class="ok small">${O.final ? '함락함' : '정벌함'} · ${O.reward}</div></div></div>`;
    if (O.final && !MG.citadelOpen()) return `<div class="siteRow"><div><b>${O.name}</b> <span class="warn">${'★'.repeat(O.stars)}</span>
      <div class="muted small">거점 3곳을 모두 정벌하면 열려요. 이곳을 무너뜨리면 엔딩이에요.</div></div></div>`;
    const intel = info.scout
      ? `<div class="small">${MG.ic('skull')} ${boss.name}: ${O.bossDesc}</div>
        <div class="muted small">${O.garrison.map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${Math.round(n * MG.conquestMul(id))}`).join(', ')} · 망루 ${O.towers} · 본진 체력 ${Math.round(O.hq * MG.conquestMul(id))}</div>`
      : `<div class="muted small">${MG.ic('skull')} ${boss.name} · ${MG.ic('eye-off')} 수비 규모는 정찰해야 알 수 있어요</div>`;
    const go = M ? '' : `<div class="siteGo">
      ${info.scout ? '' : `<button class="mini" data-cscout="${id}" ${S.ap && MG.canPay(MG.CONQUEST_SCOUT) ? '' : 'disabled'}>정찰 · ${MG.costText(MG.CONQUEST_SCOUT)} · 행동력 1</button>`}
      <button class="mini" data-march="${id}" ${S.ap >= MG.MARCH_AP && S.res.food >= MG.MARCH_FOOD && marchPick.size >= MG.MARCH_MIN ? '' : 'disabled'}>
        출정 · 식량 ${MG.MARCH_FOOD} · 행동력 ${MG.MARCH_AP}</button></div>`;
    return `<div class="siteRow"><div>${head}<div class="small">얻는 것: ${O.reward}</div>${intel}</div>${go}</div>`;
  }).join('');
  let pickArea = '';
  if (M) {
    const names = M.gids.map(id => (S.generals.find(g => g.id === id) || {}).name).filter(Boolean).join(', ');
    pickArea = `<div class="warn small">정벌군이 ${MG.OUTPOSTS[M.id].name}에 나가 있어요 (${names}${M.lord ? ', 성주 친정' : ''}) ·
      ${M.fought ? `${M.left}개월 뒤 귀환` : S.pendingConquest ? '도착했어요. 정벌 전투를 치러요' : '다음 달 도착'}</div>`;
  } else {
    pickArea = `<div class="small"><b>정벌군 고르기</b> <span class="muted">(장수 부대 ${MG.MARCH_MIN}개 이상, 건강하고 병사가 있는 장수만)</span>
        ${ready.length ? `<button class="mini" data-mall="1">${MG.ic(marchPick.size === ready.length ? 'square' : 'checks')} ${marchPick.size === ready.length ? '전체 해제' : '전체 선택'}</button>` : ''}</div>
      <div class="marchPick">${ready.map(g => `<label class="tog"><input type="checkbox" data-mpick="${g.id}" ${marchPick.has(g.id) ? 'checked' : ''}>
        ${MG.icUnit(g.type)} ${g.name} <span class="muted small">${MG.genTitle(g)} Lv.${g.level} · 병사 ${g.healthy}</span></label>`).join('') || '<span class="muted small">보낼 수 있는 장수가 없어요</span>'}
      ${S.lord.minor ? '' : `<label class="tog"><input type="checkbox" id="marchLord" ${marchLord ? 'checked' : ''}>
        <span>성주 친정 <span class="muted small">(근위대 ${MG.lordGuards(S.lord.stats)}명과 함께 · 성주 주변 아군 공격력 +${Math.round(MG.lordAura(S.lord.stats).bonus * 100)}% · 전사하면 후계 승계)</span></span></label>`}</div>`;
  }
  return `<section class="card"><h3>${MG.ic('flag-3')} 정벌 <span class="muted">(정벌한 거점 ${(S.outposts || []).filter(id => !MG.OUTPOSTS[id].final).length} / 3${S.ended ? ' · 검은 성채 함락' : ''})</span></h3>
    ${pickArea}${rows}
    <div class="muted small">출정하면 다음 달 도착해 싸우고, 이기든 지든 남은 달 동안 돌아와요. 그동안 남은 병력으로 성을 지켜야 해요.
      정벌에 성공하면 그 세력이 보복하러 크게 쳐들어와요.</div></section>`;
}

// ---------- 원정·본국 ----------
function expeditionBlock() {
  const S = MG.S, ready = S.generals.filter(MG.canExpedition), away = S.generals.filter(g => g.away);
  const fc = MG.attackForecast(), left = S.nextAttack.month - S.month;
  const sites = (S.sites || []).map(site => {
    const d = MG.SITES[site.type];
    const opts = ready.map(g => `<option value="${g.id}">${g.name} (${MG.UNIT_TYPES[g.type].name} · 병사 ${g.healthy} · 성공 ${Math.round(MG.expeditionChance(g, site) * 100)}%)</option>`).join('');
    const risky = site.months >= left;
    return `<div class="siteRow"><div><b>${MG.ic(MG.ICONS.site[site.type])} ${d.name}</b> <span class="muted small">${MG.ic('swords')} ${site.diff} · ${MG.ic('clock')} ${site.months}개월</span>
      <div class="small">${d.desc}</div>${risky ? `<div class="warn small">다음 습격(${fc.text}) 전에 못 돌아올 수 있어요</div>` : ''}</div>
      ${ready.length ? `<div class="siteGo"><select data-site-gen="${site.id}">${opts}</select>
        <button class="mini" data-site="${site.id}" ${S.ap >= MG.EXPEDITION_AP ? '' : 'disabled'}>보내기 · 행동력 ${MG.EXPEDITION_AP}</button></div>` : ''}</div>`;
  }).join('');
  const awayList = away.filter(g => g.away.type !== 'march').map(g => `<li>${g.name} 부대 → ${MG.SITES[g.away.type].name} (${g.away.months}개월 뒤, 성공 ${Math.round(g.away.chance * 100)}%)</li>`).join('');
  return `<section class="card"><h3>${MG.ic('map-2')} 원정 <span class="muted">(계절마다 원정지가 바뀌어요)</span></h3>
    ${sites || '<div class="muted small">이번 계절 원정지를 모두 썼어요.</div>'}
    ${!ready.length ? '<div class="muted small">보낼 수 있는 부대가 없어요 (건강하고 병사가 있는 장수만).</div>' : ''}
    ${awayList ? `<ul class="small">${awayList}</ul>` : ''}
    <div class="muted small">전력 = 병사 수 + 장수 레벨×8 (전직·무기·특성 반영). 원정 간 부대는 돌아올 때까지 성을 못 지켜요.</div></section>`;
}

function crownBlock() {
  const S = MG.S, c = S.crown;
  const sup = S.support ? `<div class="ok small">지원이 오는 중이에요 (${S.support.months}개월 뒤)</div>` : '';
  return `<section class="card"><h3>${MG.ic('flag')} 본국과의 관계 ${c} / 100</h3>
    <div class="bar"><div style="width:${c}%;background:${c >= 70 ? '#6bdc8f' : c >= 40 ? '#e6b450' : '#ff6b6b'}"></div></div>
    ${sup}
    <div class="actRow"><button data-act="support" ${S.ap && !S.support && c >= MG.SUPPORT_MIN ? '' : 'disabled'}>지원 요청</button>
      <span class="small muted">관계 -${MG.SUPPORT_COST} · 2~4개월 뒤 ${MG.supportKind()}${c < MG.SUPPORT_MIN ? ' (관계가 너무 나빠요)' : ''}</span></div>
    <div class="muted small">습격을 막으면 +${MG.CROWN_WIN}, 왕실의 부탁을 들어주면 +10, 거절하면 -5. 관계가 좋을수록 지원이 좋고 계승 선물이 커요. 해임은 없어요.</div></section>`;
}

function eventModal() {
  const v = MG.eventView();
  return `<div class="overlay"><div class="panel"><h1>${MG.ic('bell-ringing')} ${v.title}</h1><p>${v.text}</p>
    <div class="row">${v.choices.map((c, i) => `<button class="main ${i ? 'alt' : ''}" data-event="${i}" ${c.ok ? '' : 'disabled'}>${c.label}</button>`).join('')}</div></div></div>`;
}

// 성주가 세상을 떠나면 다른 것을 하기 전에 후계자를 고른다
function successionModal() {
  const S = MG.S, heirs = MG.heirs();
  return `<div class="overlay"><div class="panel"><h1>${MG.ic('crown')} 후계자를 고르세요</h1>
    <p class="muted">${S.lord.name}이(가) 세상을 떠났어요. 혈족 중에서 다음 성주를 골라요.</p>
    ${heirs.map(h => `<button class="heirBtn" data-heir="${h.kind},${h.id}">
      <b>${h.name}</b> · ${h.age}세${h.kind === 'general' ? ` · 장수 Lv.${h.level} (부대 병사는 직할로)` : h.age < MG.ADULT_AGE ? ' · 어린 자녀 (성년까지 전투 불참)' : ''}
      ${traitTags(h.traits)}</button>`).join('')}</div></div>`;
}

// 3택1 보상 카드 (습격을 막으면)
function pickModal() {
  const S = MG.S, P = S.pendingPick, cost = MG.rerollCost(S.level);
  return `<div class="overlay"><div class="panel wide"><div class="muted small">${P.big ? '대습격 승리 보상' : '승리 보상'}</div><h1>${MG.ic('gift')} 보상을 하나 고르세요</h1>
    <div class="cards">${P.cards.map((c, i) => { const info = MG.cardInfo(c);
      return `<button class="rcard" data-card="${i}" style="border-color:${info.color}"><span class="cardIcon" style="color:${info.color}">${MG.ic(MG.ICONS.card[c.kind])}</span><span class="muted small">${MG.CARD_KINDS[c.kind]}</span>
        <b style="color:${info.color}">${info.title}</b><span class="small">${info.desc}</span></button>`; }).join('')}</div>
    <div class="row">${P.rerolled ? '<span class="muted small">이미 다시 뽑았어요</span>'
      : `<button id="rerollBtn" ${S.res.gold >= cost ? '' : 'disabled'}>다시 뽑기 (한 번) · 골드 ${cost}</button>`}</div>
    ${msg ? `<div class="msg small">${msg}</div>` : ''}</div></div>`;
}

// 가진 유물
// ---------- 명성 특성 트리 ----------
// 준비 창에 보이는 요약: 칸 수, 끼운 특성, 결단
function perkSummary() {
  const owned = MG.meta().perks, slots = MG.perkSlots();
  const on = MG.activePerks(setup.perkSlots, setup.keystone), list = on.map(id => perkTag(id)).join(' ');
  return `<h3>${MG.ic('hierarchy-3')} 명성 특성 <span class="small muted">칸 ${setup.perkSlots.length} / ${slots} · 결단 ${setup.keystone ? 1 : 0} / 1 · 가진 특성 ${owned.length}</span></h3>
    <div class="perkLine">${list || '<span class="muted small">아직 켠 특성이 없어요</span>'}</div>
    <div class="row"><button class="mini" id="perkTreeBtn">${MG.ic('hierarchy-3')} 특성 트리 열기</button></div>`;
}
const perkTag = id => { const P = MG.PERKS[id]; return `<span class="tag ${P.t === 4 ? 'key' : ''}" title="${P.desc}${P.cons ? ' · 제약: ' + P.cons : ''}">${MG.ic(MG.PERK_BRANCHES[P.b].icon)} ${P.name}</span>`; };
// 특성 트리: 5갈래 × 4단. 사기(명성) / 칸에 끼우기 / 결단 고르기
function perkPanel() {
  const m = MG.meta(), slots = MG.perkSlots(), spent = m.perks.reduce((a, id) => a + MG.PERK_COST[MG.PERKS[id].t], 0);
  const cols = Object.entries(MG.PERK_BRANCHES).map(([b, Br]) => {
    const tiers = [1, 2, 3, 4].map(t => {
      const cells = Object.entries(MG.PERKS).filter(([, P]) => P.b === b && P.t === t).map(([id, P]) => {
        const own = MG.perkOwned(id), can = MG.perkUnlockable(id), cost = MG.PERK_COST[t];
        const on = t === 1 ? own : t === 4 ? setup.keystone === id : setup.perkSlots.includes(id);
        let act;
        if (!own) act = `<button class="mini" data-pbuy="${id}" ${can && m.renown >= cost ? '' : 'disabled'}>${can ? `${MG.ic('lock-open')} ${cost}` : MG.ic('lock')}</button>`;
        else if (t === 1) act = `<span class="ok small">${MG.ic('check')} 항상</span>`;
        else act = `<button class="mini ${on ? 'onBtn' : ''}" data-pon="${id}">${on ? '켜짐' : t === 4 ? '고르기' : '끼우기'}</button>`;
        return `<div class="perk ${own ? 'own' : can ? 'can' : 'lock'} ${on ? 'on' : ''} ${t === 4 ? 'keystone' : ''}">
          <b>${t === 4 ? MG.ic('star') + ' ' : ''}${P.name}</b><span class="small">${P.desc}</span>${P.cons ? `<span class="small danger">제약: ${P.cons}</span>` : ''}
          <div class="pact">${act}</div></div>`;
      }).join('');
      return `<div class="ptier"><span class="muted small">${t === 4 ? '결단' : t + '단'} · ${MG.PERK_COST[t]}</span>${cells}</div>`;
    }).join('');
    return `<div class="pcol"><h3>${MG.ic(Br.icon)} ${Br.name}</h3>${tiers}</div>`;
  }).join('');
  return `<div class="overlay"><div class="panel perkPanel"><h1>${MG.ic('hierarchy-3')} 명성 특성 트리</h1>
    <p class="small">모아 둔 명성 <b class="warn">${m.renown}</b> · 칸 <b>${setup.perkSlots.length} / ${slots}</b> (모은 명성 ${MG.PERK_SLOTS.per}마다 +1, 최대 ${MG.PERK_SLOTS.max}) · 결단 <b>${setup.keystone ? 1 : 0} / 1</b>
      <span class="muted">— 1단은 사면 항상 켜지고, 2·3단은 칸에 끼운 것만, 결단은 하나만 켜져요. 아래 단을 하나 사야 다음 단이 열려요.</span></p>
    <div class="ptree">${cols}</div>
    ${msg ? `<div class="msg small">${msg}</div>` : ''}
    <div class="row"><button class="main" id="perkCloseBtn">닫기</button>
      <button class="${perkResetArmed ? 'danger' : ''}" id="perkResetBtn" ${m.perks.length ? '' : 'disabled'}>${MG.ic('refresh')} ${perkResetArmed ? '정말 모두 돌려받을까요? 한 번 더' : `초기화 (명성 ${spent} 돌려받기)`}</button></div></div></div>`;
}
function bindPerks() {
  if (!perkOpen) return;
  const q = s => el.querySelectorAll(s);
  q('[data-pbuy]').forEach(b => b.onclick = () => { msg = MG.buyPerk(b.dataset.pbuy); render(); });
  q('[data-pon]').forEach(b => b.onclick = () => {
    const id = b.dataset.pon, P = MG.PERKS[id];
    if (P.t === 4) setup.keystone = setup.keystone === id ? null : id;
    else if (setup.perkSlots.includes(id)) setup.perkSlots = setup.perkSlots.filter(x => x !== id);
    else if (setup.perkSlots.length < MG.perkSlots()) setup.perkSlots = [...setup.perkSlots, id];
    else msg = '칸이 다 찼어요. 다른 특성을 빼고 끼워요';
    render();
  });
  $('perkCloseBtn').onclick = () => { perkOpen = false; perkResetArmed = false; msg = ''; render(); };
  $('perkResetBtn').onclick = () => {
    if (!perkResetArmed) { perkResetArmed = true; render(); return; }
    perkResetArmed = false; setup.perkSlots = []; setup.keystone = null; msg = MG.resetPerks(); render();
  };
}
// 가문 탭: 이번 판에 켜진 특성
function activePerksBlock() {
  const on = MG.S.perks || [];
  return `<section class="card"><h3>${MG.ic('hierarchy-3')} 명성 특성 ${on.length}</h3>
    <div class="perkLine">${on.map(perkTag).join(' ') || '<span class="muted small">새 캠페인 준비 창의 특성 트리에서 배우고 끼워요</span>'}</div></section>`;
}

function relicBlock() {
  const list = (MG.S.relics || []).map(id => { const R = MG.RELICS[id], g = MG.RELIC_GRADES[R.grade];
    return `<li><b style="color:${g.color}">${R.name}</b> <span class="muted">${R.desc}</span></li>`; }).join('');
  return `<section class="card"><h3>${MG.ic('diamond')} 유물 ${(MG.S.relics || []).length} / ${Object.keys(MG.RELICS).length}</h3>
    <ul class="small inv">${list || '<li class="muted">습격 보상 카드, 보스, 고대 유적에서 얻어요</li>'}</ul></section>`;
}

// 성주 계보 표
function lineageTable() {
  const S = MG.S;
  return `<table class="lineage"><tr><th>대</th><th>성주</th><th>다스린 때</th><th>끝</th></tr>
    ${S.lineage.map(l => `<tr><td>${l.gen}</td><td>${l.name}</td><td>${MG.monthLabel(l.from)} ~ ${l.to != null ? MG.monthLabel(l.to) : '지금'}</td>
      <td>${l.cause || (l.to == null ? '다스리는 중' : '')}</td></tr>`).join('')}</table>`;
}

// 엔딩: 검은 성채를 무너뜨린 뒤 한 번 뜬다. 계속 다스리거나 여기서 마친다.
function endingPanel() {
  const S = MG.S, r = MG.renownOf(S), lords = S.lineage.length;
  const big = (S.chronicle || []).filter(c => c.kind === 'battle' && /정벌했어요|함락했어요/.test(c.text))
    .map(c => `<li><span class="muted">${MG.monthLabel(c.month)}</span> ${c.text}</li>`).join('');
  return `<div class="overlay"><div class="panel wide ending"><div class="muted small">엔딩</div>
    <h1>${MG.ic('building-castle')} 변경에 평화가 찾아왔어요</h1>
    <p>${S.lord.name}이(가) 검은 성채를 무너뜨리고 고대 드래곤을 물리쳤어요. 변경백 가문은 ${lords}대, ${MG.year()}년에 걸쳐 왕국의 전진 기지를 지켰어요.
      치른 전투 ${S.stats.battles}(습격 승리 ${S.stats.wins}), 처치한 적 ${S.stats.kills}, 잃은 장수 ${S.stats.generalsLost}.</p>
    <h3>정벌의 기록</h3><ul class="chronList">${big}</ul>
    <h3>${MG.ic('crown')} 성주 계보</h3>${lineageTable()}
    <h3>지금 마치면 받는 명성 <b class="warn">+${r.total}</b> <span class="small muted">(엔딩 +${MG.ENDING_RENOWN} 포함)</span></h3>
    <p class="small muted">계속 다스리면 캠페인이 이어져요. 습격은 해마다 ${Math.round(MG.ENDLESS_STEP * 100)}%씩 더 거세지고, 끝날 때 그때까지의 명성(엔딩 보너스 포함)을 받아요.</p>
    <div class="row"><button class="main" id="continueBtn">계속 다스리기</button><button class="main alt" id="finishBtn">여기서 이야기를 마치기</button></div></div></div>`;
}

function overPanel() {
  const S = MG.S, r = S.renown || MG.renownOf(S), m = MG.meta();
  const title = S.overReason === '평정' ? '변경백 가문의 이야기가 끝났어요' : S.overReason === '가문 단절' ? '가문이 끊겼어요' : '변경 기지가 무너졌어요';
  return `<div class="overlay"><div class="panel wide"><h1>${MG.ic('flag-off')} ${title}</h1>
    <p>${S.lord.gen}대에 걸쳐 ${MG.year()}년 동안 변경을 지켰어요. 치른 전투 ${S.stats.battles}(승리 ${S.stats.wins}), 처치한 적 ${S.stats.kills}.</p>
    <h3>${MG.ic('crown')} 성주 계보</h3>${lineageTable()}
    <h3>얻은 명성 <b class="warn">+${r.total}</b></h3>
    <div class="small muted">버틴 햇수 ${r.parts.years} · 승리 ${r.parts.wins} · 거점 ${r.parts.outposts} · 이어진 대 ${r.parts.gens}${r.parts.ending ? ` · 엔딩 ${r.parts.ending}` : ''}${S.siege ? ` · 포위 ${S.siege}단계 ×${MG.siegeRenownMul(S.siege)}` : ''}</div>
    <p>모아 둔 명성: <b class="warn">${m.renown}</b> — 새 캠페인을 준비할 때 해금에 써요.</p>
    <div class="row"><button class="main" id="newCampBtn">새 캠페인 준비</button><button class="main alt" id="chronBtn2">연대기 보기</button><button class="main alt" id="saveMenuBtn2">저장 불러오기</button></div></div></div>`;
}

// 연대기 창: 계보와 기록 (최근 것이 위)
function chronPanel() {
  const S = MG.S, icon = { lord: MG.ic('crown'), battle: MG.ic('swords'), general: MG.ic('shield'), event: MG.ic('script'), etc: MG.ic('point') };
  const list = (S.chronicle || []).slice().reverse().map(c => `<li><span class="muted">${MG.monthLabel(c.month)}</span> ${icon[c.kind] || '·'} ${c.text}</li>`).join('');
  return `<div class="overlay"><div class="panel wide"><h1>${MG.ic('book')} 연대기</h1>
    <h3>${MG.ic('crown')} 성주 계보</h3>${lineageTable()}
    <h3>${MG.ic('list')} 기록</h3><ul class="chronList">${list || '<li class="muted">아직 기록이 없어요</li>'}</ul>
    <div class="row"><button class="main" id="chronCloseBtn">닫기</button></div></div></div>`;
}

function chronicleModal() {
  const v = MG.chronicleView();
  return `<div class="overlay"><div class="panel"><div class="muted small">연대기 사건</div><h1>${MG.ic('script')} ${v.title}</h1><p>${v.text}</p>
    <div class="row">${v.choices.map((c, i) => `<button class="main ${i ? 'alt' : ''}" data-chron="${i}" ${c.ok ? '' : 'disabled'}>${c.label}</button>`).join('')}</div></div></div>`;
}

// 새 캠페인 준비: 명성으로 해금하고, 영지 특성·시작 보너스·포위 단계를 고른다
function setupPanel() {
  const m = MG.meta(), u = m.unlocked;
  const domain = Object.entries(MG.DOMAINS).map(([k, d]) => {
    const have = u.domain.includes(k), on = setup.domain === k;
    return `<div class="pick ${on ? 'on' : ''}"><div><b>${d.name}</b> <span class="small muted">${d.desc}</span></div>
      ${have ? `<button class="mini" data-setdomain="${k}">${on ? '선택됨' : '고르기'}</button>`
        : `<button class="mini" data-buy="domain,${k}" ${m.renown >= d.cost ? '' : 'disabled'}>해금 · 명성 ${d.cost}</button>`}</div>`;
  }).join('');
  const bonus = Object.entries(MG.BONUSES).map(([k, d]) => {
    const have = u.bonus.includes(k), on = setup.bonuses.includes(k);
    return `<div class="pick ${on ? 'on' : ''}"><div><b>${d.name}</b> <span class="small muted">${d.desc}</span></div>
      ${have ? `<button class="mini" data-setbonus="${k}">${on ? '켜짐' : '꺼짐'}</button>`
        : `<button class="mini" data-buy="bonus,${k}" ${m.renown >= d.cost ? '' : 'disabled'}>해금 · 명성 ${d.cost}</button>`}</div>`;
  }).join('');
  const sieges = [];
  for (let l = 0; l <= MG.SIEGE_MAX; l++) {
    const have = l <= u.siege, on = setup.siege === l;
    sieges.push(have ? `<button class="mini ${on ? 'onBtn' : ''}" data-setsiege="${l}">${l ? `${l}단계` : '없음'}</button>` : '');
  }
  const nextSiege = u.siege < MG.SIEGE_MAX ? `<button class="mini" data-buy="siege,next" ${m.renown >= MG.siegeCost(u.siege + 1) ? '' : 'disabled'}>${u.siege + 1}단계 해금 · 명성 ${MG.siegeCost(u.siege + 1)}</button>` : '';
  const hist = m.history.slice(0, 5).map(h => `<li>${h.lord} (${h.gens}대) · ${h.years}년 · 승리 ${h.wins}${h.siege ? ` · 포위 ${h.siege}` : ''} · ${h.reason} · 명성 +${h.renown}</li>`).join('');
  return `<div class="overlay"><div class="panel wide"><h1>${MG.ic('flag-3')} 새 캠페인 준비</h1>
    <p>모아 둔 명성: <b class="warn">${m.renown}</b> <span class="small muted">— 한 번 해금하면 다음 캠페인부터 계속 고를 수 있어요.</span></p>
    <h3>${MG.ic('crown')} 가문 내력 <span class="small muted">(이번에 나온 셋 중 하나)</span></h3>${(setup.originOffer || []).map(k => `<div class="pick ${setup.origin === k ? 'on' : ''}">
      <div><b>${MG.ORIGINS[k].name}</b> <span class="small muted">${MG.ORIGINS[k].desc}</span></div>
      <button class="mini" data-setorigin="${k}">${setup.origin === k ? '선택됨' : '고르기'}</button></div>`).join('')}
    <h3>${MG.ic('diamond')} 시작 유물 <span class="small muted">(일반 유물 셋 중 하나)</span></h3>${(setup.relicOffer || []).map(k => `<div class="pick ${setup.relic === k ? 'on' : ''}">
      <div><b>${MG.RELICS[k].name}</b> <span class="small muted">${MG.RELICS[k].desc}</span></div>
      <button class="mini" data-setrelic="${k}">${setup.relic === k ? '선택됨' : '고르기'}</button></div>`).join('')}
    ${perkSummary()}
    <h3>${MG.ic('flame')} 난이도 <span class="small muted">${MG.DIFFICULTY[setup.difficulty].desc} · 얻는 명성 ×${MG.DIFFICULTY[setup.difficulty].renown}</span></h3>
    <div class="row">${Object.entries(MG.DIFFICULTY).map(([k, D]) => `<button class="mini ${setup.difficulty === k ? 'onBtn' : ''}" data-setdiff="${k}" title="${D.desc} · 명성 ×${D.renown}">${D.name}</button>`).join('')}</div>
    <h3>${MG.ic('map-2')} 영지 특성 (하나)</h3>${domain}
    <h3>${MG.ic('gift')} 시작 보너스 <span class="small muted">해금한 것은 켜고 끌 수 있어요</span></h3>${bonus}
    <h3>${MG.ic('swords')} 포위 단계 <span class="small muted">단계마다 적 수·체력 +15%, 얻는 명성 +25%</span></h3>
    <div class="row">${sieges.join('')}${nextSiege}</div>
    ${hist ? `<h3>지난 캠페인</h3><ul class="small">${hist}</ul>` : ''}
    ${msg ? `<div class="msg small">${msg}</div>` : ''}
    <div class="row"><button class="main" id="startCampBtn">이 조건으로 시작</button>${MG.S && !MG.S.over ? '<button class="main alt" id="setupCloseBtn">닫기 (지금 캠페인 계속)</button>' : ''}</div></div></div>`;
}

// 저장 슬롯 창: 덮어쓰기·불러오기·지우기는 두 번 눌러 확인
function savePanel() {
  const S = MG.S, fmt = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const btn = (act, i, label, armedLabel, disabled) => {
    const k = `${act}:${i}`, on = slotArmed === k;
    return `<button class="mini ${on ? 'danger' : ''}" data-slot="${k}" ${disabled ? 'disabled' : ''}>${on ? armedLabel : label}</button>`;
  };
  const rows = [];
  for (let i = 1; i <= MG.SLOTS; i++) {
    const info = MG.slotInfo(i);
    rows.push(`<div class="slotRow"><div><b>슬롯 ${i}</b>
      ${info ? `<div class="small">${info.lord} (${info.gen}대) · ${info.year}년차 ${info.month}월 · 전투 ${info.battles}회</div>
        <div class="muted small">${fmt(info.savedAt)} 저장</div>` : '<div class="muted small">비어 있어요</div>'}</div>
      <div class="slotBtns">
        ${btn('save', i, '저장', info ? '덮어쓸까요? 한 번 더' : '저장', S.over)}
        ${btn('load', i, '불러오기', '지금 진행을 버리고 불러올까요? 한 번 더', !info)}
        ${info ? btn('del', i, '지우기', '정말 지울까요? 한 번 더') : ''}
      </div></div>`);
  }
  return `<div class="overlay"><div class="panel"><h1>${MG.ic('device-floppy')} 저장 · 불러오기</h1>
    <p class="muted small">지금 진행은 내정 화면에서 행동할 때마다 자동으로 저장되고, 다시 켜면 이어져요. 슬롯은 따로 보관하는 저장이에요.
      불러오면 지금 진행(자동 저장)이 그 슬롯 내용으로 바뀌어요.</p>
    ${MG.isDesktop ? `<p class="small">저장 위치: <b>${MG.saveDir()}</b> <button class="mini" id="openDirBtn">폴더 열기</button></p>`
      : '<p class="warn small">브라우저에서 실행 중이라 저장이 이 브라우저 안에만 있어요. 오래 남길 진행은 파일로 내보내 두세요.</p>'}
    ${rows.join('')}
    <div class="row">
      <button id="exportBtn" ${S.over ? 'disabled' : ''}>파일로 내보내기</button>
      <button id="importBtn">파일에서 불러오기</button>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
    </div>
    ${msg ? `<div class="msg small">${msg}</div>` : ''}
    <div class="row"><button class="main" id="saveCloseBtn">닫기</button></div></div></div>`;
}

function hospitalBlock() {
  const S = MG.S, list = MG.patients(), cap = MG.hospitalCap(), over = Math.max(0, list.length - cap);
  const lines = [];
  for (const g of S.generals) if (!g.dead && g.injured) lines.push(`<li>장수 ${g.name} — ${g.injured}개월 남음</li>`);
  for (const g of S.generals) if (!g.dead && g.wounded.length) lines.push(`<li>${g.name} 부대 ${g.wounded.length}명 (${woundCounts(g.wounded)})</li>`);
  if (S.garrison.wounded.length) lines.push(`<li>직할 병력 ${S.garrison.wounded.length}명 (${woundCounts(S.garrison.wounded)})</li>`);
  return `<h3>${MG.ic('first-aid-kit')} 병원 ${list.length} / ${cap}</h3>
    <div class="bar"><div style="width:${pct(list.length, cap || 1)}%;background:${over ? '#ff6b6b' : '#6bdc8f'}"></div></div>
    ${!cap ? '<div class="danger small">병원이 없거나 부서져서 아무도 회복하지 못해요.</div>' : over ? `<div class="danger small">수용 인원을 넘은 ${over}명은 회복이 멈춰 있어요.</div>` : ''}
    <ul class="small">${lines.join('') || '<li class="muted">비어 있어요</li>'}</ul>`;
}

function render() {
  const S = MG.S;
  const inv = S.inventory.slice().sort((a, b) => Object.keys(MG.WEAPON_GRADES).indexOf(b.grade) - Object.keys(MG.WEAPON_GRADES).indexOf(a.grade));
  const I = MG.ICONS.tab;
  // 탭에 알림 점: 군대(전직 가능·부상), 원정·정벌(정벌군 도착), 가문(분배할 능력치)
  const dot = { army: S.generals.some(g => MG.canClass(g) || MG.canAdvance(g)), war: !!S.pendingConquest, family: !!S.lord.points };
  const tabs = [['castle', '성'], ['army', '군대'], ['war', '원정·정벌'], ['market', '시장'], ['family', '가문']]
    .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${MG.ic(I[k])} ${n}${dot[k] ? '<span class="dot"></span>' : ''}</button>`).join('');
  const garrison = `<section class="card"><h3>${MG.ic('users-group')} 성주 직할 병력 <span class="muted">성벽 위</span></h3>
        <div class="stat"><span>${MG.ic('military-rank')} 숙련도</span><b>${MG.vetBadge(S.garrison.vet)} ${MG.VET_RANKS[MG.vetRank(S.garrison.vet)].name}</b></div>
        <div class="stat"><span>${MG.icUnit('archer')} 궁수</span><b>${S.garrison.archer}</b></div>
        <div class="stat"><span>${MG.icUnit('infantry')} 보병</span><b>${S.garrison.infantry}</b></div>
        <div class="muted small">훈련소에서 보병·궁수 예비군을 성벽으로 올리거나 내려요. 상한 없이 식량으로만 제한돼요.</div></section>`;
  const weapons = `<section class="card"><h3>${MG.ic('sword')} 보유 무기 ${inv.length}</h3>
        <ul class="small inv">${inv.map(w => `<li>${gradeTag(w)} <span class="muted">${MG.icUnit(w.type)} ${MG.weaponDesc(w)}</span></li>`).join('')
          || '<li class="muted">전투에서 이기거나 대장간에서 만들어요</li>'}</ul></section>`;
  const records = `<section class="card"><h3>${MG.ic('chart-bar')} 기록</h3>
        <div class="stat"><span>${MG.ic('swords')} 치른 전투</span><b>${S.stats.battles}</b></div>
        <div class="stat"><span>${MG.ic('skull')} 처치한 적</span><b>${S.stats.kills}</b></div>
        <div class="stat"><span>${MG.ic('grave-2')} 잃은 장수 / 병사</span><b>${S.stats.generalsLost} / ${S.stats.soldiersLost}</b></div>
        <button id="resetBtn" class="${resetArmed ? 'danger' : ''}">${MG.ic('refresh')} ${resetArmed ? '정말 처음부터? 한 번 더 누르세요' : '캠페인 처음부터'}</button></section>`;
  const body = {
    castle: `<div class="campMain">${mapBlock()}<div class="campSide">${actionsBlock()}${fortBlock()}${fieldsBlock()}</div></div>`,
    army: `${trainingBlock()}<section class="gens">${S.generals.map(genCard).join('')}</section>
      <div class="campRow">${garrison}<section class="card">${hospitalBlock()}</section>${tavernBlock()}${weapons}</div>`,
    war: `<div class="campRow two">${conquestBlock()}${expeditionBlock()}</div>`,
    market: `<div class="campRow two">${marketBlock()}${crownBlock()}</div>`,
    family: `<div class="campRow">${familyBlock()}${relicBlock()}${activePerksBlock()}${records}</div>`,
  }[tab];
  el.innerHTML = `<div class="campWrap">
    ${headerBlock()}
    <nav class="tabs">${tabs}</nav>
    ${tab !== 'castle' && msg ? `<div class="msg small">${msg}</div>` : ''}
    ${body}
  </div>
  ${perkOpen ? perkPanel() : setupOpen ? setupPanel() : saveOpen ? savePanel() : chronOpen ? chronPanel() : S.over ? overPanel()
    : S.pendingSuccession ? successionModal() : S.pendingPick ? pickModal() : S.endingPending ? endingPanel() : S.cevent ? chronicleModal() : S.event ? eventModal() : ''}`;
  bind();
}

// 행동 결과(실패 이유 또는 알림)를 보여주고 다시 그린다
const run = why => { msg = why || ''; render(); };

function bind() {
  const S = MG.S, gen = id => S.generals.find(g => g.id === +id), q = s => el.querySelectorAll(s);
  q('[data-cell]').forEach(c => c.onclick = () => { const [i, j] = c.dataset.cell.split(',').map(Number); sel = { i, j }; msg = ''; render(); });
  q('[data-bld]').forEach(c => c.onclick = () => { sel = { b: S.buildings.find(b => b.id === +c.dataset.bld) }; msg = ''; render(); });
  q('[data-build]').forEach(b => b.onclick = () => { const why = MG.actBuild(b.dataset.build, sel.i, sel.j); if (!why) sel = null; run(why); });
  q('[data-upgrade]').forEach(b => b.onclick = () => run(MG.actUpgrade(sel.b)));
  // 철거는 두 번 눌러 확인
  q('[data-demolish]').forEach(b => b.onclick = () => {
    const k = 'b' + b.dataset.demolish;
    if (demolishArmed !== k) { demolishArmed = k; render(); return; }
    demolishArmed = null; const why = MG.demolish(sel.b); sel = null; run(why);
  });
  q('[data-fdel]').forEach(b => b.onclick = () => {
    const k = 'f' + b.dataset.fdel;
    if (demolishArmed !== k) { demolishArmed = k; render(); return; }
    demolishArmed = null; run(MG.demolishField(+b.dataset.fdel));
  });
  q('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    run(a === 'repair' ? MG.actRepair() : a === 'recruit' ? MG.actRecruit() : a === 'train' ? MG.actTrain() : a === 'scout' ? MG.actScout()
      : a === 'support' ? MG.actSupport() : MG.actCraft());
  });
  q('[data-field]').forEach(b => b.onclick = () => run(MG.actField(b.dataset.field)));
  q('[data-trade]').forEach(b => b.onclick = () => { const [r, n] = b.dataset.trade.split(','); run(MG.trade(r, +n)); });
  q('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; msg = ''; render(); });
  q('[data-gopen]').forEach(b => b.onclick = () => { const id = +b.dataset.gopen; openGen.has(id) ? openGen.delete(id) : openGen.add(id); render(); });
  if ($('lordDeploy')) $('lordDeploy').onchange = ev => { S.lord.deployInjured = ev.target.checked; MG.saveCampaign(); render(); };
  q('[data-lstat]').forEach(b => b.onclick = () => { MG.lordSpend(b.dataset.lstat); render(); });
  q('[data-repair]').forEach(b => b.onclick = () => run(MG.actRepair(b.dataset.repair)));
  q('[data-assign]').forEach(b => b.onclick = () => { const [id, n] = b.dataset.assign.split(',').map(Number); run(MG.assignReserve(id, n)); });
  q('[data-train]').forEach(b => b.onclick = () => { const [t, n] = b.dataset.train.split(','); run(MG.startTraining(t, +n)); });
  q('[data-gmove]').forEach(b => b.onclick = () => { const [t, n, d] = b.dataset.gmove.split(','); run(MG.moveGarrisonReserve(t, +n, d)); });
  if ($('mobReserve')) $('mobReserve').onchange = ev => { S.mobilizeReserve = ev.target.checked; MG.saveCampaign(); render(); };
  q('[data-fort]').forEach(b => b.onclick = () => { const [k, s] = b.dataset.fort.split(','); run(MG.actFort(k, s || null)); });
  q('[data-buyitem]').forEach(b => b.onclick = () => run(MG.buyItem(b.dataset.buyitem)));
  q('[data-hire]').forEach(b => b.onclick = () => run(MG.hire(+b.dataset.hire)));
  q('[data-site]').forEach(b => b.onclick = () => {
    const sel = el.querySelector(`[data-site-gen="${b.dataset.site}"]`);
    run(MG.actExpedition(+b.dataset.site, +sel.value));
  });
  q('[data-mpick]').forEach(c => c.onchange = () => { const id = +c.dataset.mpick; c.checked ? marchPick.add(id) : marchPick.delete(id); render(); });
  q('[data-mall]').forEach(b => b.onclick = () => {
    const ready = S.generals.filter(MG.canExpedition).map(g => g.id);
    marchPick = marchPick.size === ready.length ? new Set() : new Set(ready);
    render();
  });
  if ($('marchLord')) $('marchLord').onchange = ev => { marchLord = ev.target.checked; render(); };
  q('[data-cscout]').forEach(b => b.onclick = () => run(MG.actConquestScout(b.dataset.cscout)));
  q('[data-march]').forEach(b => b.onclick = () => {
    const why = MG.actMarch(b.dataset.march, [...marchPick], marchLord);
    if (MG.S.march) { marchPick.clear(); marchLord = false; }
    run(why);
  });
  q('[data-event]').forEach(b => b.onclick = () => run(MG.resolveEvent(+b.dataset.event)));
  q('[data-promote]').forEach(b => b.onclick = () => run(MG.actPromote(b.dataset.promote)));
  q('[data-retire]').forEach(b => b.onclick = () => run(MG.retire(gen(b.dataset.retire))));
  q('[data-dismiss]').forEach(b => b.onclick = () => {
    const id = +b.dataset.dismiss;
    if (dismissArmed !== id) { dismissArmed = id; render(); return; }
    dismissArmed = null;
    run(MG.dismiss(gen(id)));
  });
  q('[data-heir]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.heir.split(','); MG.chooseHeir(k, +id); render(); });
  if ($('continueBtn')) $('continueBtn').onclick = () => { MG.continueReign(); render(); };
  if ($('finishBtn')) $('finishBtn').onclick = () => { MG.finishStory(); render(); };
  const nc = $('newCampBtn');
  if (nc) nc.onclick = () => MG.openSetup();
  q('[data-card]').forEach(b => b.onclick = () => run(MG.pickCard(+b.dataset.card)));
  if ($('rerollBtn')) $('rerollBtn').onclick = () => run(MG.rerollCards());
  q('[data-chron]').forEach(b => b.onclick = () => run(MG.resolveChronicle(+b.dataset.chron)));
  for (const id of ['chronBtn', 'chronBtn2']) { const b = $(id); if (b) b.onclick = () => { chronOpen = true; render(); }; }
  if ($('chronCloseBtn')) $('chronCloseBtn').onclick = () => { chronOpen = false; render(); };
  bindSetup();
  bindSave();
  q('[data-fup]').forEach(b => b.onclick = () => run(MG.actFieldUpgrade(S.fields[+b.dataset.fup])));
  q('[data-cls]').forEach(b => b.onclick = () => { const [id, k] = b.dataset.cls.split(','); MG.chooseClass(gen(id), k); render(); });
  q('[data-adv]').forEach(b => b.onclick = () => { MG.advanceClass(gen(b.dataset.adv)); render(); });
  q('[data-unequip]').forEach(b => b.onclick = () => { MG.unequip(gen(b.dataset.unequip)); render(); });
  q('[data-equip]').forEach(s => s.onchange = () => { if (s.value) MG.equip(gen(s.dataset.equip), +s.value); render(); });
  q('[data-deploy]').forEach(c => c.onchange = () => { gen(c.dataset.deploy).deploy = c.checked; MG.saveCampaign(); render(); });
  q('[data-mob]').forEach(c => c.onchange = () => { gen(c.dataset.mob).mobilize = c.checked; MG.saveCampaign(); render(); });
  const go = $('goBtn'), end = $('endBtn'), skip = $('skipBtn'), cq = $('conquestBtn');
  if (go) go.onclick = () => { resetArmed = false; sel = null; msg = ''; MG.startNextBattle(); };
  if (cq) cq.onclick = () => { resetArmed = false; sel = null; msg = ''; MG.startConquest(); };
  if (end) end.onclick = () => { sel = null; msg = ''; MG.endMonth(); render(); window.scrollTo(0, 0); };
  if (skip) skip.onclick = () => {
    sel = null; msg = '';
    const all = [];
    let n = 0;
    while (!MG.mustFight() && n++ < 24) all.push(...MG.endMonth());
    MG.S.report = [`${n}개월이 지났어요.`, ...all.filter(r => !r.startsWith('수입')).slice(-6)];
    MG.saveCampaign();
    render(); window.scrollTo(0, 0);
  };
  if ($('resetBtn')) $('resetBtn').onclick = () => {
    if (!resetArmed) { resetArmed = true; render(); return; }
    resetArmed = false; MG.openSetup();
  };
}

MG.openSetup = () => {
  const u = MG.meta().unlocked;
  // 지난번에 고른 것이 아직 해금 상태면 그대로 둔다
  if (!u.domain.includes(setup.domain)) setup.domain = 'none';
  setup.bonuses = setup.bonuses.filter(b => u.bonus.includes(b));
  setup.siege = Math.min(setup.siege, u.siege);
  // 가문 내력·시작 유물은 준비 창을 열 때마다 새로 셋씩 나온다 (시작하기 전까지는 그대로)
  if (!setup.originOffer) { setup.originOffer = MG.originOffer(); setup.origin = setup.originOffer[0]; }
  if (!setup.relicOffer) { setup.relicOffer = MG.startRelicOffer(); setup.relic = setup.relicOffer[0]; }
  setupOpen = true; saveOpen = false; chronOpen = false; msg = '';
  render();
};
function bindSetup() {
  bindPerks();
  if (perkOpen) return;
  if (!setupOpen) return;
  const q = s => el.querySelectorAll(s);
  q('[data-buy]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.buy.split(','); msg = MG.buyUnlock(k, id) || '해금했어요.'; render(); });
  q('[data-setorigin]').forEach(b => b.onclick = () => { setup.origin = b.dataset.setorigin; render(); });
  q('[data-setrelic]').forEach(b => b.onclick = () => { setup.relic = b.dataset.setrelic; render(); });
  q('[data-setdomain]').forEach(b => b.onclick = () => { setup.domain = b.dataset.setdomain; render(); });
  q('[data-setbonus]').forEach(b => b.onclick = () => {
    const k = b.dataset.setbonus;
    setup.bonuses = setup.bonuses.includes(k) ? setup.bonuses.filter(x => x !== k) : [...setup.bonuses, k];
    render();
  });
  if ($('perkTreeBtn')) $('perkTreeBtn').onclick = () => { perkOpen = true; msg = ''; render(); };
  q('[data-setdiff]').forEach(b => b.onclick = () => { setup.difficulty = b.dataset.setdiff; render(); });
  q('[data-setsiege]').forEach(b => b.onclick = () => { setup.siege = +b.dataset.setsiege; render(); });
  $('startCampBtn').onclick = () => {
    setupOpen = false; sel = null; msg = '';
    MG.resetCampaign({ perks: MG.activePerks(setup.perkSlots, setup.keystone), difficulty: setup.difficulty, domain: setup.domain, bonuses: setup.bonuses.slice(), siege: setup.siege, origin: setup.origin, relic: setup.relic });
    setup.originOffer = setup.relicOffer = null;
    render(); window.scrollTo(0, 0);
  };
  if ($('setupCloseBtn')) $('setupCloseBtn').onclick = () => { setupOpen = false; msg = ''; render(); };
}

function bindSave() {
  const open = () => { saveOpen = true; slotArmed = null; msg = ''; render(); };
  for (const id of ['saveMenuBtn', 'saveMenuBtn2']) { const b = $(id); if (b) b.onclick = open; }
  if (!saveOpen) return;
  $('saveCloseBtn').onclick = () => { saveOpen = false; slotArmed = null; msg = ''; render(); };
  el.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
    const k = b.dataset.slot, [act, n] = k.split(':'), i = +n;
    // 빈 슬롯에 저장할 때만 바로, 나머지는 두 번 눌러야 한다
    const needConfirm = act !== 'save' || !!MG.slotInfo(i);
    if (needConfirm && slotArmed !== k) { slotArmed = k; render(); return; }
    slotArmed = null;
    msg = act === 'save' ? MG.saveSlot(i) : act === 'load' ? MG.loadSlot(i) : MG.deleteSlot(i);
    if (act === 'load' && !MG.S.over) { sel = null; }
    render();
  });
  $('exportBtn').onclick = () => {
    const S = MG.S, blob = new Blob([MG.exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `변경백-${S.lord.gen}대-${MG.year()}년차${S.month % 12 + 1}월.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg = '파일로 내보냈어요.'; render();
  };
  if ($('openDirBtn')) $('openDirBtn').onclick = () => MG.openSaveDir();
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = ev => {
    const f = ev.target.files[0];
    if (!f) return;
    f.text().then(t => { msg = MG.importSave(t); sel = null; render(); });
  };
}

MG.enterCamp = () => {
  msg = '';
  if (MG.music) MG.music('camp');
  MG.mode = 'camp';
  MG.B = null;
  $('result').classList.add('hidden');
  $('app').classList.add('hidden');
  el.classList.remove('hidden');
  render();
};

MG.startConquest = () => {
  MG.createConquest(MG.buildRoster(MG.S.march));
  showBattle();
};
MG.startNextBattle = () => {
  MG.createBattle(MG.S.level, MG.buildRoster());
  showBattle();
};
function showBattle() {
  if (MG.music) MG.music('battle');
  MG.mode = 'battle';
  $('result').classList.add('hidden');
  el.classList.add('hidden');
  $('app').classList.remove('hidden');
  window.dispatchEvent(new Event('resize'));
  MG.resetView();
  MG.ui.refresh(true);
};
})();
