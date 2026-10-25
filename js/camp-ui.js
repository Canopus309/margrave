// 내정 화면: 달마다 행동력으로 성 안 건물·들판·수리·모집·훈련·정찰·제작을 하고, 장수와 병원을 관리한다
(() => {
const $ = id => document.getElementById(id);
const el = $('camp');
const CELL_PX = 30;
let resetArmed = false;
let dismissArmed = null;  // 해고 확인 중인 장수 id
let saveOpen = false;     // 저장·불러오기 창
let chronOpen = false;    // 연대기 창
let setupOpen = false;    // 새 캠페인 준비 창
let setup = { domain: 'none', bonuses: [], siege: 0 };
let slotArmed = null;     // 두 번 눌러 확인 중인 슬롯 동작 'save:1', 'load:2', 'del:3'
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
  const res = Object.keys(MG.RES).map(k => `<div class="res"><span>${MG.RES[k]}</span><b>${Math.floor(S.res[k])}</b>
    <i class="${prod[k] < 0 ? 'danger' : 'muted'}">${sign(prod[k])}/월</i></div>`).join('');
  let intel = '';
  if (A.scout >= 1) intel += ` · ${A.dirs.map(d => `<span class="dirTag">${MG.SIDE_NAME[d]}</span>`).join('')}쪽`;
  if (A.scout >= 2) {
    const sum = {};
    for (const g of MG.attackGroups()) sum[g.type] = (sum[g.type] || 0) + g.count;
    intel += ` · ${Object.entries(sum).map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${n}`).join(', ')}`;
  }
  if (A.mul && A.mul < 1) intel += ` <span class="ok small">(둥지 소탕으로 규모 -${Math.round((1 - A.mul) * 100)}%)</span>`;
  if (A.retaliation) intel += ` <span class="danger small">(${MG.OUTPOSTS[A.retaliation].name}의 보복 습격)</span>`;
  const attackNow = MG.isAttackMonth();
  const marchNow = S.pendingConquest && S.march;
  return `<header>
    <div><h1>${S.lord.name}의 변경 기지</h1><div class="muted">${MG.monthName()} · ${S.lord.gen}대 성주${S.domain && S.domain !== 'none' ? ` · ${MG.DOMAINS[S.domain].name}` : ''}${S.siege ? ` · 포위 ${S.siege}단계` : ''}
      ${effectTags()}</div></div>
    <div class="headRight"><button id="chronBtn">연대기</button><button id="saveMenuBtn">저장·불러오기</button>
      <div class="ap">행동력 ${'●'.repeat(S.ap)}${'○'.repeat(MG.AP_PER_MONTH - S.ap)}</div></div>
  </header>
  <div class="resBar">${res}
    <div class="res"><span>주민</span><b>${S.pop}</b><i class="muted">/ ${MG.popCap()}</i></div>
    <div class="res"><span>보관 한도</span><b>${cap}</b></div>
  </div>
  <div class="ecoLine small muted">매달 골드: 세금 +${eco.tax}${eco.market ? ` · 시장 +${eco.market}` : ''} · 급여 <span class="${prod.gold < 0 ? 'danger' : ''}">-${eco.wages}</span> (병력 ${eco.soldiers}명)
    · 식량: 생산 +${Math.round(eco.made.food)} · 소비 -${eco.eat} (병사·주민 1인당 ${MG.FOOD_PER_PERSON})</div>
  <div class="attackBar ${attackNow ? 'now' : ''}">
    <div>다음 습격 (전투 ${S.level}${S.level % 5 === 0 ? ', 대습격' : ''}): <b>${fc.text}</b>${intel}
      ${A.scout < 2 ? '<span class="muted small"> · 정찰하면 더 알 수 있어요</span>' : ''}</div>
    <div class="btns">${marchNow
      ? `<button class="main danger" id="conquestBtn">정벌군이 ${MG.OUTPOSTS[S.march.id].name}에 도착 → 정벌 전투</button>`
      : attackNow
      ? '<button class="main danger" id="goBtn">습격이 왔어요 → 전투 준비</button>'
      : '<button id="skipBtn">다음 습격까지 넘기기</button><button class="main" id="endBtn">한 달 마치기</button>'}</div>
  </div>
  ${S.starving ? '<div class="danger small">식량이 바닥났어요. 전투에서 공격력이 떨어지고 주민과 병사가 떠나요.</div>' : ''}
  ${S.unpaid ? '<div class="danger small">급여가 밀렸어요. 전투에서 공격력이 떨어지고 병사가 탈영해요.</div>' : ''}
  ${!S.unpaid && prod.gold < 0 && S.res.gold + prod.gold < 0 ? '<div class="warn small">이대로면 다음 달 급여를 다 못 줘요.</div>' : ''}
  ${S.keep < MG.KEEP_HP * 0.5 ? `<div class="danger small">본성 체력이 ${Math.round(S.keep)} / ${MG.KEEP_HP}이에요. 이대로 습격을 받으면 금방 무너져요. 수리하세요.</div>` : ''}
  ${MG.damageList().some(d => d.kind === 'wall' && d.hp <= 0) ? '<div class="warn small">무너진 성벽이 그대로예요. 수리하지 않으면 다음 습격 때 뚫린 채로 싸워요.</div>' : ''}
  ${S.report && S.report.length ? `<div class="report small">${S.report.map(r => `<div>${r}</div>`).join('')}</div>` : ''}`;
}

// 연대기 사건이 남긴 지속 효과 표시
function effectTags() {
  const names = { migration: '마물 대이동(습격 +30%, 전리품 2배)', harshWinter: '혹한(겨울 식량 소비 1.5배)', marriage: '혼인(출생 확률 2배)', lowtax: '세금 감면(-30%)' };
  const endless = MG.S.ended ? ` <span class="effTag" title="검은 성채를 무너뜨린 뒤 해마다 습격이 커져요">평정 이후 · 습격 +${Math.round((MG.endlessMul() - 1) * 100)}%</span>` : '';
  return endless + (MG.S.effects || []).filter(e => e.until > MG.S.month)
    .map(e => ` <span class="effTag" title="${MG.monthLabel(e.until)}까지">${names[e.type] || e.type} · ${e.until - MG.S.month}개월</span>`).join('');
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
    return `<div class="bld ${b.hp <= 0 ? 'ruin' : ''} ${on ? 'on' : ''}" data-bld="${b.id}"
      style="left:${b.i * CELL_PX}px;top:${b.j * CELL_PX}px;width:${d.w * CELL_PX}px;height:${d.h * CELL_PX}px;background:${b.hp <= 0 ? '#4a4038' : d.color}">
      <span>${d.name}${b.level > 1 ? ` ${b.level}` : ''}</span>${b.hp > 0 && b.hp < b.max ? `<em style="width:${pct(b.hp, b.max)}%"></em>` : ''}</div>`;
  }).join('');
  const keep = `<div class="keepCell" style="left:${5 * CELL_PX}px;top:${5 * CELL_PX}px;width:${4 * CELL_PX}px;height:${4 * CELL_PX}px">본성
    <small>${Math.round(S.keep)} / ${MG.KEEP_HP}</small></div>`;
  const gates = ['북', '동', '남', '서'].map((g, k) => {
    const pos = [[6.5, -0.9], [n - 0.1, 6.5], [6.5, n - 0.1], [-0.9, 6.5]][k];
    return `<div class="gateTag" style="left:${pos[0] * CELL_PX}px;top:${pos[1] * CELL_PX}px">${g}문</div>`;
  }).join('');
  return `<section class="card castle"><h3>성 안 (빈 칸을 눌러 건설, 건물을 눌러 정보·강화)</h3>
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
      ${b.hp <= 0 ? '<div class="danger small">부서져서 기능을 잃었어요. 행동의 "수리"로 고쳐요.</div>' : ''}
      ${maxed ? '<div class="muted small">최고 단계예요</div>' : `<button data-upgrade="${b.id}" ${S.ap && MG.canPay(cost) && b.hp > 0 ? '' : 'disabled'}>
        ${b.level + 1}단계로 강화 · ${MG.costText(cost)} · 행동력 1</button><div class="muted small">다음: ${d.desc(b.level + 1)}</div>`}</div>`;
  }
  const opts = Object.entries(MG.BUILDINGS).map(([k, d]) => {
    const fit = MG.canPlace(k, sel.i, sel.j), ok = fit && S.ap && MG.canPay(d.cost);
    return `<button class="buildOpt" data-build="${k}" ${ok ? '' : 'disabled'}>
      <b>${d.name}</b> <span class="muted">${d.w}×${d.h}</span><span>${d.desc(1)}</span>
      <span class="${MG.canPay(d.cost) ? 'muted' : 'danger'}">${MG.costText(d.cost)}${fit ? '' : ' · 자리 부족'}</span></button>`;
  }).join('');
  return `<div class="selPanel"><b>여기에 짓기</b> <span class="muted small">(${sel.i}, ${sel.j}칸을 왼쪽 위로) · 행동력 1</span>
    <div class="buildList">${opts}</div></div>`;
}

// ---------- 행동 ----------
function recruitNote() {
  if (!MG.recruitCap()) return '병영이 필요해요 (부서졌으면 수리)';
  if (MG.S.pop <= MG.MIN_POP) return '주민이 너무 적어요';
  const p = MG.recruitPlan();
  if (!p.total) return `골드가 모자라요 (1명당 ${MG.RECRUIT_GOLD})`;
  const where = [p.squads ? `장수 부대 ${p.squads}` : '', p.garrison ? `직할 ${p.garrison}` : ''].filter(Boolean).join(' · ');
  return `주민 ${p.total}명 → ${where} · ${MG.costText(MG.recruitCost())}`;
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
    ? `<div class="actRow"><span class="small"><b>발탁</b> <span class="muted">직할 병사를 장수로 · ${MG.costText(MG.PROMOTE_COST)}</span></span>
        <span>${['infantry', 'archer'].map(t => `<button class="mini" data-promote="${t}" ${ap && S.garrison[t] > 0 && MG.canPay(MG.PROMOTE_COST) ? '' : 'disabled'}>${MG.UNIT_TYPES[t].name}</button>`).join(' ')}</span></div>`
    : '<div class="actRow"><span class="small muted">발탁: 훈련장 2단계가 있으면 직할 병사를 장수로 키울 수 있어요</span></div>';
  return `<section class="card"><h3>행동 (행동력 1씩)</h3>
    ${rows.map(r => `<div class="actRow"><button data-act="${r.id}" ${ap && r.ok ? '' : 'disabled'}>${r.name}</button><span class="small muted">${r.note}</span></div>`).join('')}
    ${promote}
    ${msg ? `<div class="msg small">${msg}</div>` : ''}</section>`;
}

// 전투 소모품: 보유 수와 사기 (시장이 있어야)
function itemShop() {
  const S = MG.S, market = MG.bLevel('market') > 0;
  const rows = Object.entries(MG.ITEMS).map(([k, I]) => `<div class="tradeRow"><span><b>${I.name}</b> ${S.items[k] || 0}개</span>
    <span class="small muted">${I.desc}${I.defense ? ' (방어전)' : ''}</span>
    ${market ? `<button class="mini" data-buyitem="${k}" ${S.res.gold >= I.price && (S.items[k] || 0) < MG.ITEM_MAX ? '' : 'disabled'}>사기 · 골드 ${I.price}</button>` : ''}</div>`).join('');
  return `<h3 style="margin-top:10px">전투 소모품 <span class="muted">(전투마다 ${MG.ITEM_CARRY}종까지 챙겨 가요)</span></h3>${rows}`;
}

function fieldsBlock() {
  const S = MG.S, ap = S.ap > 0;
  const list = S.fields.map((f, idx) => {
    const d = MG.FIELDS[f.type], cost = MG.fieldUpgradeCost(f), prod = Object.entries(d.prod).map(([k, v]) => `${MG.RES[k]} ${v * f.level}`).join('');
    return `<div class="actRow"><span><b>${d.name} ${f.level}</b> <span class="muted small">${prod}/월</span></span>
      ${f.level >= d.max ? '<span class="muted small">최고</span>' : `<button class="mini" data-fup="${idx}" ${ap && MG.canPay(cost) ? '' : 'disabled'}>강화 · ${MG.costText(cost)}</button>`}</div>`;
  }).join('');
  const add = S.fields.length < MG.FIELD_SLOTS ? Object.entries(MG.FIELDS).filter(([, d]) => !d.hidden).map(([k, d]) =>
    `<button class="mini" data-field="${k}" ${ap && MG.canPay(d.cost) ? '' : 'disabled'}>${d.name} 짓기 · ${MG.costText(d.cost)}</button>`).join(' ') : '<span class="muted small">빈자리 없음</span>';
  return `<section class="card"><h3>성 밖 들판 ${S.fields.length} / ${MG.FIELD_SLOTS} <span class="muted">(적이 부수지 않아요)</span></h3>
    ${list}<div class="fieldAdd">${add}</div>
    <div class="muted small">가을엔 식량 2배, 겨울엔 식량 0·목재 절반</div></section>`;
}

function marketBlock() {
  const S = MG.S;
  MG.ensureMarket();
  const l = MG.bLevel('market');
  if (!l) return `<section class="card"><h3>시장</h3><div class="muted small">시장을 지으면 식량·목재·철을 골드로 사고팔고, 전투 소모품도 살 수 있어요. 시세는 매달 바뀌어요.</div>${itemShop()}</section>`;
  const arrow = r => {
    const d = S.prices[r] - S.prevPrices[r];
    return Math.abs(d) < 0.01 ? '<span class="muted">–</span>' : d > 0 ? '<span class="danger">▲</span>' : '<span class="ok">▼</span>';
  };
  const rows = Object.keys(MG.MARKET.base).map(r => `<div class="tradeRow">
    <span><b>${MG.RES[r]}</b> ${arrow(r)}</span>
    <span class="small">살 때 ${MG.buyPrice(r).toFixed(2)} · 팔 때 ${MG.sellPrice(r).toFixed(2)}</span>
    <span class="tbtns">${[50, 10].map(q => `<button class="mini" data-trade="${r},${q}">사기 ${q}</button>`).join('')}
      ${[10, 50].map(q => `<button class="mini" data-trade="${r},${-q}">팔기 ${q}</button>`).join('')}</span></div>`).join('');
  return `<section class="card"><h3>시장 거래 <span class="muted">(행동력 안 씀 · 이번 달 남은 거래 ${MG.tradeLeft()}개)</span></h3>
    ${rows}<div class="muted small">값은 1개당 골드. ▲ 지난달보다 비쌈, ▼ 쌈. 식량은 가을에 싸고 겨울·봄에 비싸요.</div>
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
    return `<div class="gen dead"><div class="gtop"><b>${g.name}</b><span class="danger">세상을 떠남</span></div>
      <div class="muted">${MG.genTitle(g)} · Lv.${g.level}</div>
      <div class="muted small">남은 병사 ${g.healthy}명은 지휘관 없이 출전해요.</div></div>`;
  }
  const status = g.away ? `<span class="warn">${g.away.type === 'march' ? '정벌' : '원정'} 중 · ${g.away.months}개월 뒤 귀환</span>`
    : g.injured ? `<span class="warn">부상 · ${g.injured}개월 남음</span>` : '<span class="ok">건강</span>';
  const old = MG.ageMul(g.age) < 1 ? ` <span class="warn">(노쇠 ${Math.round((1 - MG.ageMul(g.age)) * 100)}%)</span>` : '';
  return `<div class="gen ${g.injured ? 'hurt' : ''}">
    <div class="gtop"><b>${g.name}${g.blood ? ' <span class="blood">가문</span>' : ''}</b>${status}</div>
    <div class="muted">${MG.genTitle(g)} · 통솔 ${MG.genLead(g)} · ${g.age}세${old}</div>
    ${traitTags(g.traits)}
    <div class="lv"><span>Lv.${g.level}</span><div class="bar"><div style="width:${pct(g.xp, need)}%;background:#6aa8ff"></div></div>
      <span class="small muted">${need ? `${Math.floor(g.xp)} / ${need}` : '최고 레벨'}</span></div>
    <div class="small">병사 ${g.healthy} / ${cap}${g.wounded.length ? ` · <span class="warn">부상 ${g.wounded.length}명 (${woundCounts(g.wounded)})</span>` : ''}</div>
    ${role ? `<div class="muted small">${role}</div>` : ''}${skillLine(g)}${refill}${classBlock(g)}${weaponBlock(g)}
    ${g.away ? `<div class="warn small">${g.away.type === 'march' ? '정벌' : '원정'} 중이라 습격이 와도 성을 지킬 수 없어요.</div>` : `<label class="tog"><input type="checkbox" data-deploy="${g.id}" ${g.deploy ? 'checked' : ''}>
      ${g.injured ? '<span class="warn">부상 중에도 출전 (체력 절반, 쓰러지면 전사)</span>' : '장수 출전'}</label>`}
    ${g.wounded.length ? `<label class="tog"><input type="checkbox" data-mob="${g.id}" ${g.mobilize ? 'checked' : ''}>
      <span class="warn">부상병 ${g.wounded.length}명 동원 (체력 감소, 또 쓰러지면 사망 위험 큼)</span></label>` : ''}
    <div class="genBtns">
      ${g.age >= 45 ? `<button class="mini" data-retire="${g.id}">은퇴시키기 (교관이 되어 훈련 경험치 +${MG.RETIRED_TRAIN_XP})</button>` : ''}
      ${MG.canDismiss(g) ? `<button class="mini ${dismissArmed === g.id ? 'danger' : ''}" data-dismiss="${g.id}">${dismissArmed === g.id ? '정말 해고? 한 번 더 누르세요' : '해고'}</button>` : ''}
    </div>
  </div>`;
}

const traitTags = traits => `<div class="traits">${(traits || []).map(t => {
  const d = MG.TRAITS[t];
  return `<span class="trait ${d.bad ? 'bad' : ''}" title="${d.desc}">${d.name}</span>`;
}).join('')}</div>`;

// ---------- 가문·주점 ----------
function familyBlock() {
  const S = MG.S, L = S.lord;
  const kids = S.family.map(c => `<li>${c.name} · ${c.age}세 ${traitTags(c.traits)}</li>`).join('');
  const blood = S.generals.filter(g => g.blood && !g.dead).map(g => `<li>${g.name} · ${g.age}세 · 장수</li>`).join('');
  return `<section class="card"><h3>가문 · ${L.gen}대 성주</h3>
    <div><b>${L.name}</b> · ${L.age}세${L.level > 1 ? ` · Lv.${L.level}` : ''}${L.minor ? ' <span class="warn">(어린 성주: 전투 불참)</span>' : ''}</div>
    ${traitTags(L.traits)}
    ${MG.ageMul(L.age) < 1 ? `<div class="warn small">나이가 들어 능력이 ${Math.round((1 - MG.ageMul(L.age)) * 100)}% 떨어졌어요.</div>` : ''}
    ${MG.deathChance(L.age) ? `<div class="danger small">해마다 ${Math.round(MG.deathChance(L.age) * 100)}% 확률로 세상을 떠날 수 있어요.</div>` : ''}
    <ul class="small">${blood}${kids || (blood ? '' : '<li class="muted">아직 자녀가 없어요</li>')}</ul>
    <div class="muted small">성주가 20~45세일 때 해마다 ${Math.round(MG.BIRTH_CHANCE * 100)}% 확률로 아이가 태어나고, ${MG.ADULT_AGE}세에 장수가 돼요.
      성주가 세상을 떠나면 혈족 중에서 후계자를 골라요. 혈족이 없으면 가문이 끊겨요.</div></section>`;
}

function tavernBlock() {
  const S = MG.S, l = MG.bLevel('tavern');
  if (!l) return `<section class="card"><h3>주점</h3><div class="muted small">주점을 지으면 떠돌이 장수가 찾아와요. 골드로 고용할 수 있어요.</div></section>`;
  const list = S.tavern.map((t, i) => {
    const g = t.g, cost = MG.hireCost(g.level);
    return `<div class="hireRow"><div><b>${g.name}</b> <span class="muted small">${MG.UNIT_TYPES[g.type].name} · Lv.${g.level} · ${g.age}세 · ${t.left}개월 뒤 떠남</span>
      ${traitTags(g.traits)}</div><button class="mini" data-hire="${i}" ${S.res.gold >= cost ? '' : 'disabled'}>고용 · 골드 ${cost}</button></div>`;
  }).join('');
  return `<section class="card"><h3>주점 (최대 ${l + 1}명)</h3>${list || '<div class="muted small">지금은 찾아온 장수가 없어요. 매달 찾아올 수 있어요.</div>'}
    <div class="muted small">고용한 장수의 부대는 빈 채로 시작해요. 모집으로 채워요.</div></section>`;
}

// ---------- 정벌 ----------
// 거점 3곳(순서 자유)과 검은 성채. 장수 부대를 2개 이상 골라 출정한다.
function conquestBlock() {
  const S = MG.S, M = S.march, ready = S.generals.filter(MG.canExpedition);
  for (const id of [...marchPick]) if (!ready.some(g => g.id === id)) marchPick.delete(id);
  const rows = Object.entries(MG.OUTPOSTS).map(([id, O]) => {
    const info = MG.conquestInfo(id), done = MG.hasOutpost(id), boss = MG.ENEMY_TYPES[O.boss];
    const head = `<b>${O.name}</b> <span class="warn">${'★'.repeat(O.stars)}</span>
      <span class="muted small">${MG.BIOME_NAME[O.biome]} · 성을 ${O.months}개월 비움${info.fails ? ` · 실패 ${info.fails}번 (수비 +${Math.round(info.fails * MG.CONQUEST_FAIL_MUL * 100)}%)` : ''}</span>`;
    if (done) return `<div class="siteRow"><div>${head}<div class="ok small">${O.final ? '함락함' : '정벌함'} · ${O.reward}</div></div></div>`;
    if (O.final && !MG.citadelOpen()) return `<div class="siteRow"><div><b>${O.name}</b> <span class="warn">${'★'.repeat(O.stars)}</span>
      <div class="muted small">거점 3곳을 모두 정벌하면 열려요. 이곳을 무너뜨리면 엔딩이에요.</div></div></div>`;
    const intel = info.scout
      ? `<div class="small">보스 ${boss.name}: ${O.bossDesc}</div>
        <div class="muted small">${O.garrison.map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${Math.round(n * MG.conquestMul(id))}`).join(', ')} · 망루 ${O.towers} · 본진 체력 ${Math.round(O.hq * MG.conquestMul(id))}</div>`
      : `<div class="muted small">보스 ${boss.name} · 수비 규모는 정찰해야 알 수 있어요</div>`;
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
    pickArea = `<div class="small"><b>정벌군 고르기</b> <span class="muted">(장수 부대 ${MG.MARCH_MIN}개 이상, 건강하고 병사가 있는 장수만)</span></div>
      <div class="marchPick">${ready.map(g => `<label class="tog"><input type="checkbox" data-mpick="${g.id}" ${marchPick.has(g.id) ? 'checked' : ''}>
        ${g.name} <span class="muted small">${MG.genTitle(g)} Lv.${g.level} · 병사 ${g.healthy}</span></label>`).join('') || '<span class="muted small">보낼 수 있는 장수가 없어요</span>'}
      ${S.lord.minor ? '' : `<label class="tog"><input type="checkbox" id="marchLord" ${marchLord ? 'checked' : ''}>
        <span>성주 친정 <span class="muted small">(근위대와 함께 · 성주 주변 아군 공격력 +${Math.round(MG.LORD.auraBonus * 100)}% · 전사하면 후계 승계)</span></span></label>`}</div>`;
  }
  return `<section class="card"><h3>정벌 <span class="muted">(정벌한 거점 ${(S.outposts || []).filter(id => !MG.OUTPOSTS[id].final).length} / 3${S.ended ? ' · 검은 성채 함락' : ''})</span></h3>
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
    return `<div class="siteRow"><div><b>${d.name}</b> <span class="muted small">난이도 ${site.diff} · ${site.months}개월</span>
      <div class="small">${d.desc}</div>${risky ? `<div class="warn small">다음 습격(${fc.text}) 전에 못 돌아올 수 있어요</div>` : ''}</div>
      ${ready.length ? `<div class="siteGo"><select data-site-gen="${site.id}">${opts}</select>
        <button class="mini" data-site="${site.id}" ${S.ap >= MG.EXPEDITION_AP ? '' : 'disabled'}>보내기 · 행동력 ${MG.EXPEDITION_AP}</button></div>` : ''}</div>`;
  }).join('');
  const awayList = away.filter(g => g.away.type !== 'march').map(g => `<li>${g.name} 부대 → ${MG.SITES[g.away.type].name} (${g.away.months}개월 뒤, 성공 ${Math.round(g.away.chance * 100)}%)</li>`).join('');
  return `<section class="card"><h3>원정 <span class="muted">(계절마다 원정지가 바뀌어요)</span></h3>
    ${sites || '<div class="muted small">이번 계절 원정지를 모두 썼어요.</div>'}
    ${!ready.length ? '<div class="muted small">보낼 수 있는 부대가 없어요 (건강하고 병사가 있는 장수만).</div>' : ''}
    ${awayList ? `<ul class="small">${awayList}</ul>` : ''}
    <div class="muted small">전력 = 병사 수 + 장수 레벨×8 (전직·무기·특성 반영). 원정 간 부대는 돌아올 때까지 성을 못 지켜요.</div></section>`;
}

function crownBlock() {
  const S = MG.S, c = S.crown;
  const sup = S.support ? `<div class="ok small">지원이 오는 중이에요 (${S.support.months}개월 뒤)</div>` : '';
  return `<section class="card"><h3>본국과의 관계 ${c} / 100</h3>
    <div class="bar"><div style="width:${c}%;background:${c >= 70 ? '#6bdc8f' : c >= 40 ? '#e6b450' : '#ff6b6b'}"></div></div>
    ${sup}
    <div class="actRow"><button data-act="support" ${S.ap && !S.support && c >= MG.SUPPORT_MIN ? '' : 'disabled'}>지원 요청</button>
      <span class="small muted">관계 -${MG.SUPPORT_COST} · 2~4개월 뒤 ${MG.supportKind()}${c < MG.SUPPORT_MIN ? ' (관계가 너무 나빠요)' : ''}</span></div>
    <div class="muted small">습격을 막으면 +${MG.CROWN_WIN}, 왕실의 부탁을 들어주면 +10, 거절하면 -5. 관계가 좋을수록 지원이 좋고 계승 선물이 커요. 해임은 없어요.</div></section>`;
}

function eventModal() {
  const v = MG.eventView();
  return `<div class="overlay"><div class="panel"><h1>${v.title}</h1><p>${v.text}</p>
    <div class="row">${v.choices.map((c, i) => `<button class="main ${i ? 'alt' : ''}" data-event="${i}" ${c.ok ? '' : 'disabled'}>${c.label}</button>`).join('')}</div></div></div>`;
}

// 성주가 세상을 떠나면 다른 것을 하기 전에 후계자를 고른다
function successionModal() {
  const S = MG.S, heirs = MG.heirs();
  return `<div class="overlay"><div class="panel"><h1>후계자를 고르세요</h1>
    <p class="muted">${S.lord.name}이(가) 세상을 떠났어요. 혈족 중에서 다음 성주를 골라요.</p>
    ${heirs.map(h => `<button class="heirBtn" data-heir="${h.kind},${h.id}">
      <b>${h.name}</b> · ${h.age}세${h.kind === 'general' ? ` · 장수 Lv.${h.level} (부대 병사는 직할로)` : h.age < MG.ADULT_AGE ? ' · 어린 자녀 (성년까지 전투 불참)' : ''}
      ${traitTags(h.traits)}</button>`).join('')}</div></div>`;
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
    <h1>🏰 변경에 평화가 찾아왔어요</h1>
    <p>${S.lord.name}이(가) 검은 성채를 무너뜨리고 고대 드래곤을 물리쳤어요. 변경백 가문은 ${lords}대, ${MG.year()}년에 걸쳐 왕국의 전진 기지를 지켰어요.
      치른 전투 ${S.stats.battles}(습격 승리 ${S.stats.wins}), 처치한 적 ${S.stats.kills}, 잃은 장수 ${S.stats.generalsLost}.</p>
    <h3>정벌의 기록</h3><ul class="chronList">${big}</ul>
    <h3>성주 계보</h3>${lineageTable()}
    <h3>지금 마치면 받는 명성 <b class="warn">+${r.total}</b> <span class="small muted">(엔딩 +${MG.ENDING_RENOWN} 포함)</span></h3>
    <p class="small muted">계속 다스리면 캠페인이 이어져요. 습격은 해마다 ${Math.round(MG.ENDLESS_STEP * 100)}%씩 더 거세지고, 끝날 때 그때까지의 명성(엔딩 보너스 포함)을 받아요.</p>
    <div class="row"><button class="main" id="continueBtn">계속 다스리기</button><button class="main alt" id="finishBtn">여기서 이야기를 마치기</button></div></div></div>`;
}

function overPanel() {
  const S = MG.S, r = S.renown || MG.renownOf(S), m = MG.meta();
  const title = S.overReason === '평정' ? '변경백 가문의 이야기가 끝났어요' : S.overReason === '가문 단절' ? '가문이 끊겼어요' : '변경 기지가 무너졌어요';
  return `<div class="overlay"><div class="panel wide"><h1>${title}</h1>
    <p>${S.lord.gen}대에 걸쳐 ${MG.year()}년 동안 변경을 지켰어요. 치른 전투 ${S.stats.battles}(승리 ${S.stats.wins}), 처치한 적 ${S.stats.kills}.</p>
    <h3>성주 계보</h3>${lineageTable()}
    <h3>얻은 명성 <b class="warn">+${r.total}</b></h3>
    <div class="small muted">버틴 햇수 ${r.parts.years} · 승리 ${r.parts.wins} · 거점 ${r.parts.outposts} · 이어진 대 ${r.parts.gens}${r.parts.ending ? ` · 엔딩 ${r.parts.ending}` : ''}${S.siege ? ` · 포위 ${S.siege}단계 ×${MG.siegeRenownMul(S.siege)}` : ''}</div>
    <p>모아 둔 명성: <b class="warn">${m.renown}</b> — 새 캠페인을 준비할 때 해금에 써요.</p>
    <div class="row"><button class="main" id="newCampBtn">새 캠페인 준비</button><button class="main alt" id="chronBtn2">연대기 보기</button><button class="main alt" id="saveMenuBtn2">저장 불러오기</button></div></div></div>`;
}

// 연대기 창: 계보와 기록 (최근 것이 위)
function chronPanel() {
  const S = MG.S, icon = { lord: '👑', battle: '⚔', general: '🛡', event: '📜', etc: '·' };
  const list = (S.chronicle || []).slice().reverse().map(c => `<li><span class="muted">${MG.monthLabel(c.month)}</span> ${icon[c.kind] || '·'} ${c.text}</li>`).join('');
  return `<div class="overlay"><div class="panel wide"><h1>연대기</h1>
    <h3>성주 계보</h3>${lineageTable()}
    <h3>기록</h3><ul class="chronList">${list || '<li class="muted">아직 기록이 없어요</li>'}</ul>
    <div class="row"><button class="main" id="chronCloseBtn">닫기</button></div></div></div>`;
}

function chronicleModal() {
  const v = MG.chronicleView();
  return `<div class="overlay"><div class="panel"><div class="muted small">연대기 사건</div><h1>📜 ${v.title}</h1><p>${v.text}</p>
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
  return `<div class="overlay"><div class="panel wide"><h1>새 캠페인 준비</h1>
    <p>모아 둔 명성: <b class="warn">${m.renown}</b> <span class="small muted">— 한 번 해금하면 다음 캠페인부터 계속 고를 수 있어요.</span></p>
    <h3>영지 특성 (하나)</h3>${domain}
    <h3>시작 보너스 (해금한 것은 켜고 끌 수 있어요)</h3>${bonus}
    <h3>포위 단계 <span class="small muted">단계마다 적 수·체력 +15%, 얻는 명성 +25%</span></h3>
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
  return `<div class="overlay"><div class="panel"><h1>저장 · 불러오기</h1>
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
  return `<h3>병원 ${list.length} / ${cap}</h3>
    <div class="bar"><div style="width:${pct(list.length, cap || 1)}%;background:${over ? '#ff6b6b' : '#6bdc8f'}"></div></div>
    ${!cap ? '<div class="danger small">병원이 없거나 부서져서 아무도 회복하지 못해요.</div>' : over ? `<div class="danger small">수용 인원을 넘은 ${over}명은 회복이 멈춰 있어요.</div>` : ''}
    <ul class="small">${lines.join('') || '<li class="muted">비어 있어요</li>'}</ul>`;
}

function render() {
  const S = MG.S;
  const inv = S.inventory.slice().sort((a, b) => Object.keys(MG.WEAPON_GRADES).indexOf(b.grade) - Object.keys(MG.WEAPON_GRADES).indexOf(a.grade));
  el.innerHTML = `<div class="campWrap">
    ${headerBlock()}
    <div class="campMain">${mapBlock()}<div class="campSide">${actionsBlock()}${conquestBlock()}${expeditionBlock()}${marketBlock()}${fieldsBlock()}</div></div>
    <h2>장수 ${S.generals.filter(g => !g.dead).length}명</h2>
    <section class="gens">${S.generals.map(genCard).join('')}</section>
    <div class="campRow">
      ${familyBlock()}
      ${tavernBlock()}
      ${crownBlock()}
      <section class="card"><h3>성주 직할 병력 (성벽 위)</h3>
        <div class="stat"><span>궁수</span><b>${S.garrison.archer}</b></div>
        <div class="stat"><span>보병</span><b>${S.garrison.infantry}</b></div>
        <div class="muted small">모집하면 장수 부대의 빈자리를 먼저 채우고, 남는 신병은 모두 직할로 와요. 직할 병력에는 상한이 없고 식량으로만 제한돼요.</div></section>
      <section class="card">${hospitalBlock()}</section>
      <section class="card"><h3>보유 무기 ${inv.length}</h3>
        <ul class="small inv">${inv.map(w => `<li>${gradeTag(w)} <span class="muted">${MG.UNIT_TYPES[w.type].name}용 · ${MG.weaponDesc(w)}</span></li>`).join('')
          || '<li class="muted">전투에서 이기거나 대장간에서 만들어요</li>'}</ul></section>
      <section class="card"><h3>기록</h3>
        <div class="stat"><span>치른 전투</span><b>${S.stats.battles}</b></div>
        <div class="stat"><span>처치한 적</span><b>${S.stats.kills}</b></div>
        <div class="stat"><span>잃은 장수 / 병사</span><b>${S.stats.generalsLost} / ${S.stats.soldiersLost}</b></div>
        <button id="resetBtn" class="${resetArmed ? 'danger' : ''}">${resetArmed ? '정말 처음부터? 한 번 더 누르세요' : '캠페인 처음부터'}</button></section>
    </div>
  </div>
  ${setupOpen ? setupPanel() : saveOpen ? savePanel() : chronOpen ? chronPanel() : S.over ? overPanel()
    : S.pendingSuccession ? successionModal() : S.endingPending ? endingPanel() : S.cevent ? chronicleModal() : S.event ? eventModal() : ''}`;
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
  q('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    run(a === 'repair' ? MG.actRepair() : a === 'recruit' ? MG.actRecruit() : a === 'train' ? MG.actTrain() : a === 'scout' ? MG.actScout()
      : a === 'support' ? MG.actSupport() : MG.actCraft());
  });
  q('[data-field]').forEach(b => b.onclick = () => run(MG.actField(b.dataset.field)));
  q('[data-trade]').forEach(b => b.onclick = () => { const [r, n] = b.dataset.trade.split(','); run(MG.trade(r, +n)); });
  q('[data-buyitem]').forEach(b => b.onclick = () => run(MG.buyItem(b.dataset.buyitem)));
  q('[data-hire]').forEach(b => b.onclick = () => run(MG.hire(+b.dataset.hire)));
  q('[data-site]').forEach(b => b.onclick = () => {
    const sel = el.querySelector(`[data-site-gen="${b.dataset.site}"]`);
    run(MG.actExpedition(+b.dataset.site, +sel.value));
  });
  q('[data-mpick]').forEach(c => c.onchange = () => { const id = +c.dataset.mpick; c.checked ? marchPick.add(id) : marchPick.delete(id); render(); });
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
  $('resetBtn').onclick = () => {
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
  setupOpen = true; saveOpen = false; chronOpen = false; msg = '';
  render();
};
function bindSetup() {
  if (!setupOpen) return;
  const q = s => el.querySelectorAll(s);
  q('[data-buy]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.buy.split(','); msg = MG.buyUnlock(k, id) || '해금했어요.'; render(); });
  q('[data-setdomain]').forEach(b => b.onclick = () => { setup.domain = b.dataset.setdomain; render(); });
  q('[data-setbonus]').forEach(b => b.onclick = () => {
    const k = b.dataset.setbonus;
    setup.bonuses = setup.bonuses.includes(k) ? setup.bonuses.filter(x => x !== k) : [...setup.bonuses, k];
    render();
  });
  q('[data-setsiege]').forEach(b => b.onclick = () => { setup.siege = +b.dataset.setsiege; render(); });
  $('startCampBtn').onclick = () => {
    setupOpen = false; sel = null; msg = '';
    MG.resetCampaign({ domain: setup.domain, bonuses: setup.bonuses.slice(), siege: setup.siege });
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
  MG.mode = 'battle';
  $('result').classList.add('hidden');
  el.classList.add('hidden');
  $('app').classList.remove('hidden');
  window.dispatchEvent(new Event('resize'));
  MG.resetView();
  MG.ui.refresh(true);
};
})();
