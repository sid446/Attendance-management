import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import type { IPayrollLine } from '@/models/PayrollMonth';
import { escapeHtml } from '@/lib/attendanceRequestEmail';

export type PayslipCalendar = {
  totalDays: number;
  sundays: number;
  ohd: number;
};

const HEADER_FILL: [number, number, number] = [219, 229, 241];
const TOTAL_FILL: [number, number, number] = [243, 243, 243];
const LEFT = 32.16;
const COL4 = [136.8, 136.8, 136.8, 137.28];
const COL6 = [91.2, 91.2, 91.2, 91.2, 91.2, 91.68];
const COL5 = [109.44, 109.44, 109.44, 109.44, 109.92];
const COL2 = [273.6, 274.08];

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

type CellAlign = 'left' | 'center' | 'right';
type Cell = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  align?: CellAlign;
  size?: number;
  fill?: [number, number, number] | null;
};

type FontSet = { family: string; rupee: string };

const FONT_PATHS = {
  normal: [
    path.join(process.cwd(), 'fonts', 'calibri.ttf'),
    'C:\\Windows\\Fonts\\calibri.ttf',
  ],
  bold: [
    path.join(process.cwd(), 'fonts', 'calibrib.ttf'),
    'C:\\Windows\\Fonts\\calibrib.ttf',
  ],
  italic: [
    path.join(process.cwd(), 'fonts', 'calibrii.ttf'),
    'C:\\Windows\\Fonts\\calibrii.ttf',
  ],
};

function readFirst(paths: string[]): Buffer | null {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {
      // continue
    }
  }
  return null;
}

function registerCalibri(doc: jsPDF): FontSet {
  const normal = readFirst(FONT_PATHS.normal);
  const bold = readFirst(FONT_PATHS.bold);
  const italic = readFirst(FONT_PATHS.italic);
  if (!normal || !bold || !italic) {
    return { family: 'helvetica', rupee: 'Rs.' };
  }
  doc.addFileToVFS('Calibri.ttf', normal.toString('base64'));
  doc.addFileToVFS('Calibri-Bold.ttf', bold.toString('base64'));
  doc.addFileToVFS('Calibri-Italic.ttf', italic.toString('base64'));
  doc.addFont('Calibri.ttf', 'Calibri', 'normal');
  doc.addFont('Calibri-Bold.ttf', 'Calibri', 'bold');
  doc.addFont('Calibri-Italic.ttf', 'Calibri', 'italic');
  return { family: 'Calibri', rupee: '₹' };
}

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${ONES[h]} Hundred` : '';
  if (!rest) return head;
  return head ? `${head} and ${twoDigits(rest)}` : twoDigits(rest);
}

export function amountInWords(value: number): string {
  const rupees = Math.round(Math.abs(Number(value) || 0));
  if (rupees === 0) return 'Zero Rupees Only';
  const crore = Math.floor(rupees / 1_00_00_000);
  const lakh = Math.floor((rupees % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((rupees % 1_00_000) / 1000);
  const rest = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return `${parts.join(' ')} Rupees Only`;
}

function dashAmt(n: number): string {
  if (!n) return '-';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function fmtDays(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function fmtLeave(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

function joinDateLabel(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${months[d.getMonth()]}-${yy}`;
}

function monthTitle(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  return `PAYSLIP FOR THE MONTH OF ${label}`;
}

function textOrDash(v: unknown): string {
  const s = String(v || '').trim();
  return s || '-';
}

function loadLogo(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'asija-logo.jpg'),
    path.join(process.cwd(), 'public', 'asija-logo.jpeg'),
    path.join(process.cwd(), 'attendance-app', 'public', 'asija-logo.jpg'),
    path.join(process.cwd(), 'attendance-app', 'public', 'asija-logo.jpeg'),
  ];
  return readFirst(candidates);
}

function logoDataUri(): string | null {
  const buf = loadLogo();
  if (!buf) return null;
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function drawTable(
  doc: jsPDF,
  font: FontSet,
  x0: number,
  y0: number,
  widths: number[],
  heights: number[],
  grid: Cell[][]
): number {
  const xs = [x0];
  for (const w of widths) xs.push(xs[xs.length - 1] + w);
  const ys = [y0];
  for (const h of heights) ys.push(ys[ys.length - 1] + h);

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const fill = grid[r][c].fill;
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(xs[c], ys[r], widths[c], heights[r], 'F');
      }
    }
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const xEnd = xs[xs.length - 1];
  const yEnd = ys[ys.length - 1];
  for (const y of ys) doc.line(x0, y, xEnd, y);
  for (const x of xs) doc.line(x, y0, x, yEnd);

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell.text) continue;
      const size = cell.size ?? 8.5;
      const style = cell.italic ? 'italic' : cell.bold ? 'bold' : 'normal';
      doc.setFont(font.family, style);
      doc.setFontSize(size);
      doc.setTextColor(0, 0, 0);
      const pad = 5.64;
      const w = widths[c];
      const h = heights[r];
      const ty = ys[r] + h / 2 + size * 0.28;
      const align = cell.align || 'left';
      const maxWidth = Math.max(8, w - pad * 2);
      if (align === 'center') {
        doc.text(cell.text, xs[c] + w / 2, ty, { align: 'center', maxWidth });
      } else if (align === 'right') {
        doc.text(cell.text, xs[c] + w - pad, ty, { align: 'right', maxWidth });
      } else {
        doc.text(cell.text, xs[c] + pad, ty, { maxWidth });
      }
    }
  }
  return yEnd;
}

function payslipValues(line: IPayrollLine, calendar?: PayslipCalendar) {
  const weekoffHoliday = calendar
    ? calendar.sundays + calendar.ohd
    : Number(line.sun || 0) + Number(line.ohd || 0);
  const paidLeave = line.isArticle ? 0 : Number(line.leavesConsumed || 0);
  const staffWorking = Number(line.weekdaysWorking || 0) + paidLeave;
  const otherAllowance =
    Number(line.otherAllowance || 0) +
    Number(line.otherExtra || 0) +
    Number(line.customEarnings || 0);
  const projectAllowance = Number(line.taReimbursement || 0) + Number(line.lcReimbursement || 0);
  const basicAmt = Number(line.payableBasic || line.basic || 0);
  const laptopAmt = Number(line.payableLaptop || line.laptop || 0);
  const gross = basicAmt + laptopAmt + otherAllowance + projectAllowance;
  const esicAmt = Number(line.esiEmployee || 0);
  const advanceAmt = Number(line.advances || 0);
  const otherDed =
    Number(line.tds || 0) + Number(line.laptopAdjustment || 0) + Number(line.customDeductions || 0);
  const totalDed = esicAmt + advanceAmt + otherDed;
  const net = gross - totalDed;
  const department = textOrDash(line.team || line.verticalHead);
  const esiNo = textOrDash(line.esiNumber);
  return {
    weekoffHoliday,
    paidLeave,
    staffWorking,
    otherAllowance,
    projectAllowance,
    basicAmt,
    laptopAmt,
    gross,
    esicAmt,
    advanceAmt,
    otherDed,
    totalDed,
    net,
    department,
    esiNo,
  };
}

function h(text: string, extra?: Partial<Cell>): Cell {
  return { text, bold: true, fill: HEADER_FILL, size: 8.5, ...extra };
}

function v(text: string, extra?: Partial<Cell>): Cell {
  return { text, size: 9, ...extra };
}

export function buildPayslipPdf(
  line: IPayrollLine,
  monthYear: string,
  calendar?: PayslipCalendar
): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const font = registerCalibri(doc);
  const vals = payslipValues(line, calendar);

  const logo = loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 145.05, 28.1, 47.45, 47.45);
    } catch {
      // continue without logo
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont(font.family, 'bold');
  doc.setFontSize(14);
  doc.text('ASIJA & ASSOCIATES LLP', 311.4, 35.3);
  doc.setFont(font.family, 'italic');
  doc.setFontSize(9.5);
  doc.text('Chartered Accountants', 311.4, 51.9);
  doc.setFont(font.family, 'normal');
  doc.setFontSize(8.5);
  doc.text('1st Floor, 34/5, Gokhale Marg, Butler Colony, Lucknow – 226001', 311.4, 63.9);

  doc.setFont(font.family, 'bold');
  doc.setFontSize(12);
  doc.text(monthTitle(monthYear), 306, 88.7, { align: 'center' });

  drawTable(doc, font, LEFT, 106.92, COL4, [11.52, 11.52, 11.52, 11.88], [
    [h('Employee Name'), v(textOrDash(line.name)), h('Employee Code'), v(textOrDash(line.employeeCode || line.odId))],
    [h('Designation'), v(textOrDash(line.designation)), h('Joining Date'), v(joinDateLabel(line.joiningDate))],
    [h('Department / Vertical'), v(vals.department), h('ESIC No.'), v(vals.esiNo, { align: vals.esiNo === '-' ? 'center' : 'left' })],
    [h('Bank Name'), v(textOrDash(line.bankName)), h('Bank A/C No.'), v(textOrDash(line.accountNumber))],
  ]);

  const attHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 8.5 };
  drawTable(doc, font, LEFT, 176.04, COL6, [10.92, 12.0], [
    [
      { ...attHead, text: 'Office Working Days' },
      { ...attHead, text: 'Staff Working Days' },
      { ...attHead, text: 'Days Paid' },
      { ...attHead, text: 'WeekOff / Holiday' },
      { ...attHead, text: 'Absent' },
      { ...attHead, text: 'Paid Leave' },
    ],
    [
      v(fmtDays(line.officeWorkingDays), { align: 'center' }),
      v(fmtDays(vals.staffWorking), { align: 'center' }),
      v(fmtDays(line.netWorkingDays), { align: 'center' }),
      v(fmtDays(vals.weekoffHoliday), { align: 'center' }),
      v(fmtDays(line.absent), { align: 'center' }),
      v(fmtDays(vals.paidLeave), { align: 'center' }),
    ],
  ]);

  const amt = (n: number): Cell => v(dashAmt(n), { align: 'center' });
  const earnHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 9 };
  drawTable(doc, font, LEFT, 221.52, COL4, [11.52, 11.52, 11.52, 11.52, 11.52, 11.52, 11.88], [
    [
      { ...earnHead, text: 'EARNINGS' },
      { ...earnHead, text: `AMOUNT (${font.rupee})` },
      { ...earnHead, text: 'DEDUCTIONS' },
      { ...earnHead, text: `AMOUNT (${font.rupee})` },
    ],
    [v('Basic Salary', { size: 8.5 }), amt(vals.basicAmt), v('ESIC', { size: 8.5 }), amt(vals.esicAmt)],
    [v('Laptop Allowance', { size: 8.5 }), amt(vals.laptopAmt), v('Advance / Recovery', { size: 8.5 }), amt(vals.advanceAmt)],
    [v('Other Allowance', { size: 8.5 }), amt(vals.otherAllowance), v('Other Deductions', { size: 8.5 }), amt(vals.otherDed)],
    [v('Project Allowance', { size: 8.5 }), amt(vals.projectAllowance), v(''), v('')],
    [v(''), v(''), v(''), v('')],
    [
      { text: 'Gross Earnings', bold: true, fill: TOTAL_FILL, size: 8.5 },
      { text: dashAmt(vals.gross), fill: TOTAL_FILL, align: 'center', size: 9 },
      { text: 'Total Deductions', bold: true, fill: TOTAL_FILL, size: 8.5 },
      { text: dashAmt(vals.totalDed), fill: TOTAL_FILL, align: 'center', size: 9 },
    ],
  ]);

  drawTable(doc, font, LEFT, 325.08, COL2, [12.12, 13.2], [
    [
      { text: 'NET PAY', bold: true, fill: HEADER_FILL, size: 9.5 },
      { text: `${font.rupee}${dashAmt(vals.net)}`, bold: true, fill: HEADER_FILL, align: 'center', size: 9 },
    ],
    [
      { text: 'Amount in Words', bold: true, size: 8.5 },
      { text: amountInWords(vals.net), bold: true, align: 'center', size: 10 },
    ],
  ]);

  const leaveHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 8 };
  const leaveVals = line.isArticle
    ? ['-', '-', '-', '-', '-']
    : [
        fmtLeave(line.leavesBf),
        fmtLeave(line.leavesEarned),
        fmtLeave(line.leavesConsumed),
        fmtLeave(line.leavesBf),
        fmtLeave(line.leavesCf),
      ];
  drawTable(doc, font, LEFT, 373.08, COL5, [10.2, 12.0], [
    [
      { ...leaveHead, text: 'Leave B/F' },
      { ...leaveHead, text: 'Earned Leave' },
      { ...leaveHead, text: 'Leave Availed' },
      { ...leaveHead, text: 'Leave C/F' },
      { ...leaveHead, text: 'Leave Balance' },
    ],
    leaveVals.map((text) => v(text, { align: 'center' })),
  ]);

  doc.setFont(font.family, 'bold');
  doc.setFontSize(9);
  doc.text(
    'Note: This is a computer-generated payslip and does not require a signature.',
    LEFT,
    424.4
  );

  return Buffer.from(doc.output('arraybuffer'));
}

export function buildPayslipHtml(
  line: IPayrollLine,
  monthYear: string,
  calendar?: PayslipCalendar
): string {
  const vals = payslipValues(line, calendar);
  const title = monthTitle(monthYear);
  const logo = logoDataUri();
  const th =
    'background:#dbe5f1;font-weight:700;border:1px solid #000;padding:5px 8px;font-size:12px;font-family:Calibri,Arial,sans-serif;';
  const td =
    'border:1px solid #000;padding:5px 8px;font-size:12px;font-family:Calibri,Arial,sans-serif;';
  const tot =
    'background:#f3f3f3;font-weight:700;border:1px solid #000;padding:5px 8px;font-size:12px;font-family:Calibri,Arial,sans-serif;';
  const net =
    'background:#dbe5f1;font-weight:700;border:1px solid #000;padding:5px 8px;font-size:13px;font-family:Calibri,Arial,sans-serif;';
  const leaveVals = line.isArticle
    ? ['-', '-', '-', '-', '-']
    : [
        fmtLeave(line.leavesBf),
        fmtLeave(line.leavesEarned),
        fmtLeave(line.leavesConsumed),
        fmtLeave(line.leavesBf),
        fmtLeave(line.leavesCf),
      ];
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#fff;color:#000;font-family:Calibri,Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;">
    <table style="margin:0 auto 10px auto;border-collapse:collapse;">
      <tr>
        ${logo ? `<td style="vertical-align:middle;padding-right:16px;"><img src="${logo}" width="52" height="52" alt="Asija" /></td>` : ''}
        <td style="vertical-align:middle;">
          <div style="font-size:18px;font-weight:700;">ASIJA &amp; ASSOCIATES LLP</div>
          <div style="font-size:13px;font-style:italic;">Chartered Accountants</div>
          <div style="font-size:11px;">1st Floor, 34/5, Gokhale Marg, Butler Colony, Lucknow – 226001</div>
        </td>
      </tr>
    </table>
    <div style="text-align:center;font-size:15px;font-weight:700;margin:8px 0 12px;">${escapeHtml(title)}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="${th}">Employee Name</td><td style="${td}">${escapeHtml(textOrDash(line.name))}</td>
        <td style="${th}">Employee Code</td><td style="${td}">${escapeHtml(textOrDash(line.employeeCode || line.odId))}</td>
      </tr>
      <tr>
        <td style="${th}">Designation</td><td style="${td}">${escapeHtml(textOrDash(line.designation))}</td>
        <td style="${th}">Joining Date</td><td style="${td}">${escapeHtml(joinDateLabel(line.joiningDate))}</td>
      </tr>
      <tr>
        <td style="${th}">Department / Vertical</td><td style="${td}">${escapeHtml(vals.department)}</td>
        <td style="${th}">ESIC No.</td><td style="${td}">${escapeHtml(vals.esiNo)}</td>
      </tr>
      <tr>
        <td style="${th}">Bank Name</td><td style="${td}">${escapeHtml(textOrDash(line.bankName))}</td>
        <td style="${th}">Bank A/C No.</td><td style="${td}">${escapeHtml(textOrDash(line.accountNumber))}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;text-align:center;">
      <tr>
        <td style="${th}">Office Working Days</td>
        <td style="${th}">Staff Working Days</td>
        <td style="${th}">Days Paid</td>
        <td style="${th}">WeekOff / Holiday</td>
        <td style="${th}">Absent</td>
        <td style="${th}">Paid Leave</td>
      </tr>
      <tr>
        <td style="${td}">${fmtDays(line.officeWorkingDays)}</td>
        <td style="${td}">${fmtDays(vals.staffWorking)}</td>
        <td style="${td}">${fmtDays(line.netWorkingDays)}</td>
        <td style="${td}">${fmtDays(vals.weekoffHoliday)}</td>
        <td style="${td}">${fmtDays(line.absent)}</td>
        <td style="${td}">${fmtDays(vals.paidLeave)}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="${th}text-align:center;">EARNINGS</td>
        <td style="${th}text-align:center;">AMOUNT (₹)</td>
        <td style="${th}text-align:center;">DEDUCTIONS</td>
        <td style="${th}text-align:center;">AMOUNT (₹)</td>
      </tr>
      <tr>
        <td style="${td}">Basic Salary</td><td style="${td}text-align:center;">${dashAmt(vals.basicAmt)}</td>
        <td style="${td}">ESIC</td><td style="${td}text-align:center;">${dashAmt(vals.esicAmt)}</td>
      </tr>
      <tr>
        <td style="${td}">Laptop Allowance</td><td style="${td}text-align:center;">${dashAmt(vals.laptopAmt)}</td>
        <td style="${td}">Advance / Recovery</td><td style="${td}text-align:center;">${dashAmt(vals.advanceAmt)}</td>
      </tr>
      <tr>
        <td style="${td}">Other Allowance</td><td style="${td}text-align:center;">${dashAmt(vals.otherAllowance)}</td>
        <td style="${td}">Other Deductions</td><td style="${td}text-align:center;">${dashAmt(vals.otherDed)}</td>
      </tr>
      <tr>
        <td style="${td}">Project Allowance</td><td style="${td}text-align:center;">${dashAmt(vals.projectAllowance)}</td>
        <td style="${td}"></td><td style="${td}"></td>
      </tr>
      <tr>
        <td style="${td}"></td><td style="${td}"></td>
        <td style="${td}"></td><td style="${td}"></td>
      </tr>
      <tr>
        <td style="${tot}">Gross Earnings</td><td style="${tot}text-align:center;">${dashAmt(vals.gross)}</td>
        <td style="${tot}">Total Deductions</td><td style="${tot}text-align:center;">${dashAmt(vals.totalDed)}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="${net}">NET PAY</td>
        <td style="${net}text-align:center;">₹${dashAmt(vals.net)}</td>
      </tr>
      <tr>
        <td style="${td}"><b>Amount in Words</b></td>
        <td style="${td}"><b>${escapeHtml(amountInWords(vals.net))}</b></td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;text-align:center;">
      <tr>
        <td style="${th}">Leave B/F</td>
        <td style="${th}">Earned Leave</td>
        <td style="${th}">Leave Availed</td>
        <td style="${th}">Leave C/F</td>
        <td style="${th}">Leave Balance</td>
      </tr>
      <tr>${leaveVals.map((val) => `<td style="${td}">${escapeHtml(val)}</td>`).join('')}</tr>
    </table>
    <p style="font-size:12px;font-weight:700;">Note: This is a computer-generated payslip and does not require a signature.</p>
  </div>
</body>
</html>`;
}

function payslipShortName(name: string): string {
  const parts = String(name || 'Employee').trim().split(/\s+/).filter(Boolean);
  const skip = /^(mohd|mohammed|md|mr|mrs|ms|miss)\.?$/i;
  const filtered = parts.filter((p) => !skip.test(p));
  const chosen = (filtered[0] || parts[0] || 'Employee').replace(/[^\w.-]/g, '');
  return chosen || 'Employee';
}

export function payslipFileName(line: IPayrollLine, monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  const mon = new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
  const yy = String(y).slice(-2);
  return `Salary Slip - ${payslipShortName(line.name)} (${mon}-${yy}).pdf`;
}

export function payslipRecipient(line: IPayrollLine): string | null {
  const email = String(line.email || '').trim().toLowerCase();
  const att = String(line.attendanceEmail || '').trim().toLowerCase();
  if (email && email.includes('@')) return email;
  if (att && att.includes('@')) return att;
  return null;
}
