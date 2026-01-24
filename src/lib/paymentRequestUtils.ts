// Payment Request PDF Generation utilities for AP Invoices

export interface PaymentRequestData {
  requestNo: string;
  requestDate: string;
  vendorName: string;
  vendorAddress?: string;
  vendorInvoiceNumber: string;
  poNumber: string;
  productName?: string;
  spPoDate: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  outstandingAmount: number;
  overdueDays: number;
  notes?: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogoUrl?: string;
  requestedBy: string;
  status: string;
  paymentMethod?: 'transfer' | 'cash';
  bankName?: string;
  bankAccountNo?: string;
  transferAmount?: number;
  cashAmount?: number;
}

// HTML escape function to prevent XSS attacks
export const escapeHtml = (str: string | undefined | null): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const generatePaymentRequestNumber = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `PR-${year}${month}-${random}`;
};

export const formatCurrencyIDR = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDateID = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const generatePaymentRequestHTML = (data: PaymentRequestData): string => {
  // Escape all user-provided data to prevent XSS
  const safeData = {
    requestNo: escapeHtml(data.requestNo),
    requestDate: data.requestDate,
    vendorName: escapeHtml(data.vendorName),
    vendorAddress: escapeHtml(data.vendorAddress),
    vendorInvoiceNumber: escapeHtml(data.vendorInvoiceNumber),
    poNumber: escapeHtml(data.poNumber),
    productName: escapeHtml(data.productName),
    spPoDate: data.spPoDate,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    invoiceAmount: data.invoiceAmount,
    outstandingAmount: data.outstandingAmount,
    overdueDays: data.overdueDays,
    notes: escapeHtml(data.notes),
    companyName: escapeHtml(data.companyName),
    companyAddress: escapeHtml(data.companyAddress),
    companyPhone: escapeHtml(data.companyPhone),
    companyEmail: escapeHtml(data.companyEmail),
    companyLogoUrl: data.companyLogoUrl,
    requestedBy: escapeHtml(data.requestedBy),
    status: escapeHtml(data.status),
    paymentMethod: data.paymentMethod || 'transfer',
    bankName: escapeHtml(data.bankName),
    bankAccountNo: escapeHtml(data.bankAccountNo),
    transferAmount: data.transferAmount || data.outstandingAmount,
    cashAmount: data.cashAmount || 0,
  };

  const printDateTime = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formatRupiah = (amount: number): string => {
    return 'Rp. ' + new Intl.NumberFormat('id-ID').format(amount);
  };

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pengajuan Pembayaran - ${safeData.requestNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Arial', sans-serif; 
      font-size: 10pt; 
      line-height: 1.4;
      color: #333;
      padding: 30px;
      max-width: 850px;
      margin: 0 auto;
      background: white;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    
    .logo-container {
      width: 150px;
    }
    
    .logo-container img {
      max-width: 150px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .logo-text {
      font-size: 18pt;
      font-weight: bold;
      color: #1a5c3a;
    }
    
    .title-section {
      text-align: right;
    }
    
    .document-title {
      font-size: 20pt;
      font-weight: bold;
      color: #1a5c3a;
      margin-bottom: 8px;
    }
    
    .doc-info-box {
      border: 2px solid #1a5c3a;
      padding: 8px 12px;
      display: inline-block;
    }
    
    .doc-info-row {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      font-size: 10pt;
    }
    
    .doc-info-label {
      font-weight: bold;
    }
    
    .category-section {
      margin-bottom: 15px;
    }
    
    .category-row {
      display: flex;
      margin-bottom: 3px;
    }
    
    .category-label {
      width: 130px;
      font-weight: bold;
      font-style: italic;
    }
    
    .category-value {
      flex: 1;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #333;
      margin-bottom: 15px;
    }
    
    .info-left, .info-right {
      padding: 10px 12px;
    }
    
    .info-left {
      border-right: 1px solid #333;
    }
    
    .info-row {
      display: flex;
      margin-bottom: 4px;
    }
    
    .info-label {
      width: 150px;
      font-weight: bold;
    }
    
    .info-value {
      flex: 1;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    
    .items-table th {
      background-color: #1a5c3a;
      color: white;
      padding: 10px 8px;
      text-align: center;
      font-weight: bold;
      border: 1px solid #1a5c3a;
    }
    
    .items-table td {
      padding: 10px 8px;
      border: 1px solid #ddd;
    }
    
    .items-table .col-no { width: 40px; text-align: center; }
    .items-table .col-desc { text-align: left; }
    .items-table .col-amount { text-align: right; width: 150px; }
    
    .payment-section {
      display: grid;
      grid-template-columns: 3fr 1fr;
      margin-bottom: 20px;
      border: 1px solid #1a5c3a;
    }
    
    .transfer-section {
      border-right: 1px solid #1a5c3a;
    }
    
    .transfer-header {
      text-align: center;
      font-weight: bold;
      padding: 8px;
      background-color: #1a5c3a;
      color: white;
      border-bottom: 1px solid #1a5c3a;
    }
    
    .transfer-body {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      background: white;
    }
    
    .transfer-item {
      padding: 10px;
      text-align: center;
      border-right: 1px solid #1a5c3a;
    }
    
    .transfer-item:last-child {
      border-right: none;
    }
    
    .transfer-label {
      font-size: 9pt;
      margin-bottom: 4px;
      color: #333;
    }
    
    .transfer-value {
      font-weight: bold;
      color: #000;
    }
    
    .cash-section {
      background: white;
    }
    
    .cash-header {
      text-align: center;
      font-weight: bold;
      padding: 8px;
      background-color: #1a5c3a;
      color: white;
      border-bottom: 1px solid #1a5c3a;
    }
    
    .cash-body {
      padding: 10px;
      text-align: center;
    }
    
    .cash-label {
      font-size: 9pt;
      margin-bottom: 4px;
      color: #333;
    }
    
    .cash-value {
      font-weight: bold;
      color: #000;
    }
    
    .signature-section {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-bottom: 20px;
      gap: 15px;
    }
    
    .signature-box {
      text-align: center;
      padding: 10px;
      background-color: #1a5c3a;
      color: white;
    }
    
    .signature-title {
      font-weight: bold;
      font-size: 11pt;
      margin-bottom: 8px;
    }
    
    .signature-content {
      background: white;
      min-height: 80px;
      margin: 0 5px 5px 5px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      border: 1px solid #333;
    }
    
    .signature-line {
      border-top: 1px solid #333;
      padding-top: 5px;
      margin-top: 10px;
    }
    
    .signature-date {
      color: #666;
      font-size: 9pt;
    }
    
    .footer {
      text-align: center;
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
    
    @media print {
      body { padding: 15px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-container">
      ${safeData.companyLogoUrl ? 
        `<img src="${safeData.companyLogoUrl}" alt="Company Logo" />` : 
        `<div class="logo-text">${safeData.companyName}</div>`
      }
    </div>
    <div class="title-section">
      <div class="document-title">PENGAJUAN PEMBAYARAN</div>
      <div class="doc-info-box">
        <div class="doc-info-row">
          <span class="doc-info-label">No.</span>
          <span>: ${safeData.requestNo}</span>
        </div>
        <div class="doc-info-row">
          <span class="doc-info-label">Date</span>
          <span>: ${formatDateID(safeData.requestDate)}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="category-section">
    <div class="category-row">
      <span class="category-label">Kategori Pembayaran</span>
      <span class="category-value">: Hutang Vendor (AP)</span>
    </div>
    <div class="category-row">
      <span class="category-label">Division</span>
      <span class="category-value">: Purchasing / Finance</span>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-left">
      <div class="info-row">
        <span class="info-label">Pemohon</span>
        <span class="info-value">: ${safeData.requestedBy}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Vendor/Penerima</span>
        <span class="info-value">: ${safeData.vendorName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Reff No (INV/Nota/Resi)</span>
        <span class="info-value">: ${safeData.vendorInvoiceNumber || '-'}</span>
      </div>
    </div>
    <div class="info-right">
      <div class="info-row">
        <span class="info-label">Payment Due Date</span>
        <span class="info-value">: ${formatDateID(safeData.dueDate)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">No. PO</span>
        <span class="info-value">: ${safeData.poNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Metode Pembayaran</span>
        <span class="info-value">: ${safeData.paymentMethod === 'cash' ? 'Tunai' : 'Transfer'}</span>
      </div>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th class="col-no">No.</th>
        <th class="col-desc">Keterangan Biaya</th>
        <th class="col-amount">Nilai Pengajuan</th>
        <th class="col-amount">Nilai Approved</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="col-no">1</td>
        <td class="col-desc">${safeData.productName || `Pembayaran Invoice ${safeData.vendorInvoiceNumber}`}</td>
        <td class="col-amount">${formatRupiah(safeData.outstandingAmount)}</td>
        <td class="col-amount">${formatRupiah(safeData.outstandingAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="payment-section">
    <div class="transfer-section">
      <div class="transfer-header">Transfer Bank</div>
      <div class="transfer-body">
        <div class="transfer-item">
          <div class="transfer-label">Nama Bank</div>
          <div class="transfer-value">${safeData.bankName || '-'}</div>
        </div>
        <div class="transfer-item">
          <div class="transfer-label">No. Rekening</div>
          <div class="transfer-value">${safeData.bankAccountNo || '-'}</div>
        </div>
        <div class="transfer-item">
          <div class="transfer-label">Nilai Transfer</div>
          <div class="transfer-value">${safeData.paymentMethod === 'transfer' ? formatRupiah(safeData.transferAmount) : '-'}</div>
        </div>
      </div>
    </div>
    <div class="cash-section">
      <div class="cash-header">Tunai</div>
      <div class="cash-body">
        <div class="cash-label">Nilai Cash</div>
        <div class="cash-value">${safeData.paymentMethod === 'cash' ? formatRupiah(safeData.cashAmount || safeData.outstandingAmount) : '-'}</div>
      </div>
    </div>
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-title">Pemohon</div>
      <div class="signature-content">
        <div class="signature-line"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-title">Mengetahui</div>
      <div class="signature-content">
        <div class="signature-line"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-title">Menyetujui</div>
      <div class="signature-content">
        <div class="signature-line"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
    </div>
  </div>

  <div class="footer">
    Dokumen ini dicetak pada ${printDateTime} | ${safeData.companyName} - Expense Budget & Approval System
  </div>
</body>
</html>
  `;
};

export const sanitizePrintableHtml = (html: string): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove high-risk elements entirely
    doc.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select').forEach((el) => el.remove());

    // Remove inline event handlers and javascript: URLs
    const root = doc.documentElement;
    if (root) {
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode as Element | null;

      while (current) {
        for (const attr of Array.from(current.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value;

          // Remove all event handlers
          if (name.startsWith('on')) {
            current.removeAttribute(attr.name);
            continue;
          }

          // Remove javascript: URLs
          if ((name === 'href' || name === 'src' || name === 'action') && /^\s*javascript:/i.test(value)) {
            current.removeAttribute(attr.name);
          }
          
          // Remove data: URLs in src attributes (potential XSS vector)
          if (name === 'src' && /^\s*data:/i.test(value) && !/^\s*data:image\/(png|jpeg|gif|webp|svg\+xml)/i.test(value)) {
            current.removeAttribute(attr.name);
          }
        }

        current = walker.nextNode() as Element | null;
      }
    }

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  } catch {
    // Fallback: remove script tags and event handlers via regex
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  }
};

const safeWindowOpen = (): Window | null => {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (w) w.opener = null;
  return w;
};

export const printPaymentRequest = (html: string): void => {
  const printWindow = safeWindowOpen();
  if (!printWindow) return;

  const sanitizedHtml = sanitizePrintableHtml(html);
  printWindow.document.open();
  printWindow.document.write(sanitizedHtml);
  printWindow.document.close();

  // Print after a short delay to allow rendering
  setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      // ignore
    }
  }, 250);
};

export const previewPaymentRequest = (html: string): void => {
  const previewWindow = safeWindowOpen();
  if (!previewWindow) return;

  const sanitizedHtml = sanitizePrintableHtml(html);
  previewWindow.document.open();
  previewWindow.document.write(sanitizedHtml);
  previewWindow.document.close();
};

export const downloadPaymentRequestPDF = async (html: string, filename: string): Promise<void> => {
  const printWindow = safeWindowOpen();
  if (!printWindow) return;

  const sanitizedHtml = sanitizePrintableHtml(html);
  
  // Add CSS to help with PDF styling
  const pdfHtml = sanitizedHtml.replace(
    '</head>',
    `<style>
      @page {
        size: A4;
        margin: 15mm;
      }
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    </style>
    </head>`
  );

  printWindow.document.open();
  printWindow.document.write(pdfHtml);
  printWindow.document.close();

  // Wait for content to load then trigger print dialog (user can save as PDF)
  setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      // ignore
    }
  }, 300);
};
