// 사이드바와 결과 화면
(() => {
const $ = id => document.getElementById(id);
const ui = MG.ui = {};
let lastHtml = {};

// 내용이 바뀔 때만 다시 그려서 버튼 클릭이 끊기지 않게 한다
function setHtml(id, html) {
  if (lastHtml[id] === html) return false;
  lastHtml[id] = html;
  $(id).innerHTML = html;
  return true;
}

function bar(label, cur, max) {
  const p = Math.max(0, cur / max);
  const color = p > 0.5 ? '#6bdc8f' : p > 0.25 ? '#e6b450' : '#ff6b6b';
  return `<div class="barLabel"><span>${label}</span><span>${cur <= 0 ? '무너짐' : Math.ceil(cur) + ' / ' + max}</span></div>
    <div class="bar"><div style="width:${p * 100}%;background:${color}"></div></div>`;
}

function composition(B) {
  const sum = {};
  for (const g of B.waves) sum[g.type] = (sum[g.type] || 0) + g.count;
  return Object.entries(sum).map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${n}`).join(', ');
}

ui.refresh = function (force) {
  const B = MG.B;
  if (MG.mode !== 'battle' || !B) return;
  if (force) lastHtml = {};
  const phaseName = { prep: '전투 준비', battle: '전투 중', result: '전투 종료' }[B.phase];
  if (B.conquest) refreshConquest(B, phaseName);
  else refreshDefense(B, phaseName);
  refreshSquads(B);
  refreshItems(B);

  $('startBtn').style.display = B.phase === 'prep' ? '' : 'none';
  $('pauseBtn').disabled = B.phase !== 'battle';
  $('pauseBtn').innerHTML = B.paused ? `${MG.ic('player-play')} 계속` : `${MG.ic('player-pause')} 일시정지`;
  $('speedBtn').innerHTML = `${MG.ic('player-track-next')} x${B.speed}`;
  $('retreatBtn').classList.toggle('hidden', !(B.conquest && B.phase === 'battle'));

  const res = $('result');
  if (B.phase === 'result' && res.classList.contains('hidden')) showResult(B);
};

function refreshDefense(B, phaseName) {
  const next = B.spawnQueue[0];
  $('wallsTitle').innerHTML = `${MG.ic('wall')} 성벽과 본성`;
  setHtml('statusCard', `<h3>${phaseName} · 전투 ${B.level}${B.level % 5 === 0 ? ' (대습격)' : ''}</h3>
    <div class="stat"><span>${MG.ic('clock')} 경과 시간</span><b>${Math.floor(B.time)}초</b></div>
    <div class="stat"><span>${MG.ic('swords')} 습격</span><b>${B.wave} / 3파</b></div>
    <div class="stat"><span>${MG.ic('skull')} 전장의 적</span><b>${B.enemies.length}</b></div>
    <div class="stat"><span>${MG.ic('target')} 처치</span><b>${B.stats.kills}</b></div>
    ${next && B.phase === 'battle' && next.wave > B.wave ? `<div class="stat"><span>${MG.ic('hourglass')} 다음 습격까지</span><b>${Math.ceil(next.t - B.time)}초</b></div>` : ''}
    <div class="stat"><span>${MG.ic('crown')} 성주</span><b style="color:${B.lordDead ? '#ff6b6b' : '#6bdc8f'}">${B.roster.lord.away ? '정벌 중' : B.roster.lord.sitOut ? '부상으로 불참' : B.lordDead ? '쓰러짐' : B.roster.lord.injured ? '부상 중 출전' : '생존'}</b></div>`);

  // 한 면을 성벽 조각 4개 + 가운데 성문으로 보여준다
  const piece = w => {
    const p = Math.max(0, w.hp / w.max);
    const color = w.hp <= 0 ? '#5a2323' : p > 0.5 ? '#6bdc8f' : p > 0.25 ? '#e6b450' : '#ff6b6b';
    return `<div class="piece ${w.gate ? 'gate' : ''}" title="${w.gate ? '성문' : '성벽'} ${Math.max(0, Math.ceil(w.hp))} / ${w.max}">
      <div style="height:${w.hp <= 0 ? 100 : p * 100}%;background:${color}"></div></div>`;
  };
  setHtml('walls', MG.SIDES.map(s => `<div class="wallRow"><span>${MG.SIDE_NAME[s]}</span>${B.wallBySide[s].map(piece).join('')}</div>`).join('')
    + '<div class="wallLegend">가운데 갈색 칸이 성문 · 빨간 칸은 무너짐</div>' + bar('본성', B.keep.hp, B.keep.max));

  $('scoutCard').classList.toggle('hidden', B.phase !== 'prep');
  setHtml('scoutCard', `<h3>정찰 보고</h3>
    <div>${B.dirs.map(d => `<span class="dirTag">${MG.SIDE_NAME[d]}</span>`).join('')}쪽에서 습격이 예상돼요.</div>
    <div style="color:var(--muted);margin-top:4px">${composition(B)}</div>`);

  $('garrisonCard').classList.toggle('hidden', B.phase !== 'prep');
  const pool = B.garrisonPool;
  if (setHtml('garrisonCard', `<h3>성주 직할 배치 (성벽 위)</h3>
    <table class="gar"><tr><td></td><td>궁수</td><td>보병</td></tr>
    ${MG.SIDES.map(s => `<tr><td>${MG.SIDE_NAME[s]}</td>
      <td><button data-g="${s},archer,-1">−</button> ${B.garrison[s].archer} <button data-g="${s},archer,1">+</button></td>
      <td><button data-g="${s},infantry,-1">−</button> ${B.garrison[s].infantry} <button data-g="${s},infantry,1">+</button></td></tr>`).join('')}
    <tr><td style="color:var(--muted)">대기</td><td>${pool.archer}</td><td>${pool.infantry}</td></tr></table>`)) {
    $('garrisonCard').querySelectorAll('button[data-g]').forEach(b => {
      b.onclick = () => { const [s, k, d] = b.dataset.g.split(','); MG.moveGarrison(s, k, +d); ui.refresh(); };
    });
  }
}

// 정벌 전투: 적 본진·보스·망루 상태
function refreshConquest(B, phaseName) {
  const O = B.outpost, boss = B.boss, towers = B.enemies.filter(e => e.struct === 'tower').length;
  $('wallsTitle').innerHTML = `${MG.ic('building-fortress')} 적 진지`;
  setHtml('statusCard', `<h3>${phaseName} · ${O.name} 정벌</h3>
    <div class="stat"><span>${MG.ic('clock')} 경과 시간</span><b>${Math.floor(B.time)}초</b></div>
    <div class="stat"><span>${MG.ic('skull')} 전장의 적</span><b>${B.enemies.filter(e => !e.struct).length}</b></div>
    <div class="stat"><span>${MG.ic('target')} 처치</span><b>${B.stats.kills}</b></div>
    ${!B.bossDead && B.phase === 'battle' ? `<div class="stat"><span>${MG.ic('hourglass')} 다음 증원까지</span><b>${Math.ceil(B.reinfT)}초</b></div>` : ''}
    <div class="stat"><span>${MG.ic('crown')} 성주</span><b style="color:${B.lordDead ? '#ff6b6b' : '#6bdc8f'}">${B.roster.lord.away ? '성에 남음' : B.lordDead ? '쓰러짐' : '친정 중'}</b></div>`);
  setHtml('walls', bar('적 본진', B.hq.dead ? 0 : B.hq.hp, B.hq.max)
    + bar(boss.T.name, boss.dead ? 0 : boss.hp, boss.max)
    + `<div class="stat"><span>${MG.ic('building-lighthouse')} 남은 망루</span><b>${towers}</b></div>
    <div class="wallLegend">본진을 부수면 이겨요. 보스를 먼저 쓰러뜨리면 증원이 끊기고 적의 기세가 꺾이며, 전설 무기를 얻어요.</div>`);
  $('scoutCard').classList.toggle('hidden', B.phase !== 'prep');
  setHtml('scoutCard', `<h3>정찰 보고</h3>
    <div>${O.bossDesc}</div>
    <div style="color:var(--muted);margin-top:4px">${O.garrison.map(([t, n]) => `${MG.ENEMY_TYPES[t].name} 약 ${Math.round(n * (B.roster.fortMul || 1))}`).join(', ')} · 망루 ${O.towers}</div>`);
  $('garrisonCard').classList.add('hidden');
}

// 소모품: 준비 단계에서는 챙길 것을 고르고(최대 3종), 전투 중에는 쓴다
function refreshItems(B) {
  const kinds = Object.keys(MG.ITEMS).filter(k => (B.items[k] || 0) > 0 && MG.itemUsable(k));
  const card = $('itemCard');
  card.classList.toggle('hidden', !kinds.length || B.phase === 'result');
  const html = B.phase === 'prep'
    ? `<h3>소모품 챙기기 (${B.carry.size} / ${MG.itemCarry()}종)</h3>${kinds.map(k => `<label class="tog"><input type="checkbox" data-carry="${k}" ${B.carry.has(k) ? 'checked' : ''}
        ${!B.carry.has(k) && B.carry.size >= MG.itemCarry() ? 'disabled' : ''}> ${MG.ic(MG.ICONS.item[k])} ${MG.ITEMS[k].name} ×${B.items[k]} <span class="muted small">${MG.ITEMS[k].desc}</span></label>`).join('')}`
    : `<h3>${MG.ic('gift')} 소모품</h3><div class="itemBtns">${[...B.carry].map(k => `<button class="mini" data-useitem="${k}" ${MG.itemLeft(k) > 0 ? '' : 'disabled'} title="${MG.ITEMS[k].desc}">
        ${MG.ic(MG.ICONS.item[k])} ${MG.ITEMS[k].name} <b>${MG.itemLeft(k)}</b></button>`).join('') || '<span class="muted small">챙겨 온 소모품이 없어요</span>'}</div>
        ${B.drumT > 0 ? `<div class="ok small">전투 북: ${Math.ceil(B.drumT)}초</div>` : ''}`;
  if (setHtml('itemCard', html)) {
    card.querySelectorAll('[data-carry]').forEach(c => c.onchange = () => { MG.toggleCarry(c.dataset.carry); ui.refresh(true); });
    card.querySelectorAll('[data-useitem]').forEach(b => b.onmousedown = ev => { ev.preventDefault(); MG.beginItem(b.dataset.useitem); });
  }
}

// 스킬 버튼: 준비됨 / 남은 쿨 / 지휘관 없음
function skillBtn(sq) {
  const K = MG.skillOf(sq), st = MG.skillState(sq);
  if (!K || !st) return '';
  const ico = MG.ic(MG.ICONS.skill[sq.isLord ? 'guard' : sq.type]);
  const label = st.ok ? `${ico} ${K.name} <span class="key">Q</span>` : `${ico} ${K.name} · ${st.why}`;
  return `<button class="mini skillBtn ${st.ok ? 'ready' : ''}" data-skill="${sq.id}" ${st.ok && B_().phase === 'battle' ? '' : 'disabled'} title="${K.desc}${sq.cls && K[sq.cls] ? ` · 강화: ${K[sq.cls]}` : ''}">${label}</button>`;
}
const B_ = () => MG.B;

function refreshSquads(B) {
  if (setHtml('squads', B.squads.map(sq => {
    const T = MG.UNIT_TYPES[sq.type];
    const lead = sq.general ? (sq.general.dead ? ' · 지휘관 쓰러짐' : '') : ' · 지휘관 없음';
    const sub = sq.isGarrison ? '궁수·보병 혼성' : `${sq.title || (T ? T.name : '')}${sq.isLord ? '' : lead}`;
    const hp = sq.soldiers.reduce((a, s) => a + s.hp, 0), max = sq.soldiers.reduce((a, s) => a + s.max, 0);
    return `<div class="squad ${B.selected.has(sq) ? 'sel' : ''} ${sq.leaderDown ? 'down' : ''}" data-id="${sq.id}">
      <div class="top"><span class="unitBadge sm u-${sq.type}">${MG.icUnit(sq.isGarrison ? 'garrison' : sq.type)}</span><span class="sqName">${sq.name.replace(' 부대', '')}</span><span>${MG.ic('users')} ${sq.soldiers.length}/${sq.initial}</span></div>
      <div class="sub">${sub}${sq.isGarrison || sq.isLord ? '' : ` ${MG.vetBadge(sq.vet)}`}${sq.shieldT > 0 ? ` · ${MG.ic('shield-half')}방패벽` : ''}</div>
      <div class="bar thin" title="체력 ${Math.round(hp / max * 100)}%"><div style="width:${hp / max * 100}%;background:${hp / max > 0.5 ? '#6bdc8f' : hp / max > 0.25 ? '#e6b450' : '#ff6b6b'}"></div></div>${skillBtn(sq)}</div>`;
  }).join('') || '<div style="color:var(--muted)">남은 부대가 없어요.</div>')) {
    $('squads').querySelectorAll('[data-skill]').forEach(b => b.onmousedown = ev => {
      ev.preventDefault(); ev.stopPropagation();
      const sq = B.squads.find(q => q.id === +b.dataset.skill);
      if (sq) MG.beginSkill([sq]);
    });
    $('squads').querySelectorAll('[data-skill]').forEach(b => b.onclick = ev => ev.stopPropagation());
    $('squads').querySelectorAll('.squad').forEach(el => {
      el.onclick = ev => {
        const sq = B.squads.find(q => q.id === +el.dataset.id);
        if (!sq) return;
        if (!ev.shiftKey) B.selected.clear();
        B.selected.add(sq);
        ui.refresh(true);
      };
    });
  }
}

// 장수 줄과 부상 표는 습격·정벌 결과 화면이 같이 쓴다
function genTable(s) {
  return s.gens.map(g => `<tr><td>${g.name}</td><td>${g.status === '전사' ? '—' : `+${g.xp} 경험치`}</td>
    <td>${g.to > g.from ? `<b style="color:var(--ok)">Lv.${g.from} → ${g.to}</b>` : `Lv.${g.to}`}${g.vetUp ? ` <span class="ok small">병사 ${g.vetUp}</span>` : ''}</td>
    <td style="color:${g.status === '생존' ? 'var(--ok)' : g.status === '전사' ? 'var(--danger)' : 'var(--accent)'}">${g.status}</td></tr>`).join('');
}
const woundTable = s => `<table>
      <tr><th>${MG.ic('bandage')} 경상 — 병원에서 1개월</th><td>${s.wound.light}명</td></tr>
      <tr><th>${MG.ic('first-aid-kit')} 중상 — 병원에서 3~6개월</th><td>${s.wound.heavy}명</td></tr>
      <tr><th>${MG.ic('grave-2')} 사망</th><td>${s.wound.dead}명</td></tr>
    </table>`;

function showConquestResult(B) {
  const r = B.result, s = r.summary, S = MG.S, O = B.outpost;
  $('resTitle').innerHTML = r.win ? `${MG.ic('trophy')} ${O.name} ${O.final ? '함락' : '정벌'}!` : B.retreated ? `${MG.ic('flag-off')} 퇴각했어요` : `${MG.ic('skull')} 정벌 실패…`;
  const left = B.squads.reduce((a, q) => a + q.soldiers.length, 0);
  $('resBody').innerHTML = `
    <table>
      <tr><th>${MG.ic('clock')} 싸운 시간</th><td>${Math.floor(r.time)}초</td></tr>
      <tr><th>${MG.ic('skull')} 처치한 적</th><td>${B.stats.kills}</td></tr>
      <tr><th>${O.boss ? MG.ENEMY_TYPES[O.boss].name : '보스'}</th><td>${B.bossDead ? '<b style="color:var(--ok)">쓰러뜨림</b>' : '살아 있음'}</td></tr>
      <tr><th>${MG.ic('users')} 남은 병력</th><td>${left}명</td></tr>
    </table>
    <h3 style="margin:0 0 4px;font-size:14px">장수</h3>
    <table>${genTable(s) || '<tr><td>출전한 장수가 없어요.</td></tr>'}</table>
    ${s.lord ? `<p>성주 ${s.lord.name}: +${s.lord.xp} 경험치${s.lord.to > s.lord.from ? ` · <b style="color:var(--ok)">Lv.${s.lord.from} → ${s.lord.to}</b> (자동으로 ${s.lord.auto.join('·')} +1, 분배할 점수 +${s.lord.to - s.lord.from})` : ` · Lv.${s.lord.to}`}</p>` : ''}
    <h3 style="margin:0 0 4px;font-size:14px">쓰러진 병사 (전투 후 판정)</h3>
    ${woundTable(s)}
    ${s.lordDied ? `<p style="color:#ff6b6b">${s.lordDied.join(' ')}${S.over ? '' : ' 내정 화면에서 후계자를 골라요.'}</p>` : ''}
    ${s.lordHurt ? `<p style="color:#ffb36b">${MG.ic('bandage')} 성주가 쓰러져 ${s.lordHurt}개월 부상을 입었어요. 부상 중에 또 쓰러지면 전사해요.</p>` : ''}
    ${r.win && !O.final ? `<p>거점을 얻었어요: <b style="color:var(--ok)">${O.reward}</b></p>` : ''}
    ${s.gold ? `<p>전리품: 골드 <b style="color:var(--accent)">+${s.gold}</b></p>` : ''}
    ${s.weapon ? `<p>전리품: <b style="color:${MG.WEAPON_GRADES[s.weapon.grade].color}">[${MG.WEAPON_GRADES[s.weapon.grade].name}] ${s.weapon.name}</b>
      <span style="color:var(--muted)">(${MG.UNIT_TYPES[s.weapon.type].name}용 · ${MG.weaponDesc(s.weapon)})</span></p>` : ''}
    ${s.relic ? `<p>전리품: <b style="color:${MG.RELIC_GRADES[MG.RELICS[s.relic].grade].color}">유물 ${MG.RELICS[s.relic].name}</b> <span style="color:var(--muted)">(${MG.RELICS[s.relic].desc})</span></p>` : ''}
    ${s.ending ? '<p style="color:var(--accent)"><b>검은 성채가 무너졌어요!</b> 내정 화면으로 돌아가면 엔딩을 봐요.</p>' : ''}
    ${s.retaliation ? `<p style="color:#ffb36b">거점을 잃은 마물들이 복수하러 와요. 다음 습격이 크게(×${s.retaliation}) 늦어도 2개월 안에 와요.</p>` : ''}
    ${!r.win ? `<p class="muted">${O.name}의 수비가 다음 시도 때 +${Math.round(MG.CONQUEST_FAIL_MUL * 100)}% 강해져요.</p>` : ''}
    <p class="muted">정벌군은 ${S.march && S.march.left > 0 ? `${S.march.left}개월 뒤` : '다음 달'} 성으로 돌아와요.</p>
    ${S.over ? '<p style="color:#ff6b6b">가문이 끊겨 캠페인이 끝났어요.</p>' : ''}`;
  $('contBtn').textContent = S.over ? '계보와 명성 보기' : '정비 화면으로';
  $('result').classList.remove('hidden');
}

function showResult(B) {
  if (B.conquest) { showConquestResult(B); return; }
  const r = B.result;
  $('resTitle').innerHTML = r.win ? `${MG.ic('trophy')} 방어 성공!` : `${MG.ic('skull')} 본성 함락…`;
  const broken = B.walls.filter(w => w.hp <= 0);
  const breached = MG.SIDES.map(s => {
    const b = broken.filter(w => w.side === s);
    if (!b.length) return null;
    const gate = b.some(w => w.gate), walls = b.filter(w => !w.gate).length;
    return `${MG.SIDE_NAME[s]}(${[walls ? `성벽 ${walls}조각` : '', gate ? '성문' : ''].filter(Boolean).join(', ')})`;
  }).filter(Boolean);
  const left = B.squads.reduce((a, q) => a + q.soldiers.length, 0);
  const s = r.summary, S = MG.S;
  const genRows = s.gens.map(g => `<tr><td>${g.name}</td><td>${g.status === '전사' ? '—' : `+${g.xp} 경험치`}</td>
    <td>${g.to > g.from ? `<b style="color:var(--ok)">Lv.${g.from} → ${g.to}</b>` : `Lv.${g.to}`}${g.vetUp ? ` <span class="ok small">병사 ${g.vetUp}</span>` : ''}</td>
    <td style="color:${g.status === '생존' ? 'var(--ok)' : g.status === '전사' ? 'var(--danger)' : 'var(--accent)'}">${g.status}</td></tr>`).join('');
  $('resBody').innerHTML = `
    <table>
      <tr><th>${MG.ic('clock')} 버틴 시간</th><td>${Math.floor(r.time)}초</td></tr>
      <tr><th>${MG.ic('skull')} 처치한 적</th><td>${B.stats.kills} / ${B.stats.spawned}</td></tr>
      <tr><th>${MG.ic('wall')} 부서진 곳</th><td>${breached.length ? breached.join(' · ') : '없음'}</td></tr>
      <tr><th>${MG.ic('users')} 남은 병력</th><td>${left}명</td></tr>
    </table>
    <h3 style="margin:0 0 4px;font-size:14px">장수</h3>
    <table>${genRows || '<tr><td>출전한 장수가 없어요.</td></tr>'}</table>
    ${s.lord ? `<p>성주 ${s.lord.name}: +${s.lord.xp} 경험치${s.lord.to > s.lord.from ? ` · <b style="color:var(--ok)">Lv.${s.lord.from} → ${s.lord.to}</b> (자동으로 ${s.lord.auto.join('·')} +1, 분배할 점수 +${s.lord.to - s.lord.from})` : ` · Lv.${s.lord.to}`}</p>` : ''}
    <h3 style="margin:0 0 4px;font-size:14px">쓰러진 병사 (전투 후 판정)</h3>
    <table>
      <tr><th>${MG.ic('bandage')} 경상 — 병원에서 1개월</th><td>${s.wound.light}명</td></tr>
      <tr><th>${MG.ic('first-aid-kit')} 중상 — 병원에서 3~6개월</th><td>${s.wound.heavy}명</td></tr>
      <tr><th>${MG.ic('grave-2')} 사망</th><td>${s.wound.dead}명</td></tr>
    </table>
    ${s.ruined.length ? `<p style="color:#ffb36b">부서진 건물: ${s.ruined.join(', ')}${s.lostPop ? ` · 주민 ${s.lostPop}명이 죽었어요` : ''}${s.homeless ? ` · ${s.homeless}명이 집을 잃었어요 (수리하지 않으면 매달 1/4씩 떠나요)` : ''}. 수리해야 다시 쓸 수 있어요.</p>` : ''}
    ${s.lordDied ? `<p style="color:#ff6b6b">${s.lordDied.join(' ')}${S.over ? '' : ' 내정 화면에서 후계자를 골라요.'}</p>` : ''}
    ${s.lordHurt ? `<p style="color:#ffb36b">${MG.ic('bandage')} 성주가 쓰러져 ${s.lordHurt}개월 부상을 입었어요. 부상 중에 또 쓰러지면 전사해요.</p>` : ''}
    ${s.gold ? `<p>전리품: 골드 <b style="color:var(--accent)">+${s.gold}</b></p>` : ''}
    ${s.weapon ? `<p>전리품: <b style="color:${MG.WEAPON_GRADES[s.weapon.grade].color}">[${MG.WEAPON_GRADES[s.weapon.grade].name}] ${s.weapon.name}</b>
      <span style="color:var(--muted)">(${MG.UNIT_TYPES[s.weapon.type].name}용 · ${MG.weaponDesc(s.weapon)})</span></p>` : ''}
    ${s.relic ? `<p>전리품: <b style="color:${MG.RELIC_GRADES[MG.RELICS[s.relic].grade].color}">유물 ${MG.RELICS[s.relic].name}</b> <span style="color:var(--muted)">(${MG.RELICS[s.relic].desc})</span></p>` : ''}
    ${s.pick ? `<p style="color:var(--accent)">정비 화면에서 <b>보상 카드 3장 중 하나</b>를 골라요.</p>` : ''}
    ${S.over ? `<p style="color:#ff6b6b">${S.overReason === '가문 단절' ? '가문이 끊겨' : '본성이 함락되어'} 캠페인이 끝났어요. ${S.stats.wins}번의 전투를 버텼어요.</p>` : ''}`;
  $('contBtn').textContent = S.over ? '계보와 명성 보기' : '정비 화면으로';
  $('result').classList.remove('hidden');
}

ui.togglePause = function () {
  const B = MG.B;
  if (B.phase !== 'battle') return;
  B.paused = !B.paused;
  ui.refresh();
};

$('startBtn').onclick = () => { MG.startBattle(); ui.refresh(true); };
$('pauseBtn').onclick = ui.togglePause;
$('speedBtn').onclick = () => { const B = MG.B; B.speed = B.speed === 1 ? 2 : B.speed === 2 ? 3 : 1; ui.refresh(); };
// 습격이 있던 달은 전투가 끝나야 지나간다
$('retreatBtn').onclick = () => MG.retreat();
$('contBtn').onclick = () => {
  // 끝났으면 내정 화면의 종료 창(계보·명성)으로 간다. 정벌 전투는 달이 지나지 않는다.
  if (!MG.S.over && !(MG.B && MG.B.conquest)) MG.endMonth();
  MG.enterCamp();
};
})();
