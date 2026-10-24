// 시작과 메인 루프
(() => {
MG.newBattle = function (level) {
  MG.createBattle(level);
  document.getElementById('result').classList.add('hidden');
  MG.ui.refresh(true);
};

let last = performance.now(), uiT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const B = MG.B;
  if (B.phase === 'battle' && !B.paused) {
    for (let i = 0; i < B.speed; i++) MG.update(dt);
  }
  MG.updateInput(dt);
  uiT += dt;
  if (uiT > 0.2) { uiT = 0; MG.ui.refresh(); }
  MG.render(B, MG.input);
  requestAnimationFrame(loop);
}

MG.newBattle(1);
requestAnimationFrame(loop);
})();
