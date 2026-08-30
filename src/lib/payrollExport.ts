import ExcelJS from 'exceljs';
import type { IPayrollLine, IPayrollMonth } from '@/models/PayrollMonth';
import { formatMonthLabel, normalizePayrollExtraFields, plainCustomAmounts } from '@/lib/salaryCalculation';

const GROUP_LABEL: Record<string, string> = {
  fixed: 'Fixed Salary',
  partner: "Partner' Salary",
  staff: 'Staff Salary',
  admin: 'Admin Salary',
  article: 'Articles / Interns',
};

const GROUP_ORDER = ['fixed', 'partner', 'staff', 'admin', 'article'] as const;

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export async function buildPayrollWorkbook(doc: IPayrollMonth): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Attendance Console';
  const ws = workbook.addWorksheet('Salary');

  const monthLabel = formatMonthLabel(doc.monthYear);
  const [y, m] = doc.monthYear.split('-').map(Number);
  const start = `01.${String(m).padStart(2, '0')}.${y}`;
  const last = new Date(y, m, 0).getDate();
  const end = `${String(last).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;

  const extraFields = normalizePayrollExtraFields(doc.extraFields);
  const extraHeaders = extraFields.map((f) => `${f.label} (${f.kind === 'deduction' ? 'deduction' : 'earning'})`);
  const headers1 = [
    '',
    'Paid From',
    '',
    'Employee Name as per Master Sheet',
    'Employee Name for Reference Purpose Only',
    'Category',
    'Authorised Vertical Head',
    'New Join',
    'PIO',
    'WO-PIO',
    'OS-P',
    'A',
    'HD',
    'Weekoff HD (Days)',
    'Weekoffs (Inc. Sun+OHD)',
    'Sun (Days)',
    'OHD (Days)',
    'WFH (In Weekoff)',
    'WFH (Days)',
    'WFH (Max Day Allowed)',
    'Absent WFH Fixed 0.25',
    'Present WFH (Actual)',
    'Absent WFH (Max-Actual)',
    'Staff Weekdays- Working',
    'Leaves Taken By Staff',
    'Leaves B/F',
    'Leaves Earned This Month',
    'Leaves Consumed This Month',
    'C/F Leaves',
    'Staff Weekoff Working Days',
    'Staff Overtime',
    'Net Staff Working days',
    'Office Working Days',
    'Checking',
    'Basic',
    'Laptop',
    'Payable for Basic',
    'Payable for Laptop',
    'Payable for the Month',
    'Due in tally',
    'Addition in Off Due',
    'CASH OFF DUE',
    'Add - Other Extra',
    'ESI - Employer',
    'ESI - Employee',
    'TDS',
    'Advances',
    'OFF',
    'Bank Payment',
    'Cash Off',
    'Diff',
    'Email',
    ...extraHeaders,
  ];

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `For the Period ${start} to ${end}  (${monthLabel})`;
  ws.getCell('A1').font = { bold: true, size: 12 };

  const headerRow = ws.addRow(headers1);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  const lines = (doc.lines || []) as IPayrollLine[];
  const grouped = new Map<string, IPayrollLine[]>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  for (const line of lines) {
    const g = GROUP_ORDER.includes(line.group as (typeof GROUP_ORDER)[number]) ? line.group : 'staff';
    grouped.get(g)!.push(line);
  }

  const moneyCols = new Set([
    35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    ...extraFields.map((_, i) => 53 + i),
  ]);

  const extraAmounts = (line: IPayrollLine) => {
    const amounts = plainCustomAmounts(line.overrides?.customAmounts);
    return extraFields.map((f) => Number(amounts[f.id] || 0));
  };

  const addLine = (line: IPayrollLine, fill?: string) => {
    const tallyName = line.tallyName || `${line.name}${line.isArticle ? ' - Stipend' : ' - Staff Salary'}`;
    const row = ws.addRow([
      '',
      line.paidFrom || '',
      '',
      line.name,
      tallyName,
      line.category,
      line.verticalHead,
      line.isNewJoin ? 'Yes' : 'No',
      line.pio,
      line.woPio,
      line.osP,
      line.absent,
      line.hd,
      line.weekoffHd,
      line.weekoffs,
      line.sun,
      line.ohd,
      line.wfhWeekoff,
      line.wfhWeekday,
      line.wfhMaxAllowed,
      line.absentWfh,
      line.presentWfhActual,
      line.absentWfhMaxActual,
      line.weekdaysWorking,
      line.leavesTaken,
      line.leavesBf,
      line.leavesEarned,
      line.leavesConsumed,
      line.leavesCf,
      line.weekoffWorking,
      line.overtimeDays,
      line.netWorkingDays,
      line.officeWorkingDays,
      line.checking,
      line.basic,
      line.laptop,
      line.payableBasic,
      line.payableLaptop,
      line.payableMonth,
      line.dueInTally,
      line.additionInOffDue,
      line.cashOffDue,
      line.otherExtra,
      line.esiEmployer,
      line.esiEmployee,
      line.tds,
      line.advances,
      line.off,
      line.bankPayment,
      line.cashOff,
      line.diff,
      line.email || line.attendanceEmail,
      ...extraAmounts(line),
    ]);
    row.eachCell((cell, col) => {
      cell.font = { size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: col <= 8 || col === 52 ? 'left' : 'center' };
      if (fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      }
      if (moneyCols.has(col)) {
        cell.numFmt = '#,##0';
      }
    });
    return row;
  };

  const addSubtotal = (label: string, rows: IPayrollLine[]) => {
    const sum = (fn: (l: IPayrollLine) => number) => rows.reduce((s, l) => s + num(fn(l)), 0);
    const row = ws.addRow([
      '',
      '',
      '',
      label,
      '',
      'Sub Total',
      '',
      '',
      sum((l) => l.pio),
      sum((l) => l.woPio),
      sum((l) => l.osP),
      sum((l) => l.absent),
      sum((l) => l.hd),
      sum((l) => l.weekoffHd),
      sum((l) => l.weekoffs),
      sum((l) => l.sun),
      sum((l) => l.ohd),
      sum((l) => l.wfhWeekoff),
      sum((l) => l.wfhWeekday),
      sum((l) => l.wfhMaxAllowed),
      sum((l) => l.absentWfh),
      sum((l) => l.presentWfhActual),
      sum((l) => l.absentWfhMaxActual),
      sum((l) => l.weekdaysWorking),
      sum((l) => l.leavesTaken),
      sum((l) => l.leavesBf),
      sum((l) => l.leavesEarned),
      sum((l) => l.leavesConsumed),
      sum((l) => l.leavesCf),
      sum((l) => l.weekoffWorking),
      sum((l) => l.overtimeDays),
      sum((l) => l.netWorkingDays),
      '',
      '',
      sum((l) => l.basic),
      sum((l) => l.laptop),
      sum((l) => l.payableBasic),
      sum((l) => l.payableLaptop),
      sum((l) => l.payableMonth),
      sum((l) => l.dueInTally),
      sum((l) => l.additionInOffDue),
      sum((l) => l.cashOffDue),
      sum((l) => l.otherExtra),
      sum((l) => l.esiEmployer),
      sum((l) => l.esiEmployee),
      sum((l) => l.tds),
      sum((l) => l.advances),
      sum((l) => l.off),
      sum((l) => l.bankPayment),
      sum((l) => l.cashOff),
      sum((l) => l.diff),
      '',
      ...extraFields.map((f) =>
        rows.reduce((s, l) => s + Number(plainCustomAmounts(l.overrides?.customAmounts)[f.id] || 0), 0)
      ),
    ]);
    row.eachCell((cell, col) => {
      cell.font = { bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      if (moneyCols.has(col)) cell.numFmt = '#,##0';
    });
  };

  for (const g of GROUP_ORDER) {
    const rows = grouped.get(g) || [];
    if (rows.length === 0) continue;
    for (const line of rows) addLine(line);
    addSubtotal(`Total - ${GROUP_LABEL[g]}`, rows);
    ws.addRow([]);
  }

  const grand = lines;
  if (grand.length) addSubtotal('Grand Total', grand);

  ws.columns.forEach((col, i) => {
    col.width = i === 3 || i === 4 ? 28 : i === 51 ? 28 : 12;
  });
  ws.views = [{ state: 'frozen', xSplit: 8, ySplit: 2 }];

  const cms = workbook.addWorksheet('Bank Payment');
  cms.columns = [
    { header: 'Cust ID', key: 'cust', width: 12 },
    { header: 'Product', key: 'product', width: 10 },
    { header: 'Mode', key: 'mode', width: 8 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Debit A/c', key: 'debit', width: 14 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'IFSC', key: 'ifsc', width: 14 },
    { header: 'Account', key: 'account', width: 20 },
    { header: 'Team', key: 'team', width: 18 },
  ];
  cms.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cms.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
  const payDate = `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
  for (const line of lines) {
    if (!line.bankPayment) continue;
    cms.addRow({
      cust: 'ASIJAAAL',
      product: 'VPAY',
      mode: String(line.ifscCode || '').toUpperCase().startsWith('KKBK') ? 'IFT' : 'NEFT',
      date: payDate,
      debit: '',
      amount: line.bankPayment,
      name: line.accountHolderName || line.name,
      ifsc: line.ifscCode,
      account: line.accountNumber,
      team: line.verticalHead || line.team,
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
