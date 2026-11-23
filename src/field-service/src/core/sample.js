/**
 * A believable demo business: a small home-services company with a team of
 * four, recurring maintenance work, and a pipeline in every stage. Dates are
 * generated relative to `today` so the demo always looks current.
 */
import { addDays, addMonths, startOfWeek, weekday } from './dates.js';
import { newId } from './ids.js';
import { generateVisitDates } from './recurrence.js';
import { TEAM_COLORS } from './format.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FIRST = ['Maya', 'Daniel', 'Priya', 'Owen', 'Sofia', 'Marcus', 'Elena', 'Jamal', 'Hannah', 'Lucas', 'Grace', 'Theo', 'Amara', 'Noah', 'Ines', 'Caleb', 'Rosa', 'Felix', 'Leila', 'Victor', 'Nora', 'Samuel', 'Aiko', 'Diego'];
const LAST = ['Bennett', 'Okafor', 'Sharma', 'Fitzgerald', 'Moreno', 'Hughes', 'Novak', 'Reyes', 'Lindqvist', 'Park', 'Adeyemi', 'Costa', 'Walsh', 'Nakamura', 'Duarte', 'Kowalski', 'Haddad', 'Brennan', 'Silva', 'Chen'];
const STREETS = ['Maple Ave', 'Cedar Ln', 'Riverside Dr', 'Oak St', 'Willow Way', 'Hillcrest Rd', 'Juniper Ct', 'Lakeview Blvd', 'Birch St', 'Sunset Ave', 'Elm Pl', 'Harbor Rd'];
const CITIES = [
  ['Springfield', 'OR', '97477'],
  ['Eugene', 'OR', '97401'],
  ['Salem', 'OR', '97301'],
  ['Corvallis', 'OR', '97330'],
];
const COMPANIES = ['Northwind Property Group', 'Brightside Dental', 'Harbor View HOA', 'Copperleaf Cafe', 'Summit Fitness'];

export function buildSampleData(today) {
  const rand = rng(20261012);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  // Local wall-clock time on that date, as an ISO timestamp.
  const ts = (iso, hour = 10) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, hour, Math.floor(rand() * 60)).toISOString();
  };

  const team = [
    { id: newId(), name: 'Alex Morgan', email: 'alex@example.com', phone: '(541) 555-0100', role: 'owner', color: TEAM_COLORS[0], laborRate: 4500, active: true },
    { id: newId(), name: 'Jordan Lee', email: 'jordan@example.com', phone: '(541) 555-0101', role: 'worker', color: TEAM_COLORS[1], laborRate: 3200, active: true },
    { id: newId(), name: 'Sam Rivera', email: 'sam@example.com', phone: '(541) 555-0102', role: 'worker', color: TEAM_COLORS[2], laborRate: 3000, active: true },
    { id: newId(), name: 'Taylor Brooks', email: 'taylor@example.com', phone: '(541) 555-0103', role: 'admin', color: TEAM_COLORS[3], laborRate: 2800, active: true },
  ];
  const crew = team.slice(1, 3);

  const products = [
    { name: '草坪修剪', kind: 'service', description: '修剪并齐边所有草坪区域，吹净硬化路面的草屑。', unitPrice: 6500, unitCost: 1800, taxable: true },
    { name: '春季大扫除', kind: 'service', description: '清理落叶和杂物，修剪多年生植物，翻新花坛边缘。', unitPrice: 32500, unitCost: 9000, taxable: true },
    { name: '秋季大扫除', kind: 'service', description: '清理草坪和花坛落叶，检查天沟，完成季末最后一次修剪。', unitPrice: 29500, unitCost: 8500, taxable: true },
    { name: '绿篱修剪', kind: 'service', description: '修剪并塑形 8 英尺以下的绿篱与灌木。', unitPrice: 18000, unitCost: 5000, taxable: true },
    { name: '铺设护根物', kind: 'service', description: '供应并铺设优质树皮护根物，按立方码计费。', unitPrice: 9500, unitCost: 4200, taxable: true },
    { name: '天沟清理', kind: 'service', description: '清理天沟与落水管，冲洗并检查排水畅通情况。', unitPrice: 17500, unitCost: 4000, taxable: true },
    { name: '灌溉系统检修', kind: 'service', description: '检查各分区、调整喷头并设置控制器定时计划。', unitPrice: 12500, unitCost: 2500, taxable: true },
    { name: '喷淋喷头', kind: 'product', description: '弹出式旋转喷头（含安装）。', unitPrice: 2400, unitCost: 900, taxable: true },
    { name: '草坪打孔与补播', kind: 'service', description: '草坪核心打孔透气并播撒优质混合草籽。', unitPrice: 21000, unitCost: 7000, taxable: true },
    { name: '人工费（按小时）', kind: 'service', description: '常规作业人工，按小时计费。', unitPrice: 6500, unitCost: 3000, taxable: false },
    { name: '上门除雪服务', kind: 'service', description: '清理车道与人行步道积雪。', unitPrice: 8500, unitCost: 2500, taxable: true },
    { name: '清运处置费', kind: 'product', description: '园林废弃物清运处置，按车次计费。', unitPrice: 4500, unitCost: 3000, taxable: false },
  ].map((p) => ({ id: newId(), active: true, ...p }));
  const product = (name) => products.find((p) => p.name === name);
  const item = (name, qty = 1) => {
    const p = product(name);
    return { id: newId(), productId: p.id, name: p.name, description: p.description, qty, unitPrice: p.unitPrice, unitCost: p.unitCost, taxable: p.taxable };
  };

  const clients = [];
  for (let i = 0; i < 24; i++) {
    const [city, region, postal] = pick(CITIES);
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const isCompany = i % 6 === 5;
    const created = addDays(today, -Math.floor(rand() * 300) - 5);
    clients.push({
      id: newId(),
      firstName: first,
      lastName: last,
      company: isCompany ? COMPANIES[(i / 6) | 0] : '',
      useCompanyName: isCompany,
      phones: [{ label: '手机', number: `(541) 555-${String(1200 + i * 37).slice(-4)}` }],
      emails: [{ label: '主要', address: `${first}.${last}@example.com`.toLowerCase() }],
      properties: [
        {
          id: newId(),
          street1: `${100 + Math.floor(rand() * 8800)} ${pick(STREETS)}`,
          street2: '',
          city,
          region,
          postal,
          country: 'United States',
        },
      ],
      billingSame: true,
      leadSource: pick(['转介绍', 'Google', '网站', '老客户', '传单']),
      tags: i % 4 === 0 ? ['定期客户'] : i % 5 === 0 ? ['商业客户'] : [],
      notes: i === 0 ? '大门密码 4412。后院有狗，很温顺。' : '',
      createdAt: ts(created),
      updatedAt: ts(created),
    });
  }

  const jobs = [];
  const quotes = [];
  const invoices = [];
  const payments = [];
  const requests = [];
  let jobNo = 1;
  let quoteNo = 1;
  let invoiceNo = 1;
  let requestNo = 1;

  const mkVisit = (date, start, durMin, assignees, completed) => ({
    id: newId(),
    date,
    start,
    end: start ? addMinutes(start, durMin) : '',
    assignees,
    completedAt: completed ? ts(date, 17) : null,
  });

  // Recurring weekly mowing for six clients.
  for (let i = 0; i < 6; i++) {
    const c = clients[i * 4];
    const start = addDays(startOfWeek(today), -21 + (i % 5) + 1);
    const dates = generateVisitDates({ start, repeat: 'weekly', interval: 1, end: { type: 'count', count: 16 } });
    const hour = 8 + (i % 4) * 2;
    const visits = dates.map((d) => mkVisit(d, `${String(hour).padStart(2, '0')}:00`, 60, [crew[i % 2].id], d < today));
    jobs.push({
      id: newId(),
      number: jobNo++,
      clientId: c.id,
      propertyId: c.properties[0].id,
      title: '每周草坪养护',
      instructions: '修剪前后院草坪，车道与人行道齐边，吹净露台。',
      schedule: { start, repeat: 'weekly', interval: 1, end: { type: 'count', count: 16 }, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` },
      assignees: [crew[i % 2].id],
      items: [item('草坪修剪', 1)],
      billing: 'per_visit',
      visits,
      createdAt: ts(addDays(start, -7)),
    });
  }

  // One-off jobs in all states.
  const oneOffs = [
    { title: '春季大扫除及铺设护根物', items: [item('春季大扫除'), item('铺设护根物', 6)], offset: -18, done: true, invoiced: 'paid' },
    { title: '天沟清理', items: [item('天沟清理')], offset: -12, done: true, invoiced: 'past_due' },
    { title: '前院绿篱修剪', items: [item('绿篱修剪'), item('清运处置费')], offset: -9, done: true, invoiced: 'awaiting' },
    { title: '灌溉系统维修', items: [item('灌溉系统检修'), item('喷淋喷头', 4)], offset: -4, done: true, invoiced: null },
    { title: '草坪打孔与补播', items: [item('草坪打孔与补播')], offset: -2, done: false, invoiced: null },
    { title: '秋季大扫除', items: [item('秋季大扫除'), item('清运处置费', 2)], offset: 0, done: false, invoiced: null },
    { title: '后院地面平整', items: [item('人工费（按小时）', 6), item('清运处置费')], offset: 1, done: false, invoiced: null },
    { title: '绿篱修剪与清理', items: [item('绿篱修剪'), item('人工费（按小时）', 2)], offset: 3, done: false, invoiced: null },
    { title: '天沟清理', items: [item('天沟清理')], offset: 6, done: false, invoiced: null },
    { title: '护根物换新', items: [item('铺设护根物', 4)], offset: 9, done: false, invoiced: null },
    { title: '商业园区巡检', items: [item('人工费（按小时）', 3)], offset: null, done: false, invoiced: null },
  ];
  oneOffs.forEach((o, i) => {
    const c = clients[(i * 5 + 1) % clients.length];
    const date = o.offset === null ? null : addDays(today, o.offset);
    const hour = 9 + (i % 4) * 2;
    const assignees = [crew[i % 2].id, ...(i % 3 === 0 ? [team[0].id] : [])];
    const quote = {
      id: newId(),
      number: quoteNo++,
      clientId: c.id,
      propertyId: c.properties[0].id,
      title: o.title,
      items: o.items.map((x) => ({ ...x, id: newId() })),
      taxRate: 0,
      status: 'approved',
      sentAt: ts(addDays(date || today, -14)),
      approvedAt: ts(addDays(date || today, -10)),
      createdAt: ts(addDays(date || today, -15)),
    };
    const job = {
      id: newId(),
      number: jobNo++,
      clientId: c.id,
      propertyId: c.properties[0].id,
      title: o.title,
      instructions: '',
      schedule: date ? { start: date, repeat: 'none', startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 3).padStart(2, '0')}:00` } : { start: null, repeat: 'none' },
      assignees,
      items: o.items,
      billing: 'on_completion',
      quoteId: quote.id,
      visits: date ? [mkVisit(date, `${String(hour).padStart(2, '0')}:00`, 180, assignees, o.done)] : [{ id: newId(), date: null, start: '', end: '', assignees, completedAt: null }],
      createdAt: quote.approvedAt,
    };
    quote.jobId = job.id;
    quotes.push(quote);
    jobs.push(job);
    if (o.invoiced) {
      const issue = addDays(date, 1);
      const inv = {
        id: newId(),
        number: invoiceNo++,
        clientId: c.id,
        propertyId: c.properties[0].id,
        jobIds: [job.id],
        subject: `已完成服务：${o.title}`,
        items: o.items.map((x) => ({ ...x, id: newId() })),
        taxRate: 0,
        issueDate: issue,
        terms: o.invoiced === 'past_due' ? 'net7' : 'net30',
        dueDate: addDays(issue, o.invoiced === 'past_due' ? 7 : 30),
        sentAt: ts(issue, 16),
        createdAt: ts(issue, 15),
      };
      invoices.push(inv);
      if (o.invoiced === 'paid') {
        const total = inv.items.reduce((s, it) => s + Math.round(it.qty * it.unitPrice), 0);
        payments.push({ id: newId(), invoiceId: inv.id, clientId: c.id, amount: total, method: 'card', date: addDays(issue, 3), reference: '', createdAt: ts(addDays(issue, 3)) });
      }
    }
  });

  // Invoices for completed recurring visits, most paid, a few open.
  for (const job of jobs.filter((j) => j.billing === 'per_visit')) {
    const done = job.visits.filter((v) => v.completedAt);
    done.forEach((v, idx) => {
      const issue = v.date;
      const inv = {
        id: newId(),
        number: invoiceNo++,
        clientId: job.clientId,
        propertyId: job.propertyId,
        jobIds: [job.id],
        visitIds: [v.id],
        subject: `草坪养护，${issue}`,
        items: job.items.map((x) => ({ ...x, id: newId() })),
        taxRate: 0,
        issueDate: issue,
        terms: 'net15',
        dueDate: addDays(issue, 15),
        sentAt: ts(issue, 18),
        createdAt: ts(issue, 18),
      };
      invoices.push(inv);
      v.invoiceId = inv.id;
      if (idx < done.length - 1 || rand() < 0.4) {
        const method = pick(['card', 'cash', 'check', 'bank']);
        // Paid a few days later, but never after today.
        const paid = addDays(issue, Math.floor(rand() * 6) + 1);
        const date = paid < today ? paid : today;
        payments.push({ id: newId(), invoiceId: inv.id, clientId: job.clientId, amount: 6500, method, date, reference: '', createdAt: ts(date) });
      }
    });
  }

  // Historical revenue over the past months so reports have shape.
  for (let m = 6; m >= 1; m--) {
    const count = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < count; k++) {
      const c = pick(clients);
      const issue = addDays(addMonths(today, -m), Math.floor(rand() * 25) - 12);
      const its = [item(pick(['春季大扫除', '绿篱修剪', '天沟清理', '灌溉系统检修', '草坪打孔与补播', '秋季大扫除']))];
      const inv = {
        id: newId(),
        number: invoiceNo++,
        clientId: c.id,
        propertyId: c.properties[0].id,
        jobIds: [],
        subject: its[0].name,
        items: its,
        taxRate: 0,
        issueDate: issue,
        terms: 'net30',
        dueDate: addDays(issue, 30),
        sentAt: ts(issue, 12),
        createdAt: ts(issue, 12),
      };
      invoices.push(inv);
      payments.push({ id: newId(), invoiceId: inv.id, clientId: c.id, amount: its[0].qty * its[0].unitPrice, method: pick(['card', 'check', 'bank']), date: addDays(issue, Math.floor(rand() * 12) + 2), reference: '', createdAt: ts(issue) });
    }
  }

  // Quotes waiting on the client, a draft, and one with changes requested.
  const openQuotes = [
    { title: '庭院整体翻新', items: [item('春季大扫除'), item('铺设护根物', 10), item('人工费（按小时）', 8)], status: 'awaiting_response', sent: -5 },
    { title: '季节性养护套餐', items: [item('春季大扫除'), item('秋季大扫除'), { ...item('草坪打孔与补播'), optional: true }], status: 'awaiting_response', sent: -2 },
    { title: '灌溉系统升级', items: [item('灌溉系统检修'), item('喷淋喷头', 12)], status: 'changes_requested', sent: -8 },
    { title: '冬季除雪服务', items: [item('上门除雪服务', 10)], status: 'draft', sent: null },
    { title: '绿篱与树木修剪', items: [item('绿篱修剪', 2), item('清运处置费')], status: 'approved', sent: -3 },
  ];
  openQuotes.forEach((q, i) => {
    const c = clients[(i * 3 + 2) % clients.length];
    quotes.push({
      id: newId(),
      number: quoteNo++,
      clientId: c.id,
      propertyId: c.properties[0].id,
      title: q.title,
      items: q.items,
      taxRate: 0,
      status: q.status,
      sentAt: q.sent === null ? null : ts(addDays(today, q.sent)),
      approvedAt: q.status === 'approved' ? ts(addDays(today, -1)) : null,
      message: '',
      createdAt: ts(addDays(today, (q.sent ?? 0) - 1)),
    });
  });

  // Incoming requests.
  const reqs = [
    { title: '到处是落叶，需要清理', details: '前院有一棵大枫树。希望在下雨前清理草坪和天沟里的落叶。', assess: null, offset: 0 },
    { title: '咨询每周草坪修剪报价', details: '前后院大约四分之一英亩，计划明年春天开始。', assess: null, offset: -1 },
    { title: '后院排水问题', details: '大雨过后围栏旁会积水，需要有人来看看地面坡度平整。', assess: 2, offset: -3 },
    { title: '商业园区绿化养护合同', details: '三栋建筑，按月养护。请发送方案报价。', assess: -1, offset: -6 },
    { title: '喷淋头无法启动', details: '3 号分区上周停止工作了。', assess: -4, done: true, offset: -8 },
  ];
  reqs.forEach((r, i) => {
    const c = clients[(i * 5 + 3) % clients.length];
    requests.push({
      id: newId(),
      number: requestNo++,
      clientId: c.id,
      propertyId: c.properties[0].id,
      title: r.title,
      details: r.details,
      source: pick(['网站', '电话', '邮件']),
      availability: { dates: [addDays(today, 3), addDays(today, 5)], times: ['morning'] },
      assessment: r.assess === null ? null : { date: addDays(today, r.assess), start: '10:00', end: '11:00', assignees: [team[0].id], completedAt: r.done ? ts(addDays(today, r.assess), 11) : null },
      createdAt: ts(addDays(today, r.offset), 9 + i),
    });
  });

  // Expenses and time entries.
  const expenses = [];
  const cats = ['材料', '燃油', '设备', '清运'];
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, -Math.floor(rand() * 40));
    const cat = pick(cats);
    const job = rand() < 0.5 ? pick(jobs) : null;
    expenses.push({
      id: newId(),
      date,
      title: { 材料: '树皮护根物，6 立方码', 燃油: '卡车燃油', 设备: '打草机绳与刀片', 清运: '园林废弃物倾倒费' }[cat],
      category: cat === '清运' ? '其他' : cat,
      amount: Math.round((20 + rand() * 180) * 100),
      jobId: job?.id || null,
      paidBy: pick(team).id,
      notes: '',
      createdAt: ts(date),
    });
  }

  const timeEntries = [];
  for (let d = -13; d <= 0; d++) {
    const date = addDays(today, d);
    const wd = weekday(date);
    if (wd === 0 || wd === 6) continue;
    for (const m of crew) {
      const startH = 7 + Math.floor(rand() * 2);
      const lengthMin = 7 * 60 + Math.floor(rand() * 90);
      if (d === 0) {
        // Today: one person is still on the clock.
        if (m === crew[0]) timeEntries.push({ id: newId(), memberId: m.id, date, start: `${date}T${String(startH).padStart(2, '0')}:00`, end: null, jobId: null, notes: '', createdAt: ts(date) });
        continue;
      }
      timeEntries.push({
        id: newId(),
        memberId: m.id,
        date,
        start: `${date}T${String(startH).padStart(2, '0')}:00`,
        end: `${date}T${addMinutes(`${String(startH).padStart(2, '0')}:00`, lengthMin)}`,
        jobId: null,
        notes: '',
        createdAt: ts(date),
      });
    }
  }

  const events = [
    { id: newId(), kind: 'task', title: '预订下周所需的护根物', date: addDays(today, 1), start: '', end: '', assignees: [team[3].id], completedAt: null, notes: '' },
    { id: newId(), kind: 'event', title: '前往经销商处保养设备', date: addDays(today, 2), start: '13:00', end: '15:00', assignees: [team[0].id], completedAt: null, notes: '' },
    { id: newId(), kind: 'task', title: '跟进灌溉系统报价单', date: today, start: '', end: '', assignees: [team[0].id], completedAt: null, notes: '' },
  ];

  const settings = {
    company: {
      name: 'Greenline 户外服务',
      phone: '(541) 555-0199',
      email: 'hello@greenline.example',
      website: 'greenline.example',
      address: '410 Mill St, Springfield, OR 97477',
      taxId: '',
    },
    taxes: [{ id: 'tax-state', name: '销售税', rate: 0 }],
    defaultTaxId: null,
    onboarded: true,
  };

  return { settings, collections: { team, products, clients, jobs, quotes, invoices, payments, requests, expenses, timeEntries, events } };
}

function addMinutes(time, min) {
  const [h, m] = time.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + min);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
