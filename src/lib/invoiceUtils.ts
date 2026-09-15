// Print/PDF generation for "Cetak Invoice Penjualan" (AR Sales Invoice).
// Reuses the same escaping, formatting, sanitization and PDF pipeline as
// the existing Billing Letter feature (billingUtils.ts / pdfDownloadUtils.ts)
// instead of reimplementing it.
import { escapeHtml, formatCurrencyIDR, formatDateID, sanitizePrintableHtml } from './billingUtils';

export interface InvoiceItemLine {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount: number;
}

export interface InvoiceBankAccount {
  bankName: string;
  accountNo: string;
  accountName: string;
}

export interface InvoiceHtmlData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  orderNumber?: string;
  customerName: string;
  customerAddress?: string;
  salesName?: string | null;
  items: InvoiceItemLine[];
  invoiceAmount: number;
  taxRate?: number;
  notes?: string | null;
  companyName: string;
  companyBrandName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  bankAccounts?: InvoiceBankAccount[];
}

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];

function angkaKeKata(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 10) return SATUAN[n];
  if (n < 20) return n === 10 ? 'sepuluh' : n === 11 ? 'sebelas' : `${SATUAN[n - 10]} belas`;
  if (n < 100) {
    const puluh = Math.floor(n / 10);
    const sisa = n % 10;
    return `${SATUAN[puluh]} puluh${sisa ? ' ' + SATUAN[sisa] : ''}`;
  }
  if (n < 200) {
    const sisa = n - 100;
    return `seratus${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  if (n < 1000) {
    const ratus = Math.floor(n / 100);
    const sisa = n % 100;
    return `${SATUAN[ratus]} ratus${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  if (n < 2000) {
    const sisa = n - 1000;
    return `seribu${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  if (n < 1_000_000) {
    const ribu = Math.floor(n / 1000);
    const sisa = n % 1000;
    return `${angkaKeKata(ribu)} ribu${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  if (n < 1_000_000_000) {
    const juta = Math.floor(n / 1_000_000);
    const sisa = n % 1_000_000;
    return `${angkaKeKata(juta)} juta${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  if (n < 1_000_000_000_000) {
    const miliar = Math.floor(n / 1_000_000_000);
    const sisa = n % 1_000_000_000;
    return `${angkaKeKata(miliar)} miliar${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
  }
  const triliun = Math.floor(n / 1_000_000_000_000);
  const sisa = n % 1_000_000_000_000;
  return `${angkaKeKata(triliun)} triliun${sisa ? ' ' + angkaKeKata(sisa) : ''}`;
}

/** Best-effort Indonesian "terbilang" for a Rupiah amount. Purely cosmetic. */
export const terbilangRupiah = (amount: number): string => {
  try {
    if (!isFinite(amount) || amount < 0) return '';
    const words = amount === 0 ? 'nol' : angkaKeKata(amount);
    return `${words.charAt(0).toUpperCase()}${words.slice(1)} Rupiah`;
  } catch {
    return '';
  }
};

export const generateInvoiceHTML = (data: InvoiceHtmlData): string => {
  const s = {
    invoiceNumber: escapeHtml(data.invoiceNumber),
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    orderNumber: escapeHtml(data.orderNumber),
    customerName: escapeHtml(data.customerName),
    customerAddress: escapeHtml(data.customerAddress),
    salesName: escapeHtml(data.salesName || undefined),
    notes: escapeHtml(data.notes || undefined),
    companyName: escapeHtml(data.companyName),
    companyBrandName: escapeHtml(data.companyBrandName),
    companyAddress: escapeHtml(data.companyAddress),
    companyPhone: escapeHtml(data.companyPhone),
    companyEmail: escapeHtml(data.companyEmail),
    companyWebsite: escapeHtml(data.companyWebsite),
  };

  const items: InvoiceItemLine[] = data.items.length > 0
    ? data.items
    : [{ description: data.notes || 'Sesuai Invoice', amount: data.invoiceAmount }];

  const subtotal = items.reduce((sum, it) => sum + (it.amount || 0), 0);
  const taxRate = data.taxRate && data.taxRate > 0 ? data.taxRate : 0;
  const taxAmount = taxRate > 0 ? Math.round(subtotal * (taxRate / 100)) : 0;
  const grandTotal = subtotal + taxAmount;

  const itemRows = items.map((it, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>${escapeHtml(it.description)}</td>
      <td style="text-align:center;">${it.quantity != null ? it.quantity : '-'}</td>
      <td style="text-align:center;">${it.unit ? escapeHtml(it.unit) : '-'}</td>
      <td class="amount">${it.unitPrice != null ? formatCurrencyIDR(it.unitPrice) : '-'}</td>
      <td class="amount">${formatCurrencyIDR(it.amount)}</td>
    </tr>
  `).join('');

  const bankRows = (data.bankAccounts || []).map((b) => `
    <div class="bank-row">
      <strong>${escapeHtml(b.bankName)}</strong> — ${escapeHtml(b.accountNo)} a.n. ${escapeHtml(b.accountName)}
    </div>
  `).join('');

  const companyContactLine = [
    s.companyPhone ? `Telp: ${s.companyPhone}` : '',
    s.companyEmail || '',
    s.companyWebsite || '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice - ${s.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      background: #ffffff;
    }
    .pdf-page {
      width: 794px;
      min-height: 1123px;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
      box-sizing: border-box;
    }
    .pdf-content { padding: 50px 60px 60px 60px; }
    .invoice-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 3px solid #1F5A45; padding-bottom: 15px; margin-bottom: 20px;
    }
    .company-name { font-size: 16pt; font-weight: bold; color: #1F5A45; }
    .company-brand { font-size: 10pt; color: #555; margin-top: 2px; }
    .company-detail { font-size: 9pt; color: #555; margin-top: 4px; max-width: 380px; }
    .invoice-title-block { text-align: right; }
    .invoice-title { font-size: 22pt; font-weight: bold; letter-spacing: 2px; color: #1F5A45; }
    .invoice-no { font-size: 10.5pt; margin-top: 4px; }
    .meta-grid {
      display: flex; justify-content: space-between; gap: 30px; margin-bottom: 20px;
    }
    .bill-to { flex: 1; }
    .bill-to-label { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; color: #666; margin-bottom: 4px; }
    .bill-to-name { font-weight: bold; font-size: 12pt; }
    .invoice-meta { flex: 1; max-width: 260px; }
    .meta-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10pt; }
    .meta-label { color: #666; }
    .invoice-table { width: 100%; border-collapse: collapse; margin: 10px 0 15px 0; font-size: 10pt; }
    .invoice-table th, .invoice-table td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
    .invoice-table th { background-color: #1F5A45; color: #fff; font-weight: bold; text-align: center; }
    .amount { text-align: right !important; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .totals-box { width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10.5pt; }
    .totals-row.grand { border-top: 2px solid #1F5A45; margin-top: 4px; font-weight: bold; font-size: 12pt; color: #1F5A45; }
    .terbilang { text-align: right; font-style: italic; font-size: 9.5pt; color: #555; margin-bottom: 20px; }
    .payment-box {
      background: #f6f7fb; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 20px; font-size: 10pt;
    }
    .payment-box-title { font-weight: bold; margin-bottom: 6px; }
    .bank-row { margin-bottom: 2px; }
    .notes-box { font-size: 10pt; margin-bottom: 25px; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 30px; }
    .signature-block { width: 220px; text-align: center; font-size: 10pt; }
    .signature-space { height: 60px; }
    .signature-line { border-top: 1px solid #333; padding-top: 5px; }
    @media print {
      body { padding: 0; }
      .pdf-page { width: 210mm; min-height: 297mm; }
    }
  </style>
</head>
<body>
  <div class="pdf-page">
    <div class="pdf-content">
      <div class="invoice-header">
        <div>
          <div class="company-name">${s.companyName}</div>
          ${s.companyBrandName && s.companyBrandName !== s.companyName ? `<div class="company-brand">${s.companyBrandName}</div>` : ''}
          ${s.companyAddress ? `<div class="company-detail">${s.companyAddress}</div>` : ''}
          ${companyContactLine ? `<div class="company-detail">${companyContactLine}</div>` : ''}
        </div>
        <div class="invoice-title-block">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-no">No: ${s.invoiceNumber}</div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="bill-to">
          <div class="bill-to-label">Ditagihkan Kepada</div>
          <div class="bill-to-name">${s.customerName}</div>
          ${s.customerAddress ? `<div>${s.customerAddress}</div>` : ''}
        </div>
        <div class="invoice-meta">
          <div class="meta-row"><span class="meta-label">Tanggal Invoice</span><span>${formatDateID(s.invoiceDate)}</span></div>
          <div class="meta-row"><span class="meta-label">Jatuh Tempo</span><span>${formatDateID(s.dueDate)}</span></div>
          ${s.orderNumber ? `<div class="meta-row"><span class="meta-label">No. Order/PO</span><span>${s.orderNumber}</span></div>` : ''}
          ${s.salesName ? `<div class="meta-row"><span class="meta-label">Sales</span><span>${s.salesName}</span></div>` : ''}
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width:30px;">No</th>
            <th>Deskripsi</th>
            <th style="width:50px;">Qty</th>
            <th style="width:60px;">Satuan</th>
            <th style="width:110px;">Harga Satuan</th>
            <th style="width:120px;">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>${formatCurrencyIDR(subtotal)}</span></div>
          ${taxRate > 0 ? `<div class="totals-row"><span>PPN (${taxRate}%)</span><span>${formatCurrencyIDR(taxAmount)}</span></div>` : ''}
          <div class="totals-row grand"><span>TOTAL</span><span>${formatCurrencyIDR(grandTotal)}</span></div>
        </div>
      </div>
      <div class="terbilang">Terbilang: ${terbilangRupiah(grandTotal)}</div>

      ${bankRows ? `
      <div class="payment-box">
        <div class="payment-box-title">Informasi Pembayaran</div>
        ${bankRows}
      </div>` : ''}

      ${s.notes ? `<div class="notes-box"><strong>Catatan:</strong> ${s.notes}</div>` : ''}

      <div class="signature-area">
        <div class="signature-block">
          <div>Diterima oleh,</div>
          <div class="signature-space"></div>
          <div class="signature-line">${s.customerName}</div>
        </div>
        <div class="signature-block">
          <div>Hormat kami,</div>
          <div class="signature-space"></div>
          <div class="signature-line">${s.companyName}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const printInvoiceHTML = (html: string): void => {
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

export const downloadInvoicePDF = async (html: string, filename: string): Promise<void> => {
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
    console.error('Invoice PDF generation failed:', error);
    printInvoiceHTML(html);
  }
};
