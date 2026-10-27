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
  ['vehicle card captures and edits purchase cost and supplier', html.includes("fld('pbuy','قیمت خرید واحد ('+L+') (اختیاری)','0')") && html.includes("purchasePrice:parseIn(val('pbuy'))") && html.includes("r.purchasePrice=parseIn(val('e6'));r.sid=val('e7')")],
  ['customer list has search by name, phone, national ID and vehicle', html.includes('id="custSearch"') && html.includes('data-search=') && html.includes('custTable tbody tr')],
  ['labor discount is allocated proportionally', /const netLabor=\(c,j\)=>/.test(html)],
  ['mechanic commission uses net labor and excludes own jobs', html.includes('const mechShare=m=>mechJobs(m).reduce((a,z)=>a+(z.j.own?0:netLabor(z.c,z.j)*(+m.percent||0)/100),0);')],
  ['manual discount edit preserves settlement discount', /A\.setDisc=\(id,v\)=>cm\(id,c=>c\.discount=parseIn\(v\)\+Math\.max\(0,\+c\.autoDiscount\|\|0\)\)/.test(html)],
  ['technician report labels post-discount labor', html.includes('اجرت پس از تخفیف')],
  ['financial accounts are included in data normalization', /'accounts','ledger'/.test(html)],
  ['customer payments require an account when accounts exist', /if\(S\.accounts\.length&&!accountId\)return toast\('حساب دریافت را انتخاب کنید'\)/.test(html)],
  ['supplier settlements record their payment account', /z\.p\.settlements\.push\(\{id:uid\(\),amount:pp,accountId,date:iso\(\),supplierId:sid\}\)/.test(html)],
  ['cash garage purchases record their payment account', /if\(mode==='amount'&&amount>0&&S\.accounts\.length&&!accountId\)return toast\('حساب پرداخت خرید را انتخاب کنید'\)/.test(html)],
  ['garage purchase form exposes account selection', html.includes('پرداخت از حساب (خرید نقدی)')],
  ['technician commission settlements are tracked', html.includes('S.mechanicPayments.push({id:uid(),mechanicId:id,amount,accountId:accountId||\'\',note,date:iso()})')],
  ['tip settlement requires a payout account when accounts exist', html.includes("A.tipSetDo=id=>") && html.includes("t.settlementAccountId=accountId||''")],
  ['account transfers are recorded as paired movements', html.includes('A.transferSave=()=>') && html.includes('transferId,accountId:from,direction:\'out\'') && html.includes('transferId,accountId:to,direction:\'in\'')],
  ['reports show supplier and technician payables', html.includes('بدهی به تأمین‌کنندگان') && html.includes('مانده اجرت تعمیرکاران')],
  ['reports include per-card profit', html.includes('سود تقریبی هر کارتکس') && html.includes('const workProfit=c=>')],
  ['own jobs do not create technician commission', /z\.j\.own\?0:netLabor\(z\.c,z\.j\)/.test(html)],
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

const autoDiscountCard = {
  id: 'auto-discount-card',
  parts: [{ q: 1, price: 20000 }],
  jobs: [{ labor: 6000 }, { labor: 4000 }],
  payments: [],
  discount: 3000,
  autoDiscount: 1000,
};
const autoInvoice = totalsContext.testTotals(autoDiscountCard);
assert.equal(autoInvoice.laborDiscount, 2000, 'automatic settlement discount is excluded from labor-only discount');
assert.equal(autoInvoice.total, 27000, 'manual labor discount and settlement discount are each counted once');
const cappedCard = { ...autoDiscountCard, discount: 12000, autoDiscount: 1000 };
const cappedInvoice = totalsContext.testTotals(cappedCard);
assert.equal(cappedInvoice.laborDiscount, 10000, 'manual discount cannot exceed gross labor');
assert.equal(cappedInvoice.total, 19000, 'discount is capped at labor plus settlement discount');
console.log('PASS automatic discount separation and labor discount cap');

const mechanicStart = html.indexOf('const mechJobs=m=>');
const mechanicEnd = html.indexOf('const stOf=', mechanicStart);
assert.ok(mechanicStart >= 0 && mechanicEnd > mechanicStart, 'locate technician commission logic');
const mechanicSource = html.slice(mechanicStart, mechanicEnd);
const mechanicContext = {
  S: { mechanics: [{ id: 'tech', name: 'Test technician', percent: 20 }], cards: [{ id: 'test-card', discount: 2000, autoDiscount: 0, jobs: [...card.jobs.map((j, i) => ({ ...j, mechanicId: 'tech', date: '2026-01-01', name: 'job-' + i })), { name: 'legacy job', labor: 1000, mechanic: 'Test technician', date: '2026-01-01' }] }, { id: 'own-card', discount: 0, autoDiscount: 0, jobs: [{ id: 'own-job', name: 'own job', labor: 500, mechanicId: 'tech', own: true }] }] },
  ent: (k, id) => mechanicContext.S[k]?.find((item) => item.id === id),
};
vm.runInNewContext(mechanicSource + '\nthis.testNetLabor = netLabor; this.testMechShare = mechShare; this.testMechanicForJob = mechanicForJob;', mechanicContext);
const tech = { id: 'tech', name: 'Test technician', percent: 20 };
const netLaborLines = mechanicContext.S.cards[0].jobs.slice(0, 2).map((job) => mechanicContext.testNetLabor(card, job));
assert.ok(Math.abs(netLaborLines[0] - 4800) < 1e-9, 'first job receives proportional discount');
assert.ok(Math.abs(netLaborLines[1] - 3200) < 1e-9, 'second job receives proportional discount');
assert.equal(mechanicContext.testMechanicForJob(mechanicContext.S.cards[0].jobs[2]).id, 'tech', 'legacy jobs assigned by technician name are linked to the technician');
assert.ok(Math.abs(mechanicContext.testMechShare(tech) - 1760) < 1e-9, 'commission includes legacy name-linked jobs, uses net labor and excludes own jobs');
console.log('PASS proportional labor discount and technician commission calculation including legacy assignments');

const syncStart = html.indexOf('function syncCustomer(c,previous={})');
const syncEnd = html.indexOf('const cardLbl=', syncStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart, 'locate linked customer synchronization');
const syncSource = html.slice(syncStart, syncEnd);
const customerContext = {
  S: { customers: [{ id: 'customer-1', name: 'Old Name', phone: '555', national: '' }] },
  uid: () => 'new-customer',
};
vm.runInNewContext(syncSource + '\nthis.testSyncCustomer = syncCustomer;', customerContext);
const editedCard = { id: 'card-1', customerId: '', name: 'New Name', phone: '777', national: 'N-1' };
const linked = customerContext.testSyncCustomer(editedCard, { name: 'Old Name', phone: '555' });
assert.equal(customerContext.S.customers.length, 1, 'editing a linked cardex does not create a duplicate customer');
assert.equal(linked.id, 'customer-1', 'existing customer identity is preserved');
assert.equal(linked.name, 'New Name', 'customer name is synchronized');
assert.equal(linked.phone, '777', 'customer phone is synchronized');
assert.equal(editedCard.customerId, 'customer-1', 'cardex stores the stable customer link');
console.log('PASS cardex edits update the linked customer without duplication');

const accountStart = html.indexOf('const accountBalance=id=>');
const accountEnd = html.indexOf('const accountName=', accountStart);
assert.ok(accountStart >= 0 && accountEnd > accountStart, 'locate account balance logic');
const accountSource = html.slice(accountStart, accountEnd);
const accountContext = {
  S: {
    ledger: [{ accountId: 'bank-1', direction: 'in', amount: 1000 }, { accountId: 'bank-1', direction: 'out', amount: 300 }, { accountId: 'bank-1', direction: 'out', amount: 400, transferId: 'transfer-1' }, { accountId: 'bank-2', direction: 'in', amount: 400, transferId: 'transfer-1' }],
    cards: [
      { payments: [{ accountId: 'bank-1', amount: 5000 }], parts: [{ settlements: [{ accountId: 'bank-1', amount: 2000 }] }] },
    ],
    garage: [{ accountId: 'bank-1', mode: 'amount', amount: 1000 }, { accountId: 'bank-1', mode: 'credit', amount: 700 }],
    mechanicPayments: [{ accountId: 'bank-1', amount: 500 }],
    tips: [{ settled: true, settlementAccountId: 'bank-1', amount: 200 }],
  },
};
vm.runInNewContext(accountSource + '\nthis.testAccountBalance = accountBalance;', accountContext);
assert.equal(accountContext.testAccountBalance('bank-1'), 1600, 'account balance combines receipts, supplier payments, garage purchases, technician payouts, tip settlements, transfers, and manual ledger entries');
assert.equal(accountContext.testAccountBalance('bank-2'), 400, 'the receiving account gets the matching transfer inflow');
assert.equal(accountContext.testAccountBalance('cash-1'), 0, 'unrelated accounts have zero balance');
console.log('PASS account balance aggregates receipts, supplier payments, garage purchases, technician payouts, tip settlements, transfers, and manual movements');

console.log('All WorkshopPro source and accounting checks passed.');
