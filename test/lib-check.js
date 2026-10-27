// 캠페인 파일들의 MG.lib 가져오기·내보내기 점검: node test/lib-check.js
// 가져왔는데 안 쓰는 이름, 쓰는데 안 가져온 이름, 앞 파일에서 내보내지 않은 이름을 알려 준다.
const fs = require('fs');
const files = ['campaign', 'lord', 'castle', 'army', 'rewards', 'war', 'month'];
const strip = s => s.replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'/g, "''");
const exported = new Set(), problems = [];
for (const f of files) {
  const src = strip(fs.readFileSync(`js/${f}.js`, 'utf8'));
  const impM = src.match(/const \{([^}]*)\} = MG\.lib;/), imp = impM ? impM[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  const expM = src.match(/(?:MG\.lib = |Object\.assign\(MG\.lib, )\{([^}]*)\}/), exp = expM ? expM[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  const body = src.replace(/const \{[^}]*\} = MG\.lib;/, '').replace(/(?:MG\.lib = |Object\.assign\(MG\.lib, )\{[^}]*\}\)?;?/, '');
  const used = n => new RegExp(`(^|[^.\\w])${n}\\b`).test(body);
  for (const n of imp) {
    if (!exported.has(n)) problems.push(`${f}: ${n}을(를) 앞 파일이 내보내지 않아요`);
    if (!used(n)) problems.push(`${f}: ${n}을(를) 가져왔지만 안 써요`);
  }
  for (const n of exported) if (!imp.includes(n) && used(n) && !new RegExp(`(function|const|let)\\s+${n}\\b`).test(body)) problems.push(`${f}: ${n}을(를) 쓰지만 가져오지 않아요`);
  for (const n of exp) exported.add(n);
}
console.log(problems.length ? problems.join('\n') : 'ok');
process.exit(problems.length ? 1 : 0);
