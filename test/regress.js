// 회귀 검사: 난수를 고정하고 정해진 순서로 캠페인을 몇 년 돌려, 달마다 상태와 화면 HTML의 해시를 남긴다.
// 코드를 정리한 뒤 같은 씨앗으로 돌려 해시가 같으면 동작이 그대로라는 뜻이다. 저장소에는 쓰지 않는다.
// 쓰는 법(브라우저 콘솔): 스크립트를 불러온 뒤 await MG_REGRESS({ months: 36, seed: 7 })
window.MG_REGRESS = async (opts = {}) => {
  const months = opts.months || 36, seed = opts.seed || 7;
  let a = seed;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  // opts.html·opts.state: 일부러 바꾼 부분을 지우고 비교할 때 쓰는 거르개
  const fHtml = opts.html || (s => s), fState = opts.state || (s => s);
  const norm = s => fHtml(s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim());
  const stateHash = () => hash(JSON.stringify(fState(JSON.parse(JSON.stringify(MG.S)))));
  const keep = { random: Math.random, set: Storage.prototype.setItem, remove: Storage.prototype.removeItem, now: Date.now, fs: window.margraveFS };
  Math.random = rnd; Storage.prototype.setItem = () => {}; Storage.prototype.removeItem = () => {}; Date.now = () => 1700000000000; window.margraveFS = undefined;
  const steps = [], camp = document.getElementById('camp');
  const click = sel => { const b = camp.querySelector(sel); if (b) b.click(); return !!b; };
  const snapTabs = tag => {
    for (const t of ['castle', 'army', 'war', 'market', 'family']) { click(`[data-tab="${t}"]`); steps.push([`${tag}:${t}`, hash(norm(camp.innerHTML))]); }
    click('[data-tab="castle"]');
  };
  const modals = () => {
    for (let n = 0; n < 20; n++) {
      const S = MG.S;
      if (S.over) return;
      if (S.event) { for (let i = 0; i < 4 && S.event; i++) MG.resolveEvent(i); continue; }
      if (S.pendingPick) { MG.pickCard(0); continue; }
      if (S.cevent) { for (let i = 0; i < 4 && S.cevent; i++) MG.resolveChronicle(i); continue; }
      if (S.pendingSuccession) { const h = MG.heirs()[0]; MG.chooseHeir(h.kind, h.id); continue; }
      if (S.endingPending) { MG.continueReign(); continue; }
      return;
    }
  };
  const free = type => {
    const d = MG.BUILDINGS[type];
    for (let i = 0; i < MG.GRID.n; i++) for (let j = 0; j < MG.GRID.n; j++) if (MG.canPlace(type, i, j)) return [i, j];
    return d && null;
  };
  const out = [];
  const say = (k, v) => out.push(`${k}=${v == null ? '' : v}`);
  try {
    MG.newCampaign({ difficulty: opts.difficulty || 'hard' });
    MG.enterCamp();
    const want = ['market', 'hospital', 'training', 'barracks', 'house', 'tower', 'market', 'smithy', 'temple', 'workshop', 'house', 'stable'].filter(t => MG.BUILDINGS[t]);
    let wi = 0;
    for (let m = 0; m < months; m++) {
      modals();
      const S = MG.S;
      if (S.over) { steps.push(['over', S.overReason]); break; }
      const tag = `m${S.month}`;
      // 내정: 정해진 순서로 시도한다 (실패 메시지도 기록)
      if (wi < want.length) { const p = free(want[wi]); const why = p ? MG.actBuild(want[wi], p[0], p[1]) : 'no room'; say('build', why); if (!why) wi++; }
      for (const f of Object.keys(MG.FIELDS)) say('field', MG.actField(f));
      say('repair', MG.actRepair());
      for (const b of S.buildings.filter(b => b.hp < b.max)) say('rb', MG.actRepair('b:' + b.id));
      say('recruit', MG.actRecruit());
      for (const t of Object.keys(MG.UNIT_TYPES)) say('train', MG.startTraining(t, 999));
      say('assign', MG.assignAll());
      for (const t of ['infantry', 'archer']) say('gmove', MG.moveGarrisonReserve(t, 999, 'toGarrison'));
      say('scout', MG.actScout()); say('scout', MG.actScout());
      if (S.res.gold > 400) say('trade', MG.trade('wood', 50));
      say('item', MG.buyItem('firepot'));
      say('drill', MG.actTrain());
      say('craft', MG.actCraft());
      if (S.nextAttack.dirs[0]) say('fort', MG.actFort('wall', S.nextAttack.dirs[0]));
      if ((S.sites || []).length && m % 4 === 1) { const g = S.generals.find(MG.canExpedition); if (g) say('exp', MG.actExpedition(S.sites[0].id, g.id)); }
      if (!S.march && m % 12 === 8) {
        const id = Object.keys(MG.OUTPOSTS).find(k => !MG.hasOutpost(k) && !MG.OUTPOSTS[k].final);
        if (id) { say('cscout', MG.actConquestScout(id)); say('march', MG.actMarch(id, S.generals.filter(MG.canExpedition).map(g => g.id), false)); }
      }
      MG.enterCamp();
      snapTabs(tag);
      steps.push([`${tag}:acts`, hash(out.splice(0).join('|'))]);
      steps.push([`${tag}:state`, stateHash()]);
      // 전투 또는 한 달 마치기
      if (MG.mustFight()) {
        // 명령 없이 싸우는 봇이라 습격 때마다 직할 병력을 보태 오래 버티게 한다 (전후 비교만 하면 되므로)
        if (!MG.S.pendingConquest) { const k = 40 + 20 * MG.S.level; MG.S.garrison.archer += k; MG.S.garrison.infantry += k; }
        if (MG.S.pendingConquest) MG.startConquest(); else MG.startNextBattle();
        MG.ui.refresh(true);
        steps.push([`${tag}:prep`, hash(norm(document.getElementById('side').innerHTML))]);
        if (!MG.B.conquest) MG.B.keep.hp *= 4;
        MG.startBattle();
        let n = 0;
        // 정벌 전투에서 봇은 쳐들어가지 않으니, 진군 명령을 내리고 그래도 안 끝나면 퇴각한다
        if (MG.B.conquest) for (const sq of MG.B.squads) MG.orderAttackMove(sq, MG.B.hq ? MG.B.hq.x : 1500, MG.B.hq ? MG.B.hq.y : 800, { x: 1, y: 0 });
        while (MG.B.phase === 'battle' && n++ < 6000) MG.update(0.05);
        if (MG.B.phase === 'battle' && MG.B.conquest) { MG.retreat(); while (MG.B.phase === 'battle' && n++ < 8000) MG.update(0.05); }
        if (MG.B.phase === 'battle') { steps.push(['stuck', tag]); break; }
        MG.ui.refresh(true);
        steps.push([`${tag}:battle`, `${n}:${hash(JSON.stringify(MG.B.stats))}`]);
        steps.push([`${tag}:result`, hash(norm(document.getElementById('result').innerHTML))]);
        document.getElementById('contBtn').click();
      } else click('#endBtn');
      steps.push([`${tag}:end`, stateHash() + ':' + hash(norm(camp.innerHTML))]);
    }
  } catch (e) {
    steps.push(['error', String(e && e.stack || e)]);
  } finally {
    Math.random = keep.random; Storage.prototype.setItem = keep.set; Storage.prototype.removeItem = keep.remove; Date.now = keep.now; window.margraveFS = keep.fs;
  }
  return { digest: hash(steps.map(s => s.join('=')).join('\n')), month: MG.S.month, over: MG.S.over, steps };
};
