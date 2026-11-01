import type { ExportTable } from './exportTable';

export async function exportAdvancedReport(table: ExportTable, format: 'excel' | 'pdf') {
  const filename = `LEPDO-${table.title.replace(/[^a-z0-9]+/gi, '-')}`;
  if (format === 'excel') {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.addRow([table.title]);
    sheet.addRow([table.subtitle ?? '']);
    for (const pair of table.summary ?? []) sheet.addRow([pair.label, pair.value]);
    sheet.addRow([]);
    const header = sheet.addRow(table.columns.map(c => c.label));
    header.font = { bold: true };
    for (const row of table.rows) sheet.addRow(table.columns.map(c => row[c.key] ?? ''));
    table.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      column.width = c.money ? 24 : 28;
      if (c.money) column.numFmt = '#,##0.00';
    });
    sheet.views = [{ state: 'frozen', ySplit: header.number }];
    sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + table.rows.length, column: table.columns.length } };
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = `${filename}.xlsx`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: table.columns.length > 6 ? 'landscape' : 'portrait' });
  // Embedded standard PDF fonts are ASCII; INR column headings retain unambiguous currency labels.
  const text = (v: unknown) => String(v ?? '').replace(/₹/g, 'INR ').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\n]/g, '');
  doc.setFontSize(15); doc.text(text(table.title), 14, 16);
  doc.setFontSize(8); doc.text(text(table.subtitle), 14, 23);
  const summary = (table.summary ?? []).map(s => `${text(s.label)}: ${text(s.value)}`);
  summary.forEach((line, i) => doc.text(line, 14, 30 + i * 5));
  autoTable(doc, { startY: 35 + summary.length * 5, head: [table.columns.map(c => text(c.label))], body: table.rows.map(r => table.columns.map(c => text(c.money ? Number(r[c.key] ?? 0).toFixed(2) : r[c.key]))), styles: { fontSize: 7, overflow: 'linebreak' }, horizontalPageBreak: true });
  doc.save(`${filename}.pdf`);
}