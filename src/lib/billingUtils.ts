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
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #1a5c3a;
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
      font-size: 16pt;
      font-weight: bold;
      color: #1a5c3a;
    }
    .title-section {
      flex: 1;
      text-align: center;
      padding: 0 20px;
    }
    .document-title {
      font-size: 18pt;
      font-weight: bold;
      color: #1a5c3a;
      margin-top: 10px;
    }
    .doc-info-box {
      border: 2px solid #1a5c3a;
      padding: 8px 12px;
      display: inline-block;
      text-align: left;
      min-width: 180px;
    }
    .doc-info-row {
      display: flex;
      gap: 10px;
      font-size: 10pt;
      margin-bottom: 2px;
    }
    .doc-info-row:last-child {
      margin-bottom: 0;
    }
    .doc-info-label {
      font-weight: bold;
      min-width: 35px;
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
    .recipient { margin-bottom: 25px; margin-top: 20px; }
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
    <div class="logo-container">
      ${safeData.companyLogoUrl ? 
        `<img src="${safeData.companyLogoUrl}" alt="Company Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="logo-text" style="display:none;">${safeData.companyName}</div>` : 
        `<img src="/logo-kemika-new.png" alt="Kemika Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="logo-text" style="display:none;">${safeData.companyName}</div>`
      }
    </div>
    <div class="title-section">
      <div class="document-title">SURAT PENAGIHAN</div>
    </div>
    <div class="doc-info-box">
      <div class="doc-info-row">
        <span class="doc-info-label">No.</span>
        <span>: ${safeData.letterNo}</span>
      </div>
      <div class="doc-info-row">
        <span class="doc-info-label">Date</span>
        <span>: ${formatDateID(safeData.letterDate)}</span>
      </div>
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
  try {
    // Dynamically import html2pdf.js
    const html2pdf = (await import('html2pdf.js')).default;
    
    const safeFilename = String(filename).replace(/[\r\n\t]/g, ' ').replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 100);
    
    // Create a temporary container with proper styling
    const container = document.createElement('div');
    container.style.position = 'fixed';
    // Keep it rendered (so html2canvas can capture), but move off-screen
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.minHeight = '297mm';
    container.style.background = 'white';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    
    // Extract body content from the full HTML document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Get style and body content
    const styleContent = doc.querySelector('style')?.outerHTML || '';
    const bodyContent = doc.body?.innerHTML || html;
    
    container.innerHTML = `
      ${styleContent}
      <div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; background: white;">
        ${bodyContent}
      </div>
    `;

    // Ensure external images (e.g., logo) can be captured by html2canvas
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
      if (!img.getAttribute('crossorigin')) img.setAttribute('crossorigin', 'anonymous');
      if (!img.getAttribute('referrerpolicy')) img.setAttribute('referrerpolicy', 'no-referrer');
    });
    
    document.body.appendChild(container);
    
    // Wait for images to load with timeout
    const imageLoadPromises = Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight !== 0) {
            resolve();
          } else {
            const timeout = setTimeout(() => resolve(), 3000);
            img.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timeout);
              img.style.display = 'none';
              resolve();
            };
          }
        })
    );
    
    await Promise.all(imageLoadPromises);
    
    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number],
      filename: `${safeFilename}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794, // A4 width in pixels at 96 DPI
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    };
    
    await html2pdf().set(opt).from(container).save();
    
    // Cleanup
    document.body.removeChild(container);
  } catch (error) {
    console.error('PDF generation failed:', error);
    
    // Fallback to print dialog
    const printWindow = safeWindowOpen();
    if (!printWindow) {
      alert('Tidak dapat membuka window untuk download. Silakan izinkan popup di browser Anda.');
      return;
    }

    const sanitizedHtml = sanitizePrintableHtml(html);
    printWindow.document.open();
    printWindow.document.write(sanitizedHtml);
    printWindow.document.close();

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // ignore
      }
    }, 500);
  }
};
