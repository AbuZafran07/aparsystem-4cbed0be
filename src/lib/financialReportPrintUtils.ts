// Generic "Cetak/PDF" support for the Financial Statements page variants.
// Reuses escapeHtml/formatCurrencyIDR/sanitizePrintableHtml from
// billingUtils.ts and downloadPdfFromHtml from pdfDownloadUtils.ts instead
// of reimplementing HTML sanitization or PDF rendering.
import { escapeHtml, formatCurrencyIDR, sanitizePrintableHtml } from './billingUtils';

export interface ReportTableSection {
  title: string;
  columnLabels: string[]; // first column is the row label, the rest are numeric
  rows: { label: string; values: number[]; bold?: boolean }[];
  totalRow?: { label: string; values: number[] };
}

export interface FinancialReportData {
  reportTitle: string;
  periodLabel: string;
  companyName: string;
  sections: ReportTableSection[];
}

const renderSection = (section: ReportTableSection): string => {
  const rowsHtml = section.rows
    .map(
      (row) => `
    <tr${row.bold ? ' class="bold-row"' : ''}>
      <td>${escapeHtml(row.label)}</td>
      ${row.values.map((v) => `<td class="amount">${formatCurrencyIDR(v)}</td>`).join('')}
    </tr>`
    )
    .join('');

  const totalHtml = section.totalRow
    ? `
    <tr class="total-row">
      <td>${escapeHtml(section.totalRow.label)}</td>
      ${section.totalRow.values.map((v) => `<td class="amount">${formatCurrencyIDR(v)}</td>`).join('')}
    </tr>`
    : '';

  return `
  <div class="section">
    <div class="section-title">${escapeHtml(section.title)}</div>
    <table class="report-table">
      <thead>
        <tr>
          ${section.columnLabels.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${totalHtml}
      </tbody>
    </table>
  </div>`;
};

export const generateFinancialReportHTML = (data: FinancialReportData): string => {
  const safeTitle = escapeHtml(data.reportTitle);
  const safePeriod = escapeHtml(data.periodLabel);
  const safeCompany = escapeHtml(data.companyName);

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle} - ${safePeriod}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 10.5pt; color: #222; background: #fff; }
    .pdf-page { width: 794px; min-height: 1123px; margin: 0 auto; background: #fff; padding: 50px 55px; box-sizing: border-box; }
    .header { text-align: center; border-bottom: 2px solid #1F5A45; padding-bottom: 14px; margin-bottom: 20px; }
    .company-name { font-size: 14pt; font-weight: bold; color: #1F5A45; }
    .report-title { font-size: 12pt; font-weight: bold; margin-top: 4px; }
    .period-label { font-size: 10pt; color: #555; margin-top: 2px; }
    .section { margin-bottom: 22px; }
    .section-title { font-weight: bold; font-size: 11pt; margin-bottom: 6px; color: #1F5A45; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    .report-table th, .report-table td { border: 1px solid #999; padding: 4px 8px; }
    .report-table th { background: #1F5A45; color: #fff; text-align: right; }
    .report-table th:first-child { text-align: left; }
    .amount { text-align: right; }
    .bold-row td { font-weight: bold; }
    .total-row td { font-weight: bold; background: #f0f0f0; border-top: 2px solid #1F5A45; }
    @media print { body { padding: 0; } .pdf-page { width: 210mm; min-height: 297mm; } }
  </style>
</head>
<body>
  <div class="pdf-page">
    <div class="header">
      <div class="company-name">${safeCompany}</div>
      <div class="report-title">${safeTitle}</div>
      <div class="period-label">${safePeriod}</div>
    </div>
    ${data.sections.map(renderSection).join('')}
  </div>
</body>
</html>
  `;
};

export const printFinancialReport = (html: string): void => {
  const sanitizedHtml = sanitizePrintableHtml(html);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(sanitizedHtml);
  iframeDoc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
    }, 1000);
  };

  iframe.onload = () => setTimeout(triggerPrint, 500);
  setTimeout(() => {
    if (document.body.contains(iframe)) triggerPrint();
  }, 3000);
};

export const downloadFinancialReportPDF = async (html: string, filename: string): Promise<void> => {
  try {
    const safeFilename = String(filename).replace(/[\r\n\t]/g, ' ').replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 100);
    const { downloadPdfFromHtml } = await import('@/lib/pdfDownloadUtils');
    const sanitizedHtml = sanitizePrintableHtml(html);

    await downloadPdfFromHtml({
      html: sanitizedHtml,
      filename: safeFilename,
      scale: 2,
      viewportWidthPx: 794,
    });
  } catch (error) {
    console.error('Financial report PDF generation failed:', error);
    printFinancialReport(html);
  }
};
