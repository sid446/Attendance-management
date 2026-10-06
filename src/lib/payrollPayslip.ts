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

function netAmt(n: number, rupee: string): string {
  const body = dashAmt(n);
  if (body === '-') return '-';
  return `${rupee}${body}`;
}

function leaveRow(line: IPayrollLine): string[] {
  if (line.isArticle) return ['-', '-', '-', '-', '-'];
  const carried = fmtLeave(line.leavesCf);
  return [
    fmtLeave(line.leavesBf),
    fmtLeave(line.leavesEarned),
    fmtLeave(line.leavesConsumed),
    carried,
    carried,
  ];
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

export function payslipLogoAttachment(): {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
} | null {
  const content = loadLogo();
  if (!content) return null;
  return { filename: 'asija-logo.jpg', content, cid: 'asija-logo', contentType: 'image/jpeg' };
}

const CELL_PAD = 5.64;

function cellStyleName(cell: Cell): 'italic' | 'bold' | 'normal' {
  if (cell.italic) return 'italic';
  if (cell.bold) return 'bold';
  return 'normal';
}

function fitCellLines(doc: jsPDF, font: FontSet, cell: Cell, colWidth: number): { lines: string[]; size: number } {
  const preferred = cell.size ?? 8.5;
  const maxWidth = Math.max(8, colWidth - CELL_PAD * 2);
  const style = cellStyleName(cell);
  doc.setFont(font.family, style);
  if (!cell.text) return { lines: [], size: preferred };

  const linesAt = (size: number): string[] => {
    doc.setFontSize(size);
    if (doc.getTextWidth(cell.text) <= maxWidth + 0.4) return [cell.text];
    const parts = doc.splitTextToSize(cell.text, maxWidth) as string[];
    return parts.length ? parts : [cell.text];
  };

  let size = preferred;
  let lines = linesAt(size);
  while (size > 7 && lines.some((ln) => doc.getTextWidth(ln) > maxWidth + 0.4)) {
    size = Math.round((size - 0.25) * 100) / 100;
    lines = linesAt(size);
  }
  return { lines, size };
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
  const prepared = grid.map((row, r) =>
    row.map((cell, c) => ({ cell, ...fitCellLines(doc, font, cell, widths[c] || widths[widths.length - 1]) }))
  );
  const rowHeights = heights.map((h, r) => {
    let needed = h;
    for (const item of prepared[r] || []) {
      if (item.lines.length > 1) {
        needed = Math.max(needed, item.lines.length * item.size * 1.15 + 6);
      }
    }
    return needed;
  });

  const xs = [x0];
  for (const w of widths) xs.push(xs[xs.length - 1] + w);
  const ys = [y0];
  for (const h of rowHeights) ys.push(ys[ys.length - 1] + h);

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const fill = grid[r][c].fill;
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(xs[c], ys[r], widths[c], rowHeights[r], 'F');
      }
    }
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const xEnd = xs[xs.length - 1];
  const yEnd = ys[ys.length - 1];
  for (const y of ys) doc.line(x0, y, xEnd, y);
  for (const x of xs) doc.line(x, y0, x, yEnd);

  for (let r = 0; r < prepared.length; r++) {
    for (let c = 0; c < prepared[r].length; c++) {
      const { cell, lines, size } = prepared[r][c];
      if (!lines.length) continue;
      doc.setFont(font.family, cellStyleName(cell));
      doc.setFontSize(size);
      doc.setTextColor(0, 0, 0);
      const w = widths[c];
      const h = rowHeights[r];
      const align = cell.align || 'left';
      const x =
        align === 'center' ? xs[c] + w / 2 : align === 'right' ? xs[c] + w - CELL_PAD : xs[c] + CELL_PAD;
      if (lines.length === 1) {
        const ty = ys[r] + h / 2 + size * 0.28;
        doc.text(lines[0], x, ty, { align });
        continue;
      }
      const lineH = size * 1.15;
      const blockH = lines.length * lineH;
      let ty = ys[r] + (h - blockH) / 2 + size * 0.78;
      for (const line of lines) {
        doc.text(line, x, ty, { align });
        ty += lineH;
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

  const logoSize = 56.94;
  const logo = loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', LEFT, 23.35, logoSize, logoSize);
    } catch {
      // continue without logo
    }
  }

  const headerRight = LEFT + COL4.reduce((sum, w) => sum + w, 0);
  doc.setTextColor(0, 0, 0);
  doc.setFont(font.family, 'bold');
  doc.setFontSize(14);
  doc.text('ASIJA & ASSOCIATES LLP', headerRight, 35.3, { align: 'right' });
  doc.setFont(font.family, 'italic');
  doc.setFontSize(9.5);
  doc.text('Chartered Accountants', headerRight, 51.9, { align: 'right' });
  doc.setFont(font.family, 'normal');
  doc.setFontSize(8.5);
  doc.text('1st Floor, 34/5, Gokhale Marg, Butler Colony, Lucknow – 226001', headerRight, 63.9, { align: 'right' });

  doc.setFont(font.family, 'bold');
  doc.setFontSize(12);
  doc.text(monthTitle(monthYear), 306, 94, { align: 'center' });

  let extra = 0;
  const identityY = 106.92;
  const identityEnd = drawTable(doc, font, LEFT, identityY, COL4, [11.52, 11.52, 11.52, 11.88], [
    [h('Employee Name'), v(textOrDash(line.name)), h('Employee Code'), v(textOrDash(line.employeeCode || line.odId))],
    [h('Designation'), v(textOrDash(line.designation)), h('Joining Date'), v(joinDateLabel(line.joiningDate))],
    [h('Department / Vertical'), v(vals.department), h('ESIC No.'), v(vals.esiNo, { align: vals.esiNo === '-' ? 'center' : 'left' })],
    [h('Bank Name'), v(textOrDash(line.bankName)), h('Bank A/C No.'), v(textOrDash(line.accountNumber))],
  ]);
  extra += identityEnd - (identityY + 11.52 * 3 + 11.88);

  const attHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 8.5 };
  const attY = 176.04 + extra;
  const attEnd = drawTable(doc, font, LEFT, attY, COL6, [10.92, 12.0], [
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
  extra += attEnd - (attY + 10.92 + 12);

  const amt = (n: number): Cell => v(dashAmt(n), { align: 'center' });
  const earnHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 9 };
  const earnY = 221.52 + extra;
  const earnEnd = drawTable(doc, font, LEFT, earnY, COL4, [11.52, 11.52, 11.52, 11.52, 11.52, 11.52, 11.88], [
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
  extra += earnEnd - (earnY + 11.52 * 6 + 11.88);

  const netY = 325.08 + extra;
  const netEnd = drawTable(doc, font, LEFT, netY, COL2, [12.12, 13.2], [
    [
      { text: 'NET PAY', bold: true, fill: HEADER_FILL, size: 9.5 },
      { text: netAmt(vals.net, font.rupee), bold: true, fill: HEADER_FILL, align: 'center', size: 9 },
    ],
    [
      { text: 'Amount in Words', bold: true, size: 8.5 },
      { text: amountInWords(vals.net), bold: true, align: 'center', size: 10 },
    ],
  ]);
  extra += netEnd - (netY + 12.12 + 13.2);

  const leaveHead: Cell = { text: '', bold: true, fill: HEADER_FILL, align: 'center', size: 8 };
  const leaveVals = leaveRow(line);
  const leaveEnd = drawTable(doc, font, LEFT, 373.08 + extra, COL5, [10.2, 12.0], [
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
    leaveEnd + 29.12
  );

  return Buffer.from(doc.output('arraybuffer'));
}

const MAIL_FONT = 'Calibri,Arial,sans-serif';
const MAIL_W = 720;

function mailTable(inner: string, gap = 16): string {
  return `<table role="presentation" width="${MAIL_W}" cellpadding="0" cellspacing="0" border="0" style="width:${MAIL_W}px;border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;margin:0 0 ${gap}px 0;table-layout:fixed;">${inner}</table>`;
}

function mailCell(
  text: string,
  opts: {
    width: number;
    header?: boolean;
    total?: boolean;
    net?: boolean;
    bold?: boolean;
    align?: 'left' | 'center';
    firstRow?: boolean;
    firstCol?: boolean;
    size?: number;
  }
): string {
  const align = opts.align || 'left';
  const bg = opts.header || opts.net ? '#dbe5f1' : opts.total ? '#f3f3f3' : '#ffffff';
  const weight = opts.header || opts.total || opts.net || opts.bold ? '700' : '400';
  const size = opts.size ?? (opts.net ? 13 : 12);
  const style = [
    `width:${opts.width}px`,
    'box-sizing:border-box',
    'border-right:1px solid #000000',
    'border-bottom:1px solid #000000',
    opts.firstRow ? 'border-top:1px solid #000000' : '',
    opts.firstCol ? 'border-left:1px solid #000000' : '',
    `background-color:${bg}`,
    `font-weight:${weight}`,
    `font-size:${size}px`,
    `font-family:${MAIL_FONT}`,
    'color:#000000',
    `text-align:${align}`,
    'vertical-align:middle',
    'line-height:16px',
    'padding:5px 6px',
    'word-wrap:break-word',
    'overflow-wrap:break-word',
  ]
    .filter(Boolean)
    .join(';');
  const inner = text ? escapeHtml(text) : '&nbsp;';
  return `<td width="${opts.width}" align="${align}" valign="middle" style="${style}">${inner}</td>`;
}

function mailRow(cells: string[]): string {
  return `<tr>${cells.join('')}</tr>`;
}

export function buildPayslipHtml(
  line: IPayrollLine,
  monthYear: string,
  calendar?: PayslipCalendar
): string {
  const vals = payslipValues(line, calendar);
  const title = monthTitle(monthYear);
  const logo = payslipLogoAttachment();
  const w4 = [180, 180, 180, 180];
  const w6 = [120, 120, 120, 120, 120, 120];
  const w5 = [144, 144, 144, 144, 144];
  const w2 = [360, 360];
  const pair = (
    rows: Array<[string, string, string, string, { header?: boolean; total?: boolean; net?: boolean; bold?: boolean }?]>
  ) =>
    rows
      .map((row, r) => {
        const tone = row[4] || {};
        const labelAlign = tone.header ? 'center' : 'left';
        return mailRow([
          mailCell(row[0], { width: w4[0], firstRow: r === 0, firstCol: true, align: labelAlign, ...tone }),
          mailCell(row[1], { width: w4[1], firstRow: r === 0, align: 'center', ...tone }),
          mailCell(row[2], { width: w4[2], firstRow: r === 0, align: labelAlign, ...tone }),
          mailCell(row[3], { width: w4[3], firstRow: r === 0, align: 'center', ...tone }),
        ]);
      })
      .join('');
  const identity = [
    ['Employee Name', textOrDash(line.name), 'Employee Code', textOrDash(line.employeeCode || line.odId)],
    ['Designation', textOrDash(line.designation), 'Joining Date', joinDateLabel(line.joiningDate)],
    ['Department / Vertical', vals.department, 'ESIC No.', vals.esiNo],
    ['Bank Name', textOrDash(line.bankName), 'Bank A/C No.', textOrDash(line.accountNumber)],
  ] as Array<[string, string, string, string]>;
  const attendanceHeads = ['Office Working Days', 'Staff Working Days', 'Days Paid', 'WeekOff / Holiday', 'Absent', 'Paid Leave'];
  const attendanceVals = [
    fmtDays(line.officeWorkingDays),
    fmtDays(vals.staffWorking),
    fmtDays(line.netWorkingDays),
    fmtDays(vals.weekoffHoliday),
    fmtDays(line.absent),
    fmtDays(vals.paidLeave),
  ];
  const leaveHeads = ['Leave B/F', 'Earned Leave', 'Leave Availed', 'Leave C/F', 'Leave Balance'];
  const leaveVals = leaveRow(line);
  const logoCell = logo
    ? `<td valign="middle" align="left" width="74" style="width:74px;padding:0;"><img src="cid:${logo.cid}" width="62" height="62" alt="Asija" style="display:block;border:0;outline:none;text-decoration:none;" /></td>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#000000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="${MAIL_W}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:${MAIL_W}px;border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;">
<tr><td align="left" style="padding:0 0 8px 0;font-family:${MAIL_FONT};color:#000000;">
  <table role="presentation" width="${MAIL_W}" cellpadding="0" cellspacing="0" border="0" align="left" style="width:${MAIL_W}px;border-collapse:collapse;">
    <tr>
      ${logoCell}
      <td valign="middle" align="right" style="font-family:${MAIL_FONT};color:#000000;text-align:right;">
        <div style="font-size:18px;line-height:22px;font-weight:700;">ASIJA &amp; ASSOCIATES LLP</div>
        <div style="font-size:13px;line-height:16px;font-style:italic;">Chartered Accountants</div>
        <div style="font-size:11px;line-height:14px;">1st Floor, 34/5, Gokhale Marg, Butler Colony, Lucknow – 226001</div>
      </td>
    </tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:8px 0 14px 0;font-family:${MAIL_FONT};font-size:15px;line-height:20px;font-weight:700;color:#000000;text-align:center;">${escapeHtml(title)}</td></tr>
<tr><td>
${mailTable(
  identity
    .map((row, r) =>
      mailRow([
        mailCell(row[0], { width: w4[0], header: true, firstRow: r === 0, firstCol: true }),
        mailCell(row[1], { width: w4[1], firstRow: r === 0 }),
        mailCell(row[2], { width: w4[2], header: true, firstRow: r === 0 }),
        mailCell(row[3], { width: w4[3], firstRow: r === 0 }),
      ])
    )
    .join('')
)}
${mailTable(
  mailRow(attendanceHeads.map((label, i) => mailCell(label, { width: w6[i], header: true, align: 'center', firstRow: true, firstCol: i === 0, size: 11 }))) +
    mailRow(attendanceVals.map((val, i) => mailCell(val, { width: w6[i], align: 'center', firstCol: i === 0 })))
)}
${mailTable(
  pair([
    ['EARNINGS', `AMOUNT (₹)`, 'DEDUCTIONS', `AMOUNT (₹)`, { header: true }],
    ['Basic Salary', dashAmt(vals.basicAmt), 'ESIC', dashAmt(vals.esicAmt)],
    ['Laptop Allowance', dashAmt(vals.laptopAmt), 'Advance / Recovery', dashAmt(vals.advanceAmt)],
    ['Other Allowance', dashAmt(vals.otherAllowance), 'Other Deductions', dashAmt(vals.otherDed)],
    ['Project Allowance', dashAmt(vals.projectAllowance), '', ''],
    ['', '', '', ''],
    ['Gross Earnings', dashAmt(vals.gross), 'Total Deductions', dashAmt(vals.totalDed), { total: true }],
  ])
)}
${mailTable(
  mailRow([
    mailCell('NET PAY', { width: w2[0], net: true, firstRow: true, firstCol: true }),
    mailCell(netAmt(vals.net, '₹'), { width: w2[1], net: true, align: 'center', firstRow: true }),
  ]) +
    mailRow([
      mailCell('Amount in Words', { width: w2[0], bold: true, firstCol: true }),
      mailCell(amountInWords(vals.net), { width: w2[1], bold: true, align: 'center' }),
    ])
)}
${mailTable(
  mailRow(leaveHeads.map((label, i) => mailCell(label, { width: w5[i], header: true, align: 'center', firstRow: true, firstCol: i === 0, size: 11 }))) +
    mailRow(leaveVals.map((val, i) => mailCell(val, { width: w5[i], align: 'center', firstCol: i === 0 }))),
  10
)}
</td></tr>
<tr><td style="padding:4px 0 0 0;font-family:${MAIL_FONT};font-size:12px;line-height:16px;font-weight:700;color:#000000;">Note: This is a computer-generated payslip and does not require a signature.</td></tr>
</table>
</td></tr>
</table>
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
