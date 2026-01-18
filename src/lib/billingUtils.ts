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
}

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

export const generateBillingLetterHTML = (data: BillingLetterData): string => {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billing Letter - ${data.letterNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Times New Roman', serif; 
      font-size: 12pt; 
      line-height: 1.5;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px;
      border-bottom: 2px solid #1a5c3a;
      padding-bottom: 15px;
    }
    .company-name { 
      font-size: 18pt; 
      font-weight: bold; 
      color: #1a5c3a;
      margin-bottom: 5px;
    }
    .company-info { 
      font-size: 10pt; 
      color: #666; 
    }
    .letter-info { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 25px;
    }
    .letter-no { font-weight: bold; }
    .recipient { margin-bottom: 25px; }
    .recipient-label { font-weight: bold; margin-bottom: 5px; }
    .subject { 
      font-weight: bold; 
      text-align: center; 
      margin: 25px 0;
      text-decoration: underline;
    }
    .content { 
      text-align: justify; 
      margin-bottom: 20px;
    }
    .invoice-table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0;
    }
    .invoice-table th, .invoice-table td { 
      border: 1px solid #ddd; 
      padding: 10px; 
      text-align: left;
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
    }
    .footer { 
      margin-top: 40px; 
    }
    .signature { 
      margin-top: 60px;
    }
    .signature-line { 
      border-top: 1px solid #333;
      width: 200px;
      margin-top: 60px;
      padding-top: 5px;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${data.companyName}</div>
    <div class="company-info">
      ${data.companyAddress || ''}<br>
      ${data.companyPhone ? `Telp: ${data.companyPhone}` : ''} ${data.companyEmail ? `| Email: ${data.companyEmail}` : ''}
    </div>
  </div>

  <div class="letter-info">
    <div>
      <div class="letter-no">No: ${data.letterNo}</div>
      <div>Perihal: <strong>Surat Penagihan</strong></div>
    </div>
    <div style="text-align: right;">
      <div>Jakarta, ${formatDateID(data.letterDate)}</div>
    </div>
  </div>

  <div class="recipient">
    <div class="recipient-label">Kepada Yth:</div>
    <div><strong>${data.customerName}</strong></div>
    ${data.customerAddress ? `<div>${data.customerAddress}</div>` : ''}
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
          <strong>No. Invoice:</strong> ${data.invoiceNumber}<br>
          <strong>Tanggal Invoice:</strong> ${formatDateID(data.invoiceDate)}<br>
          <strong>Jatuh Tempo:</strong> ${formatDateID(data.dueDate)}
        </td>
        <td class="amount">${formatCurrencyIDR(data.invoiceAmount)}</td>
      </tr>
      <tr class="total-row">
        <td><strong>Total Tagihan Belum Terbayar</strong></td>
        <td class="amount"><strong>${formatCurrencyIDR(data.outstandingAmount)}</strong></td>
      </tr>
    </tbody>
  </table>

  ${data.overdueDays > 0 ? `
  <div class="overdue-notice">
    <strong>⚠️ PERHATIAN:</strong> Tagihan ini telah melewati jatuh tempo selama <strong>${data.overdueDays} hari</strong>. 
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
        ${data.companyName}
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const generateWhatsAppMessage = (data: BillingLetterData): string => {
  const message = `
*SURAT PENAGIHAN - ${data.companyName}*

Kepada Yth: *${data.customerName}*

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
*${data.companyName}*
Finance Department
`.trim();

  return message;
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

const sanitizePrintableHtml = (html: string): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove high-risk elements entirely
    doc.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());

    // Remove inline event handlers and javascript: URLs
    const root = doc.documentElement;
    if (root) {
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode as Element | null;

      while (current) {
        for (const attr of Array.from(current.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value;

          if (name.startsWith('on')) {
            current.removeAttribute(attr.name);
            continue;
          }

          if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
            current.removeAttribute(attr.name);
          }
        }

        current = walker.nextNode() as Element | null;
      }
    }

    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  } catch {
    // Fallback: remove script tags only
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  }
};

const safeWindowOpen = (): Window | null => {
  // noopener/noreferrer prevents reverse-tabnabbing and reduces cross-window attacks
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (w) w.opener = null;
  return w;
};

export const printBillingLetter = (html: string): void => {
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

export const downloadBillingLetterPDF = async (html: string, filename: string): Promise<void> => {
  // Open in new window for manual PDF save (print to PDF)
  const printWindow = safeWindowOpen();
  if (!printWindow) return;

  const sanitizedHtml = sanitizePrintableHtml(html);
  const safeTitle = String(filename).replace(/[\r\n\t]/g, ' ').slice(0, 200);

  printWindow.document.open();
  printWindow.document.write(sanitizedHtml);
  printWindow.document.close();

  // Set title and show instructions without injecting script into the document
  try {
    printWindow.document.title = safeTitle;
  } catch {
    // ignore
  }

  setTimeout(() => {
    try {
      printWindow.alert("Untuk menyimpan sebagai PDF, gunakan Ctrl+P atau Cmd+P, lalu pilih 'Save as PDF'");
    } catch {
      // ignore
    }
  }, 250);
};
