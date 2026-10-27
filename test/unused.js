// 정의만 있고 어디서도 쓰지 않는 MG.이름을 찾는다: node test/unused.js
const fs = require('fs');
const files = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['index.html']);
const all = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const defs = new Set([...all.matchAll(/^\s*MG\.([A-Za-z_]\w*)\s*=/gm)].map(m => m[1]));
const unused = [...defs].filter(n => (all.match(new RegExp(`MG\\.${n}\\b`, 'g')) || []).length <= 1);
console.log(unused.join(' ') || '없음');
