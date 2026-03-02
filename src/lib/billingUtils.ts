// Billing Letter PDF Generation and Email utilities

export interface BillingLetterData {
  letterNo: string;
  letterDate: string;
  customerName: string;
  customerAddress?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  outstandingAmount: number;
  overdueDays: number;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogoUrl?: string;
}

export interface MultiBillingInvoiceItem {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  outstandingAmount: number;
  overdueDays: number;
}

export interface MultiBillingLetterData {
  letterNo: string;
  letterDate: string;
  customerName: string;
  customerAddress?: string;
  invoices: MultiBillingInvoiceItem[];
  totalOutstanding: number;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogoUrl?: string;
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

export const generateLetterNumber = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `BL-${year}${month}-${random}`;
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

/** Calculate overdue days dynamically from due_date vs today */
export const calcOverdueDays = (dueDate: string, outstandingAmount: number): number => {
  if (outstandingAmount <= 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - due.getTime();
  return diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
};

export const generateBillingLetterHTML = (data: BillingLetterData): string => {
  // Escape all user-provided data to prevent XSS
  const safeData = {
    letterNo: escapeHtml(data.letterNo),
    letterDate: data.letterDate, // Date strings are safe
    customerName: escapeHtml(data.customerName),
    customerAddress: escapeHtml(data.customerAddress),
    invoiceNumber: escapeHtml(data.invoiceNumber),
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    invoiceAmount: data.invoiceAmount,
    outstandingAmount: data.outstandingAmount,
    overdueDays: data.overdueDays,
    companyName: escapeHtml(data.companyName),
    companyAddress: escapeHtml(data.companyAddress),
    companyPhone: escapeHtml(data.companyPhone),
    companyEmail: escapeHtml(data.companyEmail),
    companyLogoUrl: data.companyLogoUrl, // URL is validated by storage
  };

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billing Letter - ${safeData.letterNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .pdf-page {
      width: 794px;
      height: 1123px;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
    }
    .bg-letterhead {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }
    .bg-letterhead img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
    }
    .pdf-content {
      position: relative;
      z-index: 1;
      padding: 130px 80px 0 60px;
    }
    .doc-info {
      text-align: right;
      margin-bottom: 30px;
      font-size: 11pt;
      padding-right: 10px;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .doc-info-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-bottom: 2px;
    }
    .doc-info-label {
      font-weight: bold;
      min-width: 35px;
      text-align: left;
    }
    .recipient {
      margin-bottom: 25px;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .recipient-label { font-weight: bold; margin-bottom: 5px; }
    .subject {
      font-weight: bold;
      text-align: center;
      margin: 25px 0;
      text-decoration: underline;
      font-size: 13pt;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .content {
      text-align: justify;
      margin-bottom: 20px;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .invoice-table th, .invoice-table td {
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .invoice-table th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    .amount { text-align: right; }
    .total-row {
      font-weight: bold;
      background-color: #fff3cd;
    }
    .overdue-notice {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
      color: #721c24;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .footer {
      margin-top: 20px;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .signature {
      margin-top: 5px;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .signature-line {
      border-top: 1px solid #333;
      width: 200px;
      margin-top: 30px;
      padding-top: 5px;
    }
    table, thead, tbody, tr, td, th {
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    @media print {
      body { padding: 0; }
      .pdf-page { width: 210mm; min-height: 297mm; }
    }
  </style>
</head>
<body>
  <div class="pdf-page">
    <div class="bg-letterhead"><img src="/kop-surat-kemika.jpg" crossorigin="anonymous" /></div>
    <div class="pdf-content">
      <div class="doc-info">
        <div class="doc-info-row">
          <span class="doc-info-label">No.</span>
          <span>: ${safeData.letterNo}</span>
        </div>
        <div class="doc-info-row">
          <span class="doc-info-label">Tanggal</span>
          <span>: ${formatDateID(safeData.letterDate)}</span>
        </div>
      </div>

      <div class="recipient">
        <div class="recipient-label">Kepada Yth:</div>
        <div><strong>${safeData.customerName}</strong></div>
        ${safeData.customerAddress ? `<div>${safeData.customerAddress}</div>` : ''}
        <div>Di Tempat</div>
      </div>

      <div class="subject">SURAT PENAGIHAN PEMBAYARAN</div>

      <div class="content">
        <p>Dengan hormat,</p>
        <br>
        <p>Bersama surat ini kami sampaikan bahwa berdasarkan catatan pembukuan kami,
        terdapat tagihan yang belum terbayar atas transaksi sebagai berikut:</p>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Keterangan</th>
            <th class="amount">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>No. Invoice:</strong> ${safeData.invoiceNumber}<br>
              <strong>Tanggal Invoice:</strong> ${formatDateID(safeData.invoiceDate)}<br>
              <strong>Jatuh Tempo:</strong> ${formatDateID(safeData.dueDate)}
            </td>
            <td class="amount">${formatCurrencyIDR(safeData.invoiceAmount)}</td>
          </tr>
          <tr class="total-row">
            <td><strong>Total Tagihan Belum Terbayar</strong></td>
            <td class="amount"><strong>${formatCurrencyIDR(safeData.outstandingAmount)}</strong></td>
          </tr>
        </tbody>
      </table>

      ${safeData.overdueDays > 0 ? `
      <div class="overdue-notice">
        <strong>⚠️ PERHATIAN:</strong> Tagihan ini telah melewati jatuh tempo selama <strong>${safeData.overdueDays} hari</strong>.
        Mohon segera lakukan pembayaran untuk menghindari tindakan penagihan lebih lanjut.
      </div>
      ` : ''}

      <div class="content">
        <p>Kami mohon kesediaan Bapak/Ibu untuk segera melakukan pembayaran atas tagihan tersebut.
        Apabila pembayaran sudah dilakukan, mohon abaikan surat ini dan konfirmasi kepada kami
        dengan menyertakan bukti pembayaran.</p>
        <br>
        <p>Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.</p>
      </div>

      <div class="footer">
        <p>Hormat kami,</p>
        <div class="signature">
          <div class="signature-line">
            <strong>Finance Department</strong><br>
            ${safeData.companyName}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const generateWhatsAppMessage = (data: BillingLetterData): string => {
  // WhatsApp messages are plain text, but we still sanitize to prevent injection
  const safeName = String(data.companyName || '').replace(/[*_~`]/g, '');
  const safeCustomerName = String(data.customerName || '').replace(/[*_~`]/g, '');
  
  const message = `
*SURAT PENAGIHAN - ${safeName}*

Kepada Yth: *${safeCustomerName}*

Dengan hormat,

Kami informasikan bahwa terdapat tagihan yang belum terbayar:

📄 *Detail Tagihan:*
• No. Invoice: ${data.invoiceNumber}
• Tanggal Invoice: ${formatDateID(data.invoiceDate)}
• Jatuh Tempo: ${formatDateID(data.dueDate)}
• Total Tagihan: ${formatCurrencyIDR(data.outstandingAmount)}

${data.overdueDays > 0 ? `⚠️ *Tagihan ini telah melewati jatuh tempo ${data.overdueDays} hari.*\n` : ''}

Mohon segera lakukan pembayaran. Jika sudah dibayar, mohon konfirmasi dengan bukti pembayaran.

Terima kasih atas kerjasamanya.

Hormat kami,
*${safeName}*
Finance Department
`.trim();

  return message;
};

export const generateMultiBillingLetterHTML = (data: MultiBillingLetterData): string => {
  const safeData = {
    letterNo: escapeHtml(data.letterNo),
    letterDate: data.letterDate,
    customerName: escapeHtml(data.customerName),
    customerAddress: escapeHtml(data.customerAddress),
    companyName: escapeHtml(data.companyName),
    companyLogoUrl: data.companyLogoUrl,
  };

  const maxOverdue = Math.max(...data.invoices.map(i => i.overdueDays), 0);

  const invoiceRows = data.invoices.map((inv, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>${escapeHtml(inv.invoiceNumber)}</td>
      <td style="text-align:center;">${formatDateID(inv.invoiceDate)}</td>
      <td style="text-align:center;">${formatDateID(inv.dueDate)}</td>
      <td class="amount">${formatCurrencyIDR(inv.invoiceAmount)}</td>
      <td class="amount">${formatCurrencyIDR(inv.outstandingAmount)}</td>
      <td style="text-align:center;">${inv.overdueDays > 0 ? inv.overdueDays + ' hari' : '-'}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Surat Tagihan - ${safeData.letterNo}</title>
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
    .bg-letterhead {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 0; pointer-events: none;
    }
    .bg-letterhead img { width: 100%; height: 100%; display: block; object-fit: fill; }
    .pdf-content {
      position: relative; z-index: 1;
      padding: 130px 60px 80px 60px;
    }
    .doc-info {
      text-align: right; margin-bottom: 25px; font-size: 11pt; padding-right: 10px;
    }
    .doc-info-row { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 2px; }
    .doc-info-label { font-weight: bold; min-width: 35px; text-align: left; }
    .recipient { margin-bottom: 20px; }
    .recipient-label { font-weight: bold; margin-bottom: 5px; }
    .subject {
      font-weight: bold; text-align: center; margin: 20px 0;
      text-decoration: underline; font-size: 13pt;
    }
    .content { text-align: justify; margin-bottom: 15px; }
    .invoice-table {
      width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 10pt;
    }
    .invoice-table th, .invoice-table td {
      border: 1px solid #999; padding: 6px 8px; text-align: left;
    }
    .invoice-table th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
    .amount { text-align: right !important; }
    .total-row { font-weight: bold; background-color: #fff3cd; }
    .overdue-notice {
      background-color: #f8d7da; border: 1px solid #f5c6cb;
      padding: 10px; border-radius: 4px; margin: 15px 0; color: #721c24; font-size: 10pt;
    }
    .footer { margin-top: 20px; }
    .signature { margin-top: 5px; }
    .signature-line { border-top: 1px solid #333; width: 200px; margin-top: 30px; padding-top: 5px; }
    @media print {
      body { padding: 0; }
      .pdf-page { width: 210mm; min-height: 297mm; }
    }
  </style>
</head>
<body>
  <div class="pdf-page">
    <div class="bg-letterhead"><img src="/kop-surat-kemika.jpg" crossorigin="anonymous" /></div>
    <div class="pdf-content">
      <div class="doc-info">
        <div class="doc-info-row">
          <span class="doc-info-label">No.</span>
          <span>: ${safeData.letterNo}</span>
        </div>
        <div class="doc-info-row">
          <span class="doc-info-label">Tanggal</span>
          <span>: ${formatDateID(safeData.letterDate)}</span>
        </div>
      </div>

      <div class="recipient">
        <div class="recipient-label">Kepada Yth:</div>
        <div><strong>${safeData.customerName}</strong></div>
        ${safeData.customerAddress ? `<div>${safeData.customerAddress}</div>` : ''}
        <div>Di Tempat</div>
      </div>

      <div class="subject">SURAT PENAGIHAN PEMBAYARAN</div>

      <div class="content">
        <p>Dengan hormat,</p>
        <br>
        <p>Bersama surat ini kami sampaikan bahwa berdasarkan catatan pembukuan kami,
        terdapat beberapa tagihan yang belum terbayar atas transaksi sebagai berikut:</p>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width:30px;">No</th>
            <th>No. Invoice</th>
            <th style="width:110px;">Tgl Invoice</th>
            <th style="width:110px;">Jatuh Tempo</th>
            <th style="width:120px;">Nilai Invoice</th>
            <th style="width:120px;">Outstanding</th>
            <th style="width:70px;">Overdue</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceRows}
          <tr class="total-row">
            <td colspan="5" style="text-align:right;"><strong>Total Tagihan Belum Terbayar</strong></td>
            <td class="amount"><strong>${formatCurrencyIDR(data.totalOutstanding)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      ${maxOverdue > 0 ? `
      <div class="overdue-notice">
        <strong>⚠️ PERHATIAN:</strong> Terdapat tagihan yang telah melewati jatuh tempo.
        Mohon segera lakukan pembayaran untuk menghindari tindakan penagihan lebih lanjut.
      </div>
      ` : ''}

      <div class="content">
        <p>Kami mohon kesediaan Bapak/Ibu untuk segera melakukan pembayaran atas tagihan tersebut.
        Apabila pembayaran sudah dilakukan, mohon abaikan surat ini dan konfirmasi kepada kami
        dengan menyertakan bukti pembayaran.</p>
        <br>
        <p>Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.</p>
      </div>

      <div class="footer">
        <p>Hormat kami,</p>
        <div class="signature">
          <div class="signature-line">
            <strong>Finance Department</strong><br>
            ${safeData.companyName}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const generateMultiWhatsAppMessage = (data: MultiBillingLetterData): string => {
  const safeName = String(data.companyName || '').replace(/[*_~`]/g, '');
  const safeCustomerName = String(data.customerName || '').replace(/[*_~`]/g, '');

  const invoiceList = data.invoices.map((inv, idx) =>
    `${idx + 1}. ${inv.invoiceNumber} - Outstanding: ${formatCurrencyIDR(inv.outstandingAmount)}${inv.overdueDays > 0 ? ` (${inv.overdueDays} hari overdue)` : ''}`
  ).join('\n');

  return `
*SURAT PENAGIHAN - ${safeName}*

Kepada Yth: *${safeCustomerName}*

Dengan hormat,

Kami informasikan bahwa terdapat beberapa tagihan yang belum terbayar:

📄 *Daftar Tagihan:*
${invoiceList}

💰 *Total Outstanding: ${formatCurrencyIDR(data.totalOutstanding)}*

Mohon segera lakukan pembayaran. Jika sudah dibayar, mohon konfirmasi dengan bukti pembayaran.

Terima kasih atas kerjasamanya.

Hormat kami,
*${safeName}*
Finance Department
`.trim();
};

export const openWhatsApp = (phoneNumber: string, message: string): void => {
  // Clean phone number
  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  
  // Convert Indonesian format to international
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.substring(1);
  }
  
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  
  window.open(whatsappUrl, '_blank');
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

export const printBillingLetter = (html: string): void => {
  const sanitizedHtml = sanitizePrintableHtml(html);

  // Use hidden iframe for reliable direct-to-printer behavior
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

  // Wait for content and images to load, then trigger print
  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore
    }
    // Clean up after print dialog closes
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
    }, 1000);
  };

  iframe.onload = () => {
    // Extra delay for images/fonts
    setTimeout(triggerPrint, 500);
  };

  // Fallback if onload doesn't fire
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      triggerPrint();
    }
  }, 3000);
};

export const downloadBillingLetterPDF = async (html: string, filename: string): Promise<void> => {
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
    console.error('PDF generation failed:', error);
    
    // Fallback to print dialog using iframe
    printBillingLetter(html);
  }
};
