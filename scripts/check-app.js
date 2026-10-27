const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

let failed = false;
for (let i = 0; i < scripts.length; i++) {
  try {
    new vm.Script(scripts[i], { filename: \`app/index.html:inline-script-\${i + 1}\` });
    console.log(\`PASS inline JavaScript syntax \${i + 1}\`);
  } catch (error) {
    failed = true;
    console.error(\`FAIL inline JavaScript syntax \${i + 1}: \${error.message}\`);
  }
}

const checks = [
  ['labor discount is allocated proportionally', /const netLabor=\(c,j\)=>/.test(html)],
  ['mechanic commission uses net labor', /const mechShare=m=>mechJobs\(m\).reduce\(\(a,z\)=>a\+netLabor\(z\.c,z\.j\)\*\(\+m\.percent\|\|0\)\/100,0\)/.test(html)],
  ['manual discount edit preserves settlement discount', /A\.setDisc=\(id,v\)=>cm\(id,c=>c\.discount=parseIn\(v\)\+Math\.max\(0,\+c\.autoDiscount\|\|0\)\)/.test(html)],
  ['technician report labels post-discount labor', html.includes('اجرت پس از تخفیف')],
];
for (const [label, ok] of checks) {
  console.log(\`\${ok ? 'PASS' : 'FAIL'} \${label}\`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('All WorkshopPro source checks passed.');
