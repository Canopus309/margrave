// 내정 화면: 달마다 행동력으로 성 안 건물·들판·수리·모집·훈련·정찰·제작을 하고, 장수와 병원을 관리한다
(() => {
const $ = id => document.getElementById(id);
const el = $('camp');
const CELL_PX = 30;
let resetArmed = false;
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
  const S = MG.S, prod = MG.production(), cap = MG.storageCap(), fc = MG.attackForecast(), A = S.nextAttack;
  const res = Object.keys(MG.RES).map(k => `<div class="res"><span>${MG.RES[k]}</span><b>${Math.floor(S.res[k])}</b>
    <i class="${prod[k] < 0 ? 'danger' : 'muted'}">${sign(prod[k])}/월</i></div>`).join('');
  let intel = '';
  if (A.scout >= 1) intel += ` · ${A.dirs.map(d => `<span class="dirTag">${MG.SIDE_NAME[d]}</span>`).join('')}쪽`;
  if (A.scout >= 2) {
    const sum = {};
    for (const g of MG.buildWaves(S.level, A.dirs).groups) sum[g.type] = (sum[g.type] || 0) + g.count;
    intel += ` · ${Object.entries(sum).map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${n}`).join(', ')}`;
  }
  const attackNow = MG.isAttackMonth();
  return `<header>
    <div><h1>${S.lord.name}의 변경 기지</h1><div class="muted">${MG.monthName()} · ${S.lord.gen}대 성주</div></div>
    <div class="ap">행동력 ${'●'.repeat(S.ap)}${'○'.repeat(MG.AP_PER_MONTH - S.ap)}</div>
  </header>
  <div class="resBar">${res}
    <div class="res"><span>주민</span><b>${S.pop}</b><i class="muted">/ ${MG.popCap()}</i></div>
    <div class="res"><span>보관 한도</span><b>${cap}</b></div>
  </div>
  <div class="attackBar ${attackNow ? 'now' : ''}">
    <div>다음 습격 (전투 ${S.level}${S.level % 5 === 0 ? ', 대습격' : ''}): <b>${fc.text}</b>${intel}
      ${A.scout < 2 ? '<span class="muted small"> · 정찰하면 더 알 수 있어요</span>' : ''}</div>
    <div class="btns">${attackNow
      ? '<button class="main danger" id="goBtn">습격이 왔어요 → 전투 준비</button>'
      : '<button id="skipBtn">다음 습격까지 넘기기</button><button class="main" id="endBtn">한 달 마치기</button>'}</div>
  </div>
  ${S.starving ? '<div class="danger small">식량이 바닥났어요. 전투에서 공격력이 떨어지고 주민과 병사가 떠나요.</div>' : ''}
  ${S.keep < MG.KEEP_HP * 0.5 ? `<div class="danger small">본성 체력이 ${Math.round(S.keep)} / ${MG.KEEP_HP}이에요. 이대로 습격을 받으면 금방 무너져요. 수리하세요.</div>` : ''}
  ${MG.damageList().some(d => d.kind === 'wall' && d.hp <= 0) ? '<div class="warn small">무너진 성벽이 그대로예요. 수리하지 않으면 다음 습격 때 뚫린 채로 싸워요.</div>' : ''}
  ${S.report && S.report.length ? `<div class="report small">${S.report.map(r => `<div>${r}</div>`).join('')}</div>` : ''}`;
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
function actionsBlock() {
  const S = MG.S, ap = S.ap > 0;
  const rows = [
    { id: 'repair', name: '수리', note: MG.repairNeed() ? `피해 ${Math.round(MG.damageList().reduce((a, d) => a + d.max - d.hp, 0))} 중 ${MG.repairNeed()} 복구 · ${MG.costText(MG.repairCost())}` : '고칠 곳이 없어요',
      ok: MG.repairNeed() && MG.canPay(MG.repairCost()) },
    { id: 'recruit', name: '모집', note: MG.recruitCap() ? `${MG.recruitAmount()}명 · ${MG.costText(MG.recruitCost())} (주민에서 뽑아요)` : '병영이 필요해요',
      ok: MG.recruitAmount() && MG.canPay(MG.recruitCost()) },
    { id: 'train', name: '훈련', note: MG.bLevel('training') ? `건강한 장수 모두 경험치 +${30 * MG.bLevel('training')}` : '훈련장이 필요해요', ok: MG.bLevel('training') },
    { id: 'scout', name: '정찰', note: S.nextAttack.scout >= 2 ? '다 알아냈어요' : `${S.nextAttack.scout ? '적 구성' : '날짜와 방향'}을 알아내요 · 골드 20`,
      ok: S.nextAttack.scout < 2 && S.res.gold >= 20 },
    { id: 'craft', name: '제작', note: MG.bLevel('smithy') ? `무기 1개 · ${MG.costText(MG.CRAFT_COST)}` : '대장간이 필요해요',
      ok: MG.bLevel('smithy') && MG.canPay(MG.CRAFT_COST) },
  ];
  return `<section class="card"><h3>행동 (행동력 1씩)</h3>
    ${rows.map(r => `<div class="actRow"><button data-act="${r.id}" ${ap && r.ok ? '' : 'disabled'}>${r.name}</button><span class="small muted">${r.note}</span></div>`).join('')}
    ${msg ? `<div class="msg small">${msg}</div>` : ''}</section>`;
}

function fieldsBlock() {
  const S = MG.S, ap = S.ap > 0;
  const list = S.fields.map((f, idx) => {
    const d = MG.FIELDS[f.type], cost = MG.fieldUpgradeCost(f), prod = Object.entries(d.prod).map(([k, v]) => `${MG.RES[k]} ${v * f.level}`).join('');
    return `<div class="actRow"><span><b>${d.name} ${f.level}</b> <span class="muted small">${prod}/월</span></span>
      ${f.level >= d.max ? '<span class="muted small">최고</span>' : `<button class="mini" data-fup="${idx}" ${ap && MG.canPay(cost) ? '' : 'disabled'}>강화 · ${MG.costText(cost)}</button>`}</div>`;
  }).join('');
  const add = S.fields.length < MG.FIELD_SLOTS ? Object.entries(MG.FIELDS).map(([k, d]) =>
    `<button class="mini" data-field="${k}" ${ap && MG.canPay(d.cost) ? '' : 'disabled'}>${d.name} 짓기 · ${MG.costText(d.cost)}</button>`).join(' ') : '<span class="muted small">빈자리 없음</span>';
  return `<section class="card"><h3>성 밖 들판 ${S.fields.length} / ${MG.FIELD_SLOTS} <span class="muted">(적이 부수지 않아요)</span></h3>
    ${list}<div class="fieldAdd">${add}</div>
    <div class="muted small">가을엔 식량 2배, 겨울엔 식량 0·목재 절반</div></section>`;
}

// ---------- 장수 ----------
function classBlock(g) {
  const C = MG.CLASSES[g.type];
  if (MG.canClass(g)) {
    return `<div class="choose"><div class="hint">Lv.5 전직을 고르세요</div>
      ${['A', 'B'].map(k => `<button data-cls="${g.id},${k}"><b>${C[k].name}</b><span>${C[k].desc}</span></button>`).join('')}</div>`;
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
  const refill = (g.type === 'mage' && !MG.bLevel('tower')) || (g.type === 'priest' && !MG.bLevel('temple'))
    ? `<div class="warn small">${g.type === 'mage' ? '마법탑' : '사원'}이 있어야 병사를 보충할 수 있어요</div>` : '';
  if (g.dead) {
    return `<div class="gen dead"><div class="gtop"><b>${g.name}</b><span class="danger">전사</span></div>
      <div class="muted">${MG.genTitle(g)} · Lv.${g.level}</div>
      <div class="muted small">남은 병사 ${g.healthy}명은 지휘관 없이 출전해요.</div></div>`;
  }
  const status = g.injured ? `<span class="warn">부상 · ${g.injured}개월 남음</span>` : '<span class="ok">건강</span>';
  return `<div class="gen ${g.injured ? 'hurt' : ''}">
    <div class="gtop"><b>${g.name}</b>${status}</div>
    <div class="muted">${MG.genTitle(g)} · 통솔 ${MG.genLead(g)}</div>
    <div class="lv"><span>Lv.${g.level}</span><div class="bar"><div style="width:${pct(g.xp, need)}%;background:#6aa8ff"></div></div>
      <span class="small muted">${need ? `${Math.floor(g.xp)} / ${need}` : '최고 레벨'}</span></div>
    <div class="small">병사 ${g.healthy} / ${cap}${g.wounded.length ? ` · <span class="warn">부상 ${g.wounded.length}명 (${woundCounts(g.wounded)})</span>` : ''}</div>
    ${refill}${classBlock(g)}${weaponBlock(g)}
    <label class="tog"><input type="checkbox" data-deploy="${g.id}" ${g.deploy ? 'checked' : ''}>
      ${g.injured ? '<span class="warn">부상 중에도 출전 (체력 절반, 쓰러지면 전사)</span>' : '장수 출전'}</label>
    ${g.wounded.length ? `<label class="tog"><input type="checkbox" data-mob="${g.id}" ${g.mobilize ? 'checked' : ''}>
      <span class="warn">부상병 ${g.wounded.length}명 동원 (체력 감소, 또 쓰러지면 사망 위험 큼)</span></label>` : ''}
  </div>`;
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
    <div class="campMain">${mapBlock()}<div class="campSide">${actionsBlock()}${fieldsBlock()}</div></div>
    <h2>장수</h2>
    <section class="gens">${S.generals.map(genCard).join('')}</section>
    <div class="campRow">
      <section class="card"><h3>성주 직할 병력 (성벽 위)</h3>
        <div class="stat"><span>궁수</span><b>${S.garrison.archer}</b></div>
        <div class="stat"><span>보병</span><b>${S.garrison.infantry}</b></div>
        <div class="muted small">모집하면 부족한 부대부터 채워요.</div></section>
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
  </div>`;
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
    run(a === 'repair' ? MG.actRepair() : a === 'recruit' ? MG.actRecruit() : a === 'train' ? MG.actTrain() : a === 'scout' ? MG.actScout() : MG.actCraft());
  });
  q('[data-field]').forEach(b => b.onclick = () => run(MG.actField(b.dataset.field)));
  q('[data-fup]').forEach(b => b.onclick = () => run(MG.actFieldUpgrade(S.fields[+b.dataset.fup])));
  q('[data-cls]').forEach(b => b.onclick = () => { const [id, k] = b.dataset.cls.split(','); MG.chooseClass(gen(id), k); render(); });
  q('[data-adv]').forEach(b => b.onclick = () => { MG.advanceClass(gen(b.dataset.adv)); render(); });
  q('[data-unequip]').forEach(b => b.onclick = () => { MG.unequip(gen(b.dataset.unequip)); render(); });
  q('[data-equip]').forEach(s => s.onchange = () => { if (s.value) MG.equip(gen(s.dataset.equip), +s.value); render(); });
  q('[data-deploy]').forEach(c => c.onchange = () => { gen(c.dataset.deploy).deploy = c.checked; MG.saveCampaign(); render(); });
  q('[data-mob]').forEach(c => c.onchange = () => { gen(c.dataset.mob).mobilize = c.checked; MG.saveCampaign(); render(); });
  const go = $('goBtn'), end = $('endBtn'), skip = $('skipBtn');
  if (go) go.onclick = () => { resetArmed = false; sel = null; msg = ''; MG.startNextBattle(); };
  if (end) end.onclick = () => { sel = null; msg = ''; MG.endMonth(); render(); window.scrollTo(0, 0); };
  if (skip) skip.onclick = () => {
    sel = null; msg = '';
    const all = [];
    let n = 0;
    while (!MG.isAttackMonth() && n++ < 24) all.push(...MG.endMonth());
    MG.S.report = [`${n}개월이 지났어요.`, ...all.filter(r => !r.startsWith('수입')).slice(-6)];
    MG.saveCampaign();
    render(); window.scrollTo(0, 0);
  };
  $('resetBtn').onclick = () => {
    if (!resetArmed) { resetArmed = true; render(); return; }
    resetArmed = false; sel = null; msg = ''; MG.resetCampaign(); render();
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

MG.startNextBattle = () => {
  MG.createBattle(MG.S.level, MG.buildRoster());
  MG.mode = 'battle';
  el.classList.add('hidden');
  $('app').classList.remove('hidden');
  window.dispatchEvent(new Event('resize'));
  MG.resetView();
  MG.ui.refresh(true);
};
})();
