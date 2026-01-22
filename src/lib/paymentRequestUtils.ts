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
  requestedBy: string;
  status: string;
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
    requestedBy: escapeHtml(data.requestedBy),
    status: escapeHtml(data.status),
  };

  const statusLabel = {
    'SUBMITTED': 'Diajukan / Submitted',
    'APPROVED': 'Disetujui / Approved',
  }[data.status] || data.status;

  const statusColor = data.status === 'APPROVED' ? '#166534' : '#c2410c';

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
      font-size: 11pt; 
      line-height: 1.5;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { 
      text-align: center; 
      margin-bottom: 25px;
      border-bottom: 3px solid #1a5c3a;
      padding-bottom: 15px;
    }
    .company-name { 
      font-size: 20pt; 
      font-weight: bold; 
      color: #1a5c3a;
      margin-bottom: 5px;
    }
    .company-info { 
      font-size: 9pt; 
      color: #666; 
    }
    .document-title {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      margin: 20px 0;
      text-transform: uppercase;
      color: #1a5c3a;
    }
    .document-subtitle {
      text-align: center;
      font-size: 12pt;
      color: #666;
      margin-bottom: 25px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      background-color: #f8f9fa;
      padding: 12px 15px;
      border-radius: 5px;
    }
    .info-item {
      text-align: center;
    }
    .info-label {
      font-size: 9pt;
      color: #666;
      margin-bottom: 3px;
    }
    .info-value {
      font-weight: bold;
      font-size: 11pt;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 10pt;
      color: white;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-weight: bold;
      font-size: 11pt;
      color: #1a5c3a;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .detail-table {
      width: 100%;
      border-collapse: collapse;
    }
    .detail-table td {
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-table td:first-child {
      width: 40%;
      color: #666;
    }
    .detail-table td:last-child {
      font-weight: 500;
    }
    .amount-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    .amount-table th, .amount-table td {
      padding: 12px;
      text-align: left;
      border: 1px solid #ddd;
    }
    .amount-table th {
      background-color: #1a5c3a;
      color: white;
      font-weight: 600;
    }
    .amount-table .amount {
      text-align: right;
      font-weight: bold;
    }
    .total-row {
      background-color: #fff3cd;
      font-weight: bold;
    }
    .total-row .amount {
      font-size: 14pt;
      color: #1a5c3a;
    }
    .notes-box {
      background-color: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 12px;
      margin-top: 10px;
      font-style: italic;
    }
    .overdue-notice {
      background-color: #fee2e2;
      border: 1px solid #fecaca;
      padding: 12px;
      border-radius: 5px;
      margin: 15px 0;
      color: #991b1b;
      font-weight: 500;
    }
    .signature-section {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      text-align: center;
      width: 30%;
    }
    .signature-line {
      border-top: 1px solid #333;
      margin-top: 70px;
      padding-top: 8px;
    }
    .signature-title {
      font-size: 9pt;
      color: #666;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 8pt;
      color: #999;
      border-top: 1px solid #eee;
      padding-top: 15px;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${safeData.companyName}</div>
    <div class="company-info">
      ${safeData.companyAddress || ''}<br>
      ${safeData.companyPhone ? `Telp: ${safeData.companyPhone}` : ''} ${safeData.companyEmail ? `| Email: ${safeData.companyEmail}` : ''}
    </div>
  </div>

  <div class="document-title">PENGAJUAN PEMBAYARAN</div>
  <div class="document-subtitle">Payment Request Form</div>

  <div class="info-row">
    <div class="info-item">
      <div class="info-label">No. Dokumen</div>
      <div class="info-value">${safeData.requestNo}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tanggal</div>
      <div class="info-value">${formatDateID(safeData.requestDate)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Status</div>
      <div class="info-value">
        <span class="status-badge" style="background-color: ${statusColor};">
          ${statusLabel}
        </span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Informasi Vendor / Vendor Information</div>
    <table class="detail-table">
      <tr>
        <td>Nama Vendor / Vendor Name</td>
        <td>${safeData.vendorName}</td>
      </tr>
      ${safeData.vendorAddress ? `
      <tr>
        <td>Alamat / Address</td>
        <td>${safeData.vendorAddress}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Detail Invoice / Invoice Details</div>
    <table class="detail-table">
      <tr>
        <td>No. Invoice Vendor</td>
        <td>${safeData.vendorInvoiceNumber}</td>
      </tr>
      <tr>
        <td>No. PO</td>
        <td>${safeData.poNumber}</td>
      </tr>
      ${safeData.productName ? `
      <tr>
        <td>Nama Produk / Product Name</td>
        <td>${safeData.productName}</td>
      </tr>
      ` : ''}
      <tr>
        <td>Tanggal SP PO</td>
        <td>${formatDateID(safeData.spPoDate)}</td>
      </tr>
      <tr>
        <td>Tanggal Invoice</td>
        <td>${formatDateID(safeData.invoiceDate)}</td>
      </tr>
      <tr>
        <td>Jatuh Tempo / Due Date</td>
        <td>${formatDateID(safeData.dueDate)}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Rincian Pembayaran / Payment Details</div>
    <table class="amount-table">
      <thead>
        <tr>
          <th>Keterangan / Description</th>
          <th style="text-align: right;">Jumlah / Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Nilai Invoice / Invoice Amount</td>
          <td class="amount">${formatCurrencyIDR(safeData.invoiceAmount)}</td>
        </tr>
        <tr class="total-row">
          <td><strong>Total Yang Harus Dibayar / Total Amount Due</strong></td>
          <td class="amount">${formatCurrencyIDR(safeData.outstandingAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${safeData.overdueDays > 0 ? `
  <div class="overdue-notice">
    ⚠️ <strong>PERHATIAN:</strong> Invoice ini telah melewati jatuh tempo selama <strong>${safeData.overdueDays} hari</strong>. 
    Mohon segera diproses untuk menghindari keterlambatan lebih lanjut.
  </div>
  ` : ''}

  ${safeData.notes ? `
  <div class="section">
    <div class="section-title">Catatan / Notes</div>
    <div class="notes-box">${safeData.notes}</div>
  </div>
  ` : ''}

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-title">Diajukan oleh / Requested by</div>
      <div class="signature-line">
        <strong>${safeData.requestedBy}</strong><br>
        <span style="font-size: 9pt; color: #666;">Purchasing</span>
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-title">Disetujui oleh / Approved by</div>
      <div class="signature-line">
        <strong>________________</strong><br>
        <span style="font-size: 9pt; color: #666;">Finance Manager</span>
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-title">Diketahui oleh / Acknowledged by</div>
      <div class="signature-line">
        <strong>________________</strong><br>
        <span style="font-size: 9pt; color: #666;">Director</span>
      </div>
    </div>
  </div>

  <div class="footer">
    Dokumen ini dicetak pada ${formatDateID(new Date().toISOString())} | ${safeData.companyName}
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
