// 시작과 메인 루프
(() => {
// 전투가 끝나면 캠페인에 결과를 반영하고, 결과 화면이 그 요약을 보여준다
MG.onBattleEnd = B => { B.result.summary = MG.applyResult(B); };

let last = performance.now(), uiT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const B = MG.B;
  if (MG.mode === 'battle' && B) {
    if (B.phase === 'battle' && !B.paused) {
      for (let i = 0; i < B.speed; i++) MG.update(dt);
    }
    MG.updateInput(dt);
    uiT += dt;
    if (uiT > 0.2) { uiT = 0; MG.ui.refresh(); }
    MG.render(B, MG.input);
  }
  requestAnimationFrame(loop);
}

if (!MG.loadCampaign()) MG.newCampaign();
MG.enterCamp();
requestAnimationFrame(loop);
})();
