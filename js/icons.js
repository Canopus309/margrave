// 아이콘: Tabler Icons(outline, MIT)를 게임 안에 넣어 쓴다 (vendor/tabler). 화면 코드는 MG.ic(이름)으로 <i> 태그를 만든다.
(() => {
MG.ic = (name, cls) => (name ? `<i class="ti ti-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>` : '');

MG.ICONS = {
  res: { gold: 'coins', food: 'grain', wood: 'tree', iron: 'pick', pop: 'users', ap: 'bolt', storage: 'building-warehouse' },
  unit: { infantry: 'sword', archer: 'bow', mage: 'wand', priest: 'sparkles', guard: 'shield-chevron', engineer: 'hammer',
    artillery: 'bomb', cavalry: 'horse', garrison: 'users-group' },
  building: { house: 'home', barracks: 'tent', training: 'barbell', smithy: 'hammer', tower: 'wand', temple: 'building-church',
    hospital: 'first-aid-kit', storage: 'building-warehouse', market: 'building-store', workshop: 'tools', stable: 'horse',
    tavern: 'beer', watch: 'eye' },
  field: { farm: 'seeding', lumber: 'axe', mine: 'pick', goldmine: 'diamond' },
  faction: { goblin: 'mood-angry', orc: 'skull', undead: 'ghost-2', sky: 'feather' },
  item: { potion: 'flask', firepot: 'flame', drum: 'speakerphone', oil: 'droplet', timber: 'stack-2' },
  stat: { might: 'sword', lead: 'users-group', cmd: 'flag', admin: 'script' },
  skill: { infantry: 'shield-half', archer: 'arrow-bounce', mage: 'flame', priest: 'heart', engineer: 'hammer',
    artillery: 'bomb', cavalry: 'run', guard: 'flag-3' },
  season: { 봄: 'plant', 여름: 'sun', 가을: 'leaf', 겨울: 'snowflake' },
  side: { N: 'arrow-big-down', S: 'arrow-big-up', E: 'arrow-big-left', W: 'arrow-big-right' },
  card: { weapon: 'sword', relic: 'diamond', res: 'coins', troops: 'user-plus', xp: 'star', items: 'gift', crown: 'crown' },
  tab: { castle: 'building-castle', army: 'shield', war: 'flag-3', market: 'building-store', family: 'crown' },
  site: { nest: 'mood-angry', mine: 'pick', escort: 'truck', ruins: 'building-monument' },
  act: { repair: 'hammer', recruit: 'user-plus', train: 'barbell', scout: 'eye', craft: 'sword', support: 'mail', promote: 'chevrons-up' },
};
// 숙련도 배지: 계급만큼 갈매기, 말풍선에 숙련도와 효과
MG.vetBadge = v => { const r = MG.vetRank(v), R = MG.VET_RANKS[r]; return `<span class="vet r${r}" title="${R.name} · 숙련도 ${Math.floor(v || 0)} / ${MG.VET_MAX}${r ? ` · 공격·체력 +${Math.round((R.mul - 1) * 100)}%${R.dmgTaken ? ', 받는 피해 -5%' : ''}` : ''} · 전투·훈련으로 오르고, 새 병사를 넣으면 평균이 낮아져요">${MG.ic('military-rank')}${'›'.repeat(r)}</span>`; };
// 이름 줄 앞에 붙는 작은 아이콘
MG.icRes = k => MG.ic(MG.ICONS.res[k], `res-${k}`);
MG.icUnit = t => MG.ic(MG.ICONS.unit[t] || 'user');
})();
