// 보상과 사건: 유물·3택1 카드, 본국 지원, 랜덤 이벤트, 연대기 사건.
(() => {
const { pick, randInt, shuffle, addRes, save, act, addCrown, addEffect, newGeneral, addXp, rollWeapon, sicken } = MG.lib;

// ---------- 유물·3택1 보상 ----------
const freeRelics = grades => Object.keys(MG.RELICS).filter(k => !MG.hasRelic(k) && (!grades || grades.includes(MG.RELICS[k].grade)));
// 등급을 굴려 아직 없는 유물 하나 (없으면 null). big: 좋은 등급이 잘 나온다
function rollRelic(big, only) {
  const r = Math.random();
  let grade = big ? (r < 0.15 ? 'legendary' : r < 0.6 ? 'rare' : 'common') : (r < 0.05 ? 'legendary' : r < 0.3 ? 'rare' : 'common');
  if (only && !only.includes(grade)) grade = only[0];
  const pool = freeRelics([grade]), any = pool.length ? pool : freeRelics(only);
  return any.length ? pick(any) : null;
}
MG.grantRelic = id => {
  if (!id || MG.hasRelic(id)) return null;
  MG.S.relics.push(id);
  MG.chron(`유물 ${MG.josa(MG.RELICS[id].name, '을를')} 얻었어요.`, 'etc');
  return id;
};
MG.startRelicOffer = () => shuffle(Object.keys(MG.RELICS).filter(k => MG.RELICS[k].grade === 'common')).slice(0, 3);
MG.originOffer = () => shuffle(Object.keys(MG.ORIGINS)).slice(0, 3);
const ITEM_KEYS = ['potion', 'firepot', 'drum', 'oil', 'timber'];
function makeCard(kind, big) {
  const S = MG.S, L = S.level, m = big ? 1.6 : 1;
  if (kind === 'weapon') return { kind, weapon: rollWeapon(L + (big ? 4 : 0)) };
  if (kind === 'relic') { const id = rollRelic(big); return id ? { kind, id } : null; }
  if (kind === 'res') {
    const k = pick(['food', 'wood', 'iron']);
    return { kind, res: { gold: Math.round((120 + 25 * L) * m), [k]: Math.round((k === 'iron' ? 80 : 150) * (1 + 0.1 * L) * m) } };
  }
  if (kind === 'troops') return { kind, n: Math.round((12 + L) * m), type: pick(['archer', 'infantry']) };
  if (kind === 'xp') return { kind, xp: Math.round((50 + 10 * L) * m) };
  if (kind === 'items') {
    const items = {};
    for (let i = 0; i < (big ? 3 : 2); i++) { const k = pick(ITEM_KEYS); items[k] = (items[k] || 0) + 1; }
    return { kind, items };
  }
  if (kind === 'crown') return { kind, n: Math.round(10 * m) };
  return null;
}
// 서로 다른 종류 3장. 유물은 평소 25% 확률로만 끼고, 대습격이면 맨 앞에 꼭 들어간다
function rollCards(big) {
  const others = shuffle(Object.keys(MG.CARD_KINDS).filter(k => k !== 'relic'));
  const order = big || Math.random() < (MG.perk('treasure') ? 0.5 : 0.25) ? ['relic', ...others] : others;
  const cards = [];
  for (const k of order) { if (cards.length >= (MG.perk('conqueror') ? 2 : 3)) break; const c = makeCard(k, big); if (c) cards.push(c); }
  return { cards, big, rerolled: false };
}
// 카드 보여줄 글: { title, desc, color }
MG.cardInfo = c => {
  if (c.kind === 'weapon') { const g = MG.WEAPON_GRADES[c.weapon.grade]; return { title: `[${g.name}] ${c.weapon.name}`, desc: `${MG.UNIT_TYPES[c.weapon.type].name}용 · ${MG.weaponDesc(c.weapon)}`, color: g.color }; }
  if (c.kind === 'relic') { const R = MG.RELICS[c.id], g = MG.RELIC_GRADES[R.grade]; return { title: `[${g.name} 유물] ${R.name}`, desc: R.desc, color: g.color }; }
  if (c.kind === 'res') return { title: '보급 물자', desc: Object.entries(c.res).map(([k, v]) => `${MG.RES[k]} +${v}`).join(' · '), color: '#e6b450' };
  if (c.kind === 'troops') return { title: '지원병', desc: `직할 ${MG.UNIT_TYPES[c.type].name} +${c.n}명`, color: '#c9d1dc' };
  if (c.kind === 'xp') return { title: '전투의 교훈', desc: `모든 장수 경험치 +${c.xp}`, color: '#6aa8ff' };
  if (c.kind === 'items') return { title: '전리품 상자', desc: Object.entries(c.items).map(([k, v]) => `${MG.ITEMS[k].name} +${v}`).join(' · '), color: '#ffd36b' };
  return { title: '왕실의 치하', desc: `본국 관계 +${c.n}`, color: '#6bdc8f' };
};
MG.pickCard = i => {
  const S = MG.S, P = S.pendingPick, c = P && P.cards[i];
  if (!c) return '고를 카드가 없어요';
  if (c.kind === 'weapon') S.inventory.push(c.weapon);
  if (c.kind === 'relic') MG.grantRelic(c.id);
  if (c.kind === 'res') for (const [k, v] of Object.entries(c.res)) addRes(k, v);
  if (c.kind === 'troops') S.garrison[c.type] += c.n;
  if (c.kind === 'xp') for (const g of S.generals) if (!g.dead) addXp(g, c.xp);
  if (c.kind === 'items') for (const [k, v] of Object.entries(c.items)) S.items[k] = Math.min(MG.ITEM_MAX, (S.items[k] || 0) + v);
  if (c.kind === 'crown') addCrown(c.n);
  S.pendingPick = null;
  save();
  return `${MG.josa(MG.cardInfo(c).title, '을를')} 골랐어요.`;
};
MG.rerollCards = () => {
  const S = MG.S, P = S.pendingPick, cost = MG.rerollCost(S.level);
  if (!P || P.rerolled) return '다시 뽑기는 한 번만 할 수 있어요';
  if (S.res.gold < cost) return '골드가 모자라요';
  S.res.gold -= cost;
  S.pendingPick = { ...rollCards(P.big), rerolled: true };
  save();
  return null;
};

MG.supportKind = () => (MG.S.crown >= 70 ? '장수 1명' : MG.S.crown >= 40 ? '병사 20명 또는 식량 300' : '식량 200');
MG.actSupport = () => {
  const S = MG.S;
  if (S.support) return '이미 지원을 기다리고 있어요';
  if (S.crown < MG.SUPPORT_MIN) return '본국과 관계가 너무 나빠요';
  const why = act(null, () => {
    const kind = S.crown >= 70 ? 'general' : S.crown >= 40 ? (Math.random() < 0.5 ? 'soldiers' : 'food') : 'foodSmall';
    S.support = { kind, months: randInt(2, 4) };
    addCrown(-MG.SUPPORT_COST * (MG.perk('regent') ? 0.5 : 1));
  });
  return why || `본국에 지원을 요청했어요. ${S.support.months}개월 뒤(${(S.month + S.support.months) % 12 + 1}월 초) 도착해요.`;
};
function arriveSupport(rep) {
  const S = MG.S;
  if (!S.support || --S.support.months > 0) return;
  const k = S.support.kind;
  S.support = null;
  if (k === 'general') {
    const g = newGeneral({ type: pick(Object.keys(MG.WEAPON_KINDS)), level: randInt(2, 4), age: randInt(25, 40), healthy: 10 });
    S.generals.push(g);
    rep.push(`본국이 장수 ${g.name}(${MG.UNIT_TYPES[g.type].name} Lv.${g.level})과 병사 10명을 보냈어요.`);
  } else if (k === 'soldiers') {
    S.garrison.infantry += 10; S.garrison.archer += 10;
    rep.push('본국이 병사 20명을 보냈어요 (직할).');
  } else {
    const n = k === 'food' ? 300 : 200;
    addRes('food', n);
    rep.push(`본국이 식량 ${n}을 보냈어요.`);
  }
}

// ---------- 랜덤 이벤트 ----------
// 매달 20% 확률. 고를 것이 있는 이벤트는 내정 화면에 창으로 뜬다.
const EVENTS = {
  merchant: {
    title: '떠돌이 상인', weight: 1,
    make: () => ({ weapon: rollWeapon(MG.S.level + 3), price: 300 }),
    text: e => `상인이 ${MG.WEAPON_GRADES[e.weapon.grade].name} 무기 "${e.weapon.name}"(${MG.UNIT_TYPES[e.weapon.type].name}용 · ${MG.weaponDesc(e.weapon)})을 골드 ${e.price}에 팔겠대요.`,
    choices: [
      { label: e => `골드 ${e.price}에 사기`, ok: e => MG.S.res.gold >= e.price, run: e => { MG.S.res.gold -= e.price; MG.S.inventory.push(e.weapon); return '무기를 샀어요.'; } },
      { label: () => '보내기', run: () => '상인이 떠났어요.' },
    ],
  },
  refugees: {
    title: '난민 무리', weight: 1,
    make: () => ({ n: randInt(15, 30), food: 60 }),
    text: e => `마물을 피해 온 난민 ${e.n}명이 성문 앞에 있어요. 받아들이면 식량 ${e.food}이 들어요. 집이 모자라면 일부는 곧 떠나요.`,
    choices: [
      { label: () => '받아들이기', ok: e => MG.S.res.food >= e.food, run: e => { MG.S.res.food -= e.food; MG.S.pop += e.n; return `주민이 ${e.n}명 늘었어요.`; } },
      { label: () => '돌려보내기', run: () => '난민들이 다른 곳으로 떠났어요.' },
    ],
  },
  plague: {
    title: '역병', weight: 0.7, when: () => MG.S.generals.some(g => g.healthy > 10),
    make: () => ({ cost: 150 }),
    text: e => `병영에 역병이 돌아요. 골드 ${e.cost}으로 약을 구하면 막을 수 있어요. 그냥 두면 병사 일부가 앓아누워요.`,
    choices: [
      { label: e => `골드 ${e.cost}으로 치료`, ok: e => MG.S.res.gold >= e.cost, run: e => { MG.S.res.gold -= e.cost; return '역병을 막았어요.'; } },
      { label: () => '그냥 두기', run: () => `병사 ${sicken(0.15)}명이 앓아누웠어요 (경상).` },
    ],
  },
  harvest: {
    title: '풍작', weight: 0.8, when: () => ['여름', '가을'].includes(MG.SEASON(MG.S.month)),
    make: () => ({ n: randInt(100, 200) }), text: e => `올해 들판이 풍성해요. 식량 +${e.n}`,
    choices: [{ label: () => '좋아요', run: e => { addRes('food', e.n); return null; } }],
  },
  blight: {
    title: '병충해', weight: 0.6, make: () => ({ n: randInt(60, 140) }), text: e => `창고의 곡식에 벌레가 들었어요. 식량 -${e.n}`,
    choices: [{ label: () => '어쩔 수 없죠', run: e => { MG.S.res.food = Math.max(0, MG.S.res.food - e.n); return null; } }],
  },
  thieves: {
    title: '도둑', weight: 0.7,
    make: () => ({ blocked: Math.random() < 0.5 * MG.bLevel('watch'), n: Math.round(MG.S.res.gold * 0.12) }),
    text: e => (e.blocked ? '도둑이 창고를 노렸지만 감시탑이 막았어요.' : `밤사이 도둑이 들었어요. 골드 -${e.n}`),
    choices: [{ label: () => '확인', run: e => { if (!e.blocked) MG.S.res.gold -= e.n; return null; } }],
  },
  volunteers: {
    title: '의용병', weight: 0.6, make: () => ({ n: randInt(5, 12) }),
    text: e => `변경백의 이름을 듣고 젊은이 ${e.n}명이 찾아왔어요. 직할 병력에 들어와요.`,
    choices: [{ label: () => '환영해요', run: e => { MG.S.garrison.infantry += e.n; return null; } }],
  },
  royal: {
    title: '왕실의 부탁', weight: 0.8,
    make: () => (Math.random() < 0.5 ? { res: 'iron', n: 150, reward: 250 } : { res: 'food', n: 250, reward: 200 }),
    text: e => `왕실이 ${MG.RES[e.res]} ${MG.josa(e.n, '을를')} 보내 달래요. 들어주면 관계가 좋아지고 골드 ${e.reward}을 사례로 받아요.`,
    choices: [
      { label: e => `${MG.RES[e.res]} ${e.n} 보내기`, ok: e => MG.S.res[e.res] >= e.n,
        run: e => { MG.S.res[e.res] -= e.n; MG.S.res.gold += e.reward; addCrown(10); return '왕실과의 관계가 좋아졌어요 (+10).'; } },
      { label: () => '거절하기', run: () => { addCrown(-5); return '왕실이 서운해해요 (-5).'; } },
    ],
  },
};
function rollEvent(rep) {
  const S = MG.S;
  if (S.event || S.pendingSuccession || Math.random() >= MG.EVENT_CHANCE) return;
  const pool = Object.entries(EVENTS).filter(([, ev]) => !ev.when || ev.when());
  let r = Math.random() * pool.reduce((a, [, ev]) => a + ev.weight, 0);
  const [type, ev] = pool.find(([, e]) => (r -= e.weight) < 0) || pool[0];
  S.event = { type, ...ev.make() };
  rep.push(`이벤트: ${ev.title}`);
}
MG.eventView = () => {
  const e = MG.S.event;
  if (!e) return null;
  const ev = EVENTS[e.type];
  return { title: ev.title, text: ev.text(e), choices: ev.choices.map(c => ({ label: c.label(e), ok: !c.ok || c.ok(e) })) };
};
MG.resolveEvent = i => {
  const S = MG.S, e = S.event, c = e && EVENTS[e.type].choices[i];
  if (!c || (c.ok && !c.ok(e))) return '고를 수 없어요';
  const out = c.run(e);
  S.event = null;
  save();
  return out;
};

// ---------- 연대기 사건 ----------
// 2~3년에 한 번 봄에 오는 큰 사건. 대부분 선택이 있고, 지속 효과를 남긴다.
const CHRONICLES = {
  draft: {
    title: '왕국 징집령', make: () => ({ n: 30 }),
    text: e => `왕국이 다른 전선에 보낼 병사 ${e.n}명을 요구해요. 보내면 왕실과 가까워지고, 거절하면 크게 서운해해요.`,
    choices: [
      { label: e => `직할 병사 ${e.n}명 보내기`, ok: e => MG.S.garrison.archer + MG.S.garrison.infantry >= e.n,
        run: e => { const g = MG.S.garrison; let n = e.n; while (n-- > 0) { if (g.infantry >= g.archer) g.infantry--; else g.archer--; } addCrown(15); return '병사를 보냈어요. 왕실 관계 +15'; } },
      { label: () => '거절하기', run: () => { addCrown(-20); return '징집을 거절했어요. 왕실 관계 -20'; } },
    ],
  },
  migration: {
    title: '마물 대이동', make: () => ({}),
    text: () => '변경 너머에서 마물 떼가 크게 움직이고 있어요. 앞으로 1년 동안 습격이 30% 커지지만, 승리 전리품도 2배가 돼요.',
    choices: [{ label: () => '대비하자', run: () => { addEffect('migration', 12); return null; } }],
  },
  winter: {
    title: '혹한의 조짐', make: () => ({ wood: 150 }),
    text: e => `올겨울은 유난히 추울 거래요. 겨울 동안 식량을 1.5배 먹어요. 땔감(목재 ${e.wood})을 미리 마련하면 피할 수 있어요.`,
    choices: [
      { label: e => `목재 ${e.wood}로 땔감 마련`, ok: e => MG.S.res.wood >= e.wood, run: e => { MG.S.res.wood -= e.wood; return '땔감을 마련해 두었어요.'; } },
      { label: () => '그냥 버티기', run: () => { addEffect('harshWinter', 12); return '겨울 동안 식량 소비가 늘어요.'; } },
    ],
  },
  goldvein: {
    title: '황금 광맥', when: () => MG.S.fields.some(f => f.type === 'mine'),
    make: () => ({}),
    text: () => '광부들이 광산 깊은 곳에서 금맥을 찾았어요. 광산 하나를 금광으로 바꾸면 철 대신 골드가 나와요.',
    choices: [
      { label: () => '금광으로 바꾸기 (그 광산의 철 수입은 사라져요)', run: () => { const f = MG.S.fields.find(x => x.type === 'mine'); f.type = 'goldmine'; return '광산 하나가 금광이 되었어요.'; } },
      { label: () => '철을 계속 캐기', run: () => '그대로 철을 캐요.' },
    ],
  },
  pilgrims: {
    title: '성지 순례단', make: () => ({ gold: 200 }),
    text: e => `먼 길을 가는 순례단이 쉬어 가길 청해요. 받아들이면 헌금 골드 ${e.gold}을 받지만, 병을 옮길지도 몰라요(30%).`,
    choices: [
      { label: () => '받아들이기', run: e => {
        MG.S.res.gold += e.gold;
        if (Math.random() < 0.3) return `헌금을 받았지만 병이 돌아 병사 ${sicken(0.1)}명이 앓아누웠어요.`;
        return `헌금 골드 ${e.gold}을 받았어요.`;
      } },
      { label: () => '돌려보내기', run: () => '순례단이 다른 곳으로 떠났어요.' },
    ],
  },
  marriage: {
    title: '이웃 영주의 혼담', when: () => MG.S.lord.age >= 18 && MG.S.lord.age <= 45, make: () => ({ gold: 300 }),
    text: e => `이웃 영주가 성주에게 혼담을 넣었어요. 받아들이면 혼례 비용 골드 ${e.gold}이 들지만, 3년 동안 아이가 태어날 확률이 2배가 돼요.`,
    choices: [
      { label: e => `골드 ${e.gold}으로 혼례 치르기`, ok: e => MG.S.res.gold >= e.gold, run: e => { MG.S.res.gold -= e.gold; addEffect('marriage', 36); return '혼례를 치렀어요.'; } },
      { label: () => '정중히 거절', run: () => '혼담을 거절했어요.' },
    ],
  },
  envoy: {
    title: '마물의 사신', make: () => ({ gold: 300, food: 200 }),
    text: e => `마물 쪽에서 사신이 왔어요. 공물(골드 ${e.gold}, 식량 ${e.food})을 내면 1년 동안 습격하지 않겠대요. 거절하면 다음 습격이 20% 커져요.`,
    choices: [
      { label: e => '공물 바치기', ok: e => MG.S.res.gold >= e.gold && MG.S.res.food >= e.food,
        run: e => { const S = MG.S; S.res.gold -= e.gold; S.res.food -= e.food; S.nextAttack.month = Math.max(S.nextAttack.month, S.month + 12); return '1년 동안 습격이 없어요.'; } },
      { label: () => '거절하기', run: () => { MG.S.nextAttack.mul = (MG.S.nextAttack.mul || 1) * 1.2; return '다음 습격이 커져요.'; } },
    ],
  },
  unrest: {
    title: '반란의 기미', make: () => ({}),
    text: () => '무거운 세금에 주민들의 불만이 커졌어요. 세금을 낮추거나, 병사를 풀어 누를 수 있어요.',
    choices: [
      { label: () => '1년 동안 세금 -30%', run: () => { addEffect('lowtax', 12); return '세금을 낮췄어요.'; } },
      { label: () => '병사로 진압', run: () => {
        const S = MG.S, lost = Math.round(S.pop * 0.1); S.pop -= lost;
        const n = Math.round((S.garrison.infantry) * 0.1); S.garrison.infantry -= n; for (let i = 0; i < n; i++) S.garrison.wounded.push({ type: 'infantry', sev: 'light', left: 1 });
        return `진압했어요. 주민 ${lost}명이 떠나고 병사 ${n}명이 다쳤어요.`;
      } },
    ],
  },
};
function rollChronicle() {
  const pool = Object.entries(CHRONICLES).filter(([, c]) => !c.when || c.when());
  const [type, c] = pool[(Math.random() * pool.length) | 0];
  MG.S.cevent = { type, ...c.make() };
}
MG.chronicleView = () => {
  const e = MG.S.cevent;
  if (!e) return null;
  const c = CHRONICLES[e.type];
  return { title: c.title, text: c.text(e), choices: c.choices.map(ch => ({ label: ch.label(e), ok: !ch.ok || ch.ok(e) })) };
};
MG.resolveChronicle = i => {
  const S = MG.S, e = S.cevent, ch = e && CHRONICLES[e.type].choices[i];
  if (!ch || (ch.ok && !ch.ok(e))) return '고를 수 없어요';
  const out = ch.run(e);
  MG.chron(`${CHRONICLES[e.type].title}: ${ch.label(e)}${out ? ` — ${out}` : ''}`, 'event');
  S.cevent = null;
  save();
  return out;
};

Object.assign(MG.lib, { rollRelic, rollCards, arriveSupport, rollEvent, CHRONICLES, rollChronicle });
})();
