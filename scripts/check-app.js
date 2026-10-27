const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('app/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

for (let i = 0; i < scripts.length; i++) {
  new vm.Script(scripts[i], { filename: 'app/index.html:inline-script-' + (i + 1) });
  console.log('PASS inline JavaScript syntax ' + (i + 1));
}

const checks = [
  ['labor discount is allocated proportionally', /const netLabor=\(c,j\)=>/.test(html)],
  ['mechanic commission uses net labor', /const mechShare=m=>mechJobs\(m\).reduce\(\(a,z\)=>a\+netLabor\(z\.c,z\.j\)\*\(\+m\.percent\|\|0\)\/100,0\)/.test(html)],
  ['manual discount edit preserves settlement discount', /A\.setDisc=\(id,v\)=>cm\(id,c=>c\.discount=parseIn\(v\)\+Math\.max\(0,\+c\.autoDiscount\|\|0\)\)/.test(html)],
  ['technician report labels post-discount labor', html.includes('اجرت پس از تخفیف')],
];
for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log('PASS ' + label);
}

const businessStart = html.indexOf('const totals=c=>');
const businessEnd = html.indexOf('const partDebt=', businessStart);
assert.ok(businessStart >= 0 && businessEnd > businessStart, 'locate invoice totals logic');
const totalsSource = html.slice(businessStart, businessEnd);
const totalsContext = { S: { tips: [] } };
vm.runInNewContext(totalsSource + '\nthis.testTotals = totals;', totalsContext);

const card = {
  id: 'test-card',
  parts: [{ q: 1, price: 20000 }],
  jobs: [{ labor: 6000 }, { labor: 4000 }],
  payments: [],
  discount: 2000,
  autoDiscount: 0,
};
const invoice = totalsContext.testTotals(card);
assert.equal(invoice.parts, 20000, 'parts total stays unchanged');
assert.equal(invoice.jobs, 10000, 'gross labor total');
assert.equal(invoice.laborDiscount, 2000, 'discount applies to labor');
assert.equal(invoice.total, 28000, 'invoice total discounts labor, not parts');
console.log('PASS invoice total and labor-only discount calculation');

const mechanicStart = html.indexOf('const mechJobs=m=>');
const mechanicEnd = html.indexOf('const stOf=', mechanicStart);
assert.ok(mechanicStart >= 0 && mechanicEnd > mechanicStart, 'locate technician commission logic');
const mechanicSource = html.slice(mechanicStart, mechanicEnd);
const mechanicContext = {
  S: { cards: [{ id: 'test-card', discount: 2000, autoDiscount: 0, jobs: card.jobs.map((j, i) => ({ ...j, mechanicId: 'tech', date: '2026-01-01', name: 'job-' + i })) }] },
};
vm.runInNewContext(mechanicSource + '\nthis.testNetLabor = netLabor; this.testMechShare = mechShare;', mechanicContext);
const tech = { id: 'tech', name: 'Test technician', percent: 20 };
const netLaborLines = mechanicContext.S.cards[0].jobs.map((job) => mechanicContext.testNetLabor(card, job));
assert.ok(Math.abs(netLaborLines[0] - 4800) < 1e-9, 'first job receives proportional discount');
assert.ok(Math.abs(netLaborLines[1] - 3200) < 1e-9, 'second job receives proportional discount');
assert.ok(Math.abs(mechanicContext.testMechShare(tech) - 1600) < 1e-9, 'commission is based on net labor');
console.log('PASS proportional labor discount and technician commission calculation');

console.log('All WorkshopPro source and accounting checks passed.');
