/** Same title + header + striped rows as Attendance Summary export. */
export function styleListExportSheet(
  worksheet: any,
  titleText: string,
  leftAlignKeys: Set<string>
) {
  const colCount = worksheet.columns.length;
  worksheet.spliceRows(1, 0, [titleText]);
  worksheet.mergeCells(1, 1, 1, colCount);
  worksheet.getRow(1).font = { bold: true, size: 13 };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 22;

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C5F2D' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  worksheet.eachRow((row: { eachCell: (cb: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }, colNumber: number) => void) => void }, rowNumber: number) => {
    if (rowNumber <= 2) return;
    const isEvenRow = rowNumber % 2 === 0;
    row.eachCell((cell, colNumber) => {
      const colKey = worksheet.columns[colNumber - 1]?.key;
      cell.font = { size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colKey && leftAlignKeys.has(colKey) ? 'left' : 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
  worksheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: colCount },
  };
}
