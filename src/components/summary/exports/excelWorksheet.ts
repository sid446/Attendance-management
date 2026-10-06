/**
 * exceljs runtime has insertRow. Some published .d.ts builds omit it on Worksheet,
 * which fails `tsc` during `next build`.
 */
type InsertableWorksheet = {
  insertRow(pos: number, value: unknown[] | Record<string, unknown>): unknown;
};

export function insertWorksheetRow(
  worksheet: object,
  pos: number,
  value: unknown[] | Record<string, unknown>
): void {
  (worksheet as InsertableWorksheet).insertRow(pos, value);
}
