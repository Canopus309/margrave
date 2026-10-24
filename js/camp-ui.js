// 정비 화면: 전투 사이에 장수 전직·무기·출전, 병원, 보유 무기를 다룬다
(() => {
const $ = id => document.getElementById(id);
const el = $('camp');
let resetArmed = false;

const pct = (a, b) => (b ? Math.max(0, Math.min(100, a / b * 100)) : 0);
const gradeTag = w => {
  const g = MG.WEAPON_GRADES[w.grade];
  return `<b style="color:${g.color}">[${g.name}] ${w.name}</b>`;
};
const woundCounts = list => {
  const light = list.filter(w => w.sev === 'light').length;
  return `경상 ${light} · 중상 ${list.length - light}`;
};

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
  const sel = usable.length
    ? `<select data-equip="${g.id}"><option value="">보유 무기로 바꾸기 (${usable.length})</option>
        ${usable.map(w => `<option value="${w.id}">[${MG.WEAPON_GRADES[w.grade].name}] ${w.name} — ${MG.weaponDesc(w)}</option>`).join('')}</select>`
    : '';
  return `<div class="weapon">${cur}${sel}</div>`;
}

function genCard(g) {
  const cap = MG.genCap(g), need = g.level < MG.MAX_LEVEL ? MG.xpToNext(g.level) : 0;
  if (g.dead) {
    return `<div class="gen dead"><div class="gtop"><b>${g.name}</b><span class="danger">전사</span></div>
      <div class="muted">${MG.genTitle(g)} · Lv.${g.level}</div>
      <div class="muted small">남은 병사 ${g.healthy}명은 지휘관 없이 출전해요.</div></div>`;
  }
  const status = g.injured ? `<span class="warn">부상 · ${g.injured}전투 남음</span>` : '<span class="ok">건강</span>';
  return `<div class="gen ${g.injured ? 'hurt' : ''}">
    <div class="gtop"><b>${g.name}</b>${status}</div>
    <div class="muted">${MG.genTitle(g)} · 통솔 ${MG.genLead(g)}</div>
    <div class="lv"><span>Lv.${g.level}</span><div class="bar"><div style="width:${pct(g.xp, need)}%;background:#6aa8ff"></div></div>
      <span class="small muted">${need ? `${Math.floor(g.xp)} / ${need}` : '최고 레벨'}</span></div>
    <div class="small">병사 ${g.healthy} / ${cap}${g.wounded.length ? ` · <span class="warn">부상 ${g.wounded.length}명 (${woundCounts(g.wounded)})</span>` : ''}</div>
    ${classBlock(g)}
    ${weaponBlock(g)}
    <label class="tog"><input type="checkbox" data-deploy="${g.id}" ${g.deploy ? 'checked' : ''}>
      ${g.injured ? '<span class="warn">부상 중에도 출전 (체력 절반, 쓰러지면 전사)</span>' : '장수 출전'}</label>
    ${g.wounded.length ? `<label class="tog"><input type="checkbox" data-mob="${g.id}" ${g.mobilize ? 'checked' : ''}>
      <span class="warn">부상병 ${g.wounded.length}명 동원 (체력 감소, 또 쓰러지면 사망 위험 큼)</span></label>` : ''}
  </div>`;
}

function hospitalBlock() {
  const S = MG.S, list = MG.patients(), over = Math.max(0, list.length - MG.HOSPITAL_CAP);
  const lines = [];
  for (const g of S.generals) if (!g.dead && g.injured) lines.push(`<li>장수 ${g.name} — ${g.injured}전투 남음</li>`);
  for (const g of S.generals) if (!g.dead && g.wounded.length) lines.push(`<li>${g.name} 부대 ${g.wounded.length}명 (${woundCounts(g.wounded)})</li>`);
  if (S.garrison.wounded.length) lines.push(`<li>직할 병력 ${S.garrison.wounded.length}명 (${woundCounts(S.garrison.wounded)})</li>`);
  return `<h3>병원 ${list.length} / ${MG.HOSPITAL_CAP}</h3>
    <div class="bar"><div style="width:${pct(list.length, MG.HOSPITAL_CAP)}%;background:${over ? '#ff6b6b' : '#6bdc8f'}"></div></div>
    ${over ? `<div class="danger small">수용 인원을 넘은 ${over}명은 회복이 멈춰 있어요.</div>` : ''}
    <ul class="small">${lines.join('') || '<li class="muted">비어 있어요</li>'}</ul>`;
}

function render() {
  const S = MG.S;
  const year = 1 + Math.floor(S.month / 12), mon = S.month % 12 + 1;
  const inv = S.inventory.slice().sort((a, b) => Object.keys(MG.WEAPON_GRADES).indexOf(b.grade) - Object.keys(MG.WEAPON_GRADES).indexOf(a.grade));
  el.innerHTML = `<div class="campWrap">
    <header>
      <div><h1>${S.lord.name}의 변경 기지</h1><div class="muted">${year}년차 ${mon}월 · ${S.lord.gen}대 성주</div></div>
      <div class="next">다음 전투 <b>${S.level}</b>${S.level % 5 === 0 ? ' <span class="dirTag">대습격</span>' : ''}
        <button class="main" id="goBtn">전투 준비 →</button></div>
    </header>
    <section class="gens">${S.generals.map(genCard).join('')}</section>
    <div class="campRow">
      <section class="card"><h3>성주 직할 병력 (성벽 위)</h3>
        <div class="stat"><span>궁수</span><b>${S.garrison.archer}</b></div>
        <div class="stat"><span>보병</span><b>${S.garrison.infantry}</b></div>
        <div class="muted small">매달 신병 ${MG.RECRUITS_PER_MONTH}명이 부족한 부대부터 채워요.</div></section>
      <section class="card">${hospitalBlock()}</section>
      <section class="card"><h3>보유 무기 ${inv.length}</h3>
        <ul class="small inv">${inv.map(w => `<li>${gradeTag(w)} <span class="muted">${MG.UNIT_TYPES[w.type].name}용 · ${MG.weaponDesc(w)}</span></li>`).join('')
          || '<li class="muted">전투에서 이기면 무기를 얻어요</li>'}</ul></section>
      <section class="card"><h3>기록</h3>
        <div class="stat"><span>치른 전투</span><b>${S.stats.battles}</b></div>
        <div class="stat"><span>처치한 적</span><b>${S.stats.kills}</b></div>
        <div class="stat"><span>잃은 장수 / 병사</span><b>${S.stats.generalsLost} / ${S.stats.soldiersLost}</b></div>
        <button id="resetBtn" class="${resetArmed ? 'danger' : ''}">${resetArmed ? '정말 처음부터? 한 번 더 누르세요' : '캠페인 처음부터'}</button></section>
    </div>
  </div>`;
  bind();
}

function bind() {
  const S = MG.S, gen = id => S.generals.find(g => g.id === +id);
  el.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { const [id, k] = b.dataset.cls.split(','); MG.chooseClass(gen(id), k); render(); });
  el.querySelectorAll('[data-adv]').forEach(b => b.onclick = () => { MG.advanceClass(gen(b.dataset.adv)); render(); });
  el.querySelectorAll('[data-unequip]').forEach(b => b.onclick = () => { MG.unequip(gen(b.dataset.unequip)); render(); });
  el.querySelectorAll('[data-equip]').forEach(s => s.onchange = () => { if (s.value) MG.equip(gen(s.dataset.equip), +s.value); render(); });
  el.querySelectorAll('[data-deploy]').forEach(c => c.onchange = () => { gen(c.dataset.deploy).deploy = c.checked; MG.saveCampaign(); render(); });
  el.querySelectorAll('[data-mob]').forEach(c => c.onchange = () => { gen(c.dataset.mob).mobilize = c.checked; MG.saveCampaign(); render(); });
  $('goBtn').onclick = () => { resetArmed = false; MG.startNextBattle(); };
  $('resetBtn').onclick = () => {
    if (!resetArmed) { resetArmed = true; render(); return; }
    resetArmed = false; MG.resetCampaign(); render();
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
