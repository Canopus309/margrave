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
  if (force) lastHtml = {};
  const phaseName = { prep: '전투 준비', battle: '전투 중', result: '전투 종료' }[B.phase];
  const next = B.spawnQueue[0];
  setHtml('statusCard', `<h3>${phaseName} · 전투 ${B.level}</h3>
    <div class="stat"><span>경과 시간</span><b>${Math.floor(B.time)}초</b></div>
    <div class="stat"><span>습격</span><b>${B.wave} / 3파</b></div>
    <div class="stat"><span>전장의 적</span><b>${B.enemies.length}</b></div>
    <div class="stat"><span>처치</span><b>${B.stats.kills}</b></div>
    ${next && B.phase === 'battle' && next.wave > B.wave ? `<div class="stat"><span>다음 습격까지</span><b>${Math.ceil(next.t - B.time)}초</b></div>` : ''}
    <div class="stat"><span>성주</span><b style="color:${B.lordDead ? '#ff6b6b' : '#6bdc8f'}">${B.lordDead ? '전사' : '생존'}</b></div>`);

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

  if (setHtml('squads', B.squads.map(sq => {
    const T = MG.UNIT_TYPES[sq.type];
    const sub = sq.isGarrison ? '궁수·보병 혼성' : `${T ? T.name : ''}${sq.leaderDown ? ' · 지휘관 쓰러짐' : ''}`;
    const hp = sq.soldiers.reduce((a, s) => a + s.hp, 0), max = sq.soldiers.reduce((a, s) => a + s.max, 0);
    return `<div class="squad ${B.selected.has(sq) ? 'sel' : ''} ${sq.leaderDown ? 'down' : ''}" data-id="${sq.id}">
      <div class="top"><span>${sq.name}</span><span>${sq.soldiers.length} / ${sq.initial}</span></div>
      <div class="sub">${sub} · 체력 ${Math.round(hp / max * 100)}%</div></div>`;
  }).join('') || '<div style="color:var(--muted)">남은 부대가 없어요.</div>')) {
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

  $('startBtn').style.display = B.phase === 'prep' ? '' : 'none';
  $('pauseBtn').disabled = B.phase !== 'battle';
  $('pauseBtn').textContent = B.paused ? '계속' : '일시정지';
  $('speedBtn').textContent = '속도 x' + B.speed;

  const res = $('result');
  if (B.phase === 'result' && res.classList.contains('hidden')) showResult(B);
};

function showResult(B) {
  const r = B.result;
  $('resTitle').textContent = r.win ? '방어 성공!' : '본성 함락…';
  const broken = B.walls.filter(w => w.hp <= 0);
  const breached = MG.SIDES.map(s => {
    const b = broken.filter(w => w.side === s);
    if (!b.length) return null;
    const gate = b.some(w => w.gate), walls = b.filter(w => !w.gate).length;
    return `${MG.SIDE_NAME[s]}(${[walls ? `성벽 ${walls}조각` : '', gate ? '성문' : ''].filter(Boolean).join(', ')})`;
  }).filter(Boolean);
  const left = B.squads.reduce((a, q) => a + q.soldiers.length, 0);
  $('resBody').innerHTML = `
    <table>
      <tr><th>버틴 시간</th><td>${Math.floor(r.time)}초</td></tr>
      <tr><th>처치한 적</th><td>${B.stats.kills} / ${B.stats.spawned}</td></tr>
      <tr><th>부서진 곳</th><td>${breached.length ? breached.join(' · ') : '없음'}</td></tr>
      <tr><th>남은 병력</th><td>${left}명</td></tr>
    </table>
    <h3 style="margin:0 0 4px;font-size:14px">쓰러진 병사 (전투 후 판정)</h3>
    <table>
      <tr><th>경상 — 병원에서 1개월</th><td>${r.roll.light}명</td></tr>
      <tr><th>중상 — 병원에서 3~6개월</th><td>${r.roll.heavy}명</td></tr>
      <tr><th>사망</th><td>${r.roll.dead}명</td></tr>
      <tr><th>부상당한 장수</th><td>${r.generals.length ? r.generals.join(', ') : '없음'}</td></tr>
    </table>
    ${r.lordDead ? '<p style="color:#ff6b6b">성주가 전사했어요. 후계는 2단계에서 구현돼요.</p>' : ''}`;
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
$('retryBtn').onclick = () => MG.newBattle(MG.B.level);
$('nextBtn').onclick = () => MG.newBattle(MG.B.level + 1);
})();
