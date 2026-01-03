// Export utilities for AP/AR data

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
    '<Row>' + headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') + '</Row>',
    ...rows.map(row =>
      '<Row>' +
      row.map(cell => {
        const value = String(cell ?? '');
        const isNumber = !isNaN(Number(value.replace(/[^\d.-]/g, ''))) && value.match(/^[\d,.-]+$/);
        const type = isNumber ? 'Number' : 'String';
        const cleanValue = isNumber ? value.replace(/[^\d.-]/g, '') : value;
        return `<Cell><Data ss:Type="${type}">${escapeXml(cleanValue)}</Data></Cell>`;
      }).join('') +
      '</Row>'
    )
  ].join('');

  const excelContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
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

export const formatCurrencyForExport = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDateForExport = (dateString: string) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('id-ID');
};
