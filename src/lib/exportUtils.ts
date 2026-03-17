// Export utilities for AP/AR data
import { jsPDF } from 'jspdf';

export interface ExportColumn {
  key: string;
  header: string;
  format?: (value: any) => string;
}

export const exportToCSV = (
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) => {
  if (data.length === 0) return;

  const headers = columns.map(col => col.header);
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col.key];
      const formatted = col.format ? col.format(value) : value;
      // Escape quotes and wrap in quotes if contains comma
      const stringValue = String(formatted ?? '');
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
  );

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
};

export const exportToExcel = (
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) => {
  if (data.length === 0) return;

  // Create Excel XML format (works without external library)
  const headers = columns.map(col => col.header);
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col.key];
      return col.format ? col.format(value) : value;
    })
  );

  const escapeXml = (str: string) => {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const xmlRows = [
    '<Row ss:StyleID="Header">' + headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') + '</Row>',
    ...rows.map(row =>
      '<Row>' +
      row.map(cell => {
        // Handle null/undefined/NaN explicitly - always output "0" for numeric zero
        const rawValue = cell;
        const value = String(rawValue ?? '');

        // Check if original value is a number (including 0)
        if (rawValue === 0 || rawValue === '0') {
          return `<Cell><Data ss:Type="Number">0</Data></Cell>`;
        }

        if (value === '' || value === 'null' || value === 'undefined' || value === 'NaN') {
          return `<Cell><Data ss:Type="String"></Data></Cell>`;
        }

        // Check if it's a formatted number (e.g., "1.234.567" or "0")
        const cleanNum = value.replace(/[^\d.-]/g, '');
        const isNumber = cleanNum !== '' && !isNaN(Number(cleanNum)) && value.match(/^[\d,.\s-]+$/);
        const type = isNumber ? 'Number' : 'String';
        const cellValue = isNumber ? cleanNum : value;
        return `<Cell><Data ss:Type="${type}">${escapeXml(cellValue)}</Data></Cell>`;
      }).join('') +
      '</Row>'
    )
  ].join('');

  const excelContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#CCCCCC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Data">
    <Table>
      ${xmlRows}
    </Table>
  </Worksheet>
</Workbook>`;

  downloadFile(excelContent, `${filename}.xls`, 'application/vnd.ms-excel');
};

export const exportToPDF = async (
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string,
  title?: string
) => {
  if (data.length === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;

  // Try to load company logo
  let logoLoaded = false;
  let logoDataUrl: string | null = null;
  let companyName = '';
  try {
    const { data: profile } = await supabase
      .from('company_profile')
      .select('logo_url, company_name, brand_name')
      .limit(1)
      .maybeSingle();

    companyName = profile?.brand_name || profile?.company_name || '';

    const logoUrl = profile?.logo_url;
    if (logoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => { logoLoaded = true; resolve(); };
        img.onerror = () => resolve();
        img.src = logoUrl;
      });
      if (logoLoaded) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL('image/png');
      }
    }
  } catch {
    // fallback: no logo
  }

  // If no logo from profile, try local fallback
  if (!logoDataUrl) {
    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => { logoLoaded = true; resolve(); };
        img.onerror = () => resolve();
        img.src = '/logo-kemika-new.png';
      });
      if (logoLoaded) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL('image/png');
      }
    } catch {
      // no logo at all
    }
  }

  let headerY = margin;

  // Draw logo + company name header
  if (logoDataUrl) {
    const logoH = 12;
    const logoW = logoH * 2.5; // approximate aspect ratio
    doc.addImage(logoDataUrl, 'PNG', margin, headerY, logoW, logoH);
    if (companyName) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, margin + logoW + 3, headerY + 7);
    }
    headerY += logoH + 2;
  } else if (companyName) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, margin, headerY + 5);
    headerY += 8;
  }

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, headerY, pageWidth - margin, headerY);
  headerY += 3;

  // Title
  if (title) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, headerY + 5, { align: 'center' });
    headerY += 8;
  }

  // Date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('id-ID')}`, pageWidth - margin, headerY, { align: 'right' });
  headerY += 4;

  // Calculate column widths proportionally
  const headers = columns.map(col => col.header);
  const colWidths = columns.map(col => {
    const headerLen = col.header.length;
    return Math.max(headerLen * 2, 15);
  });
  const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
  const scaledWidths = colWidths.map(w => (w / totalColWidth) * usableWidth);

  let y = headerY;
  const rowHeight = 6;
  const headerHeight = 8;
  const fontSize = 7;

  const drawHeader = () => {
    doc.setFillColor(200, 200, 200);
    doc.rect(margin, y, usableWidth, headerHeight, 'F');
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    let x = margin;
    headers.forEach((header, i) => {
      doc.text(header, x + 1, y + headerHeight - 2, { maxWidth: scaledWidths[i] - 2 });
      x += scaledWidths[i];
    });
    y += headerHeight;
  };

  drawHeader();

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  data.forEach((row, rowIndex) => {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin + 5;
      drawHeader();
    }

    // Alternate row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, usableWidth, rowHeight, 'F');
    }

    // Draw cell borders
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y, usableWidth, rowHeight, 'S');

    let x = margin;
    doc.setTextColor(30, 30, 30);
    columns.forEach((col, i) => {
      const value = row[col.key];
      const formatted = col.format ? col.format(value) : String(value ?? '');
      const displayValue = String(formatted ?? '');
      doc.text(displayValue, x + 1, y + rowHeight - 1.5, { maxWidth: scaledWidths[i] - 2 });
      x += scaledWidths[i];
    });

    y += rowHeight;
  });

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(`Halaman ${i} / ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  doc.save(`${filename}.pdf`);
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const formatCurrencyForExport = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '0';
  return new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount));
};

export const formatDateForExport = (dateString: string) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('id-ID');
};
