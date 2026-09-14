import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Indonesian headers mapping for AP Invoice
export const AP_HEADERS_MAP: Record<string, string> = {
  'nama vendor': 'vendor_name',
  'no invoice vendor': 'vendor_invoice_number',
  'no po': 'po_number',
  'nama produk': 'product_name',
  'tanggal po sp': 'sp_po_date',
  'tanggal invoice': 'invoice_date',
  'terms pembayaran': 'terms_name',
  'jumlah invoice': 'invoice_amount',
  'catatan': 'notes',
};

// Indonesian headers mapping for AR Invoice
export const AR_HEADERS_MAP: Record<string, string> = {
  'nama customer': 'customer_name',
  'nama sales': 'sales_name',
  'no invoice': 'invoice_number',
  'no order': 'order_number',
  'tanggal po sp': 'sp_po_date',
  'tanggal invoice': 'invoice_date',
  'terms pembayaran': 'terms_name',
  'jumlah invoice': 'invoice_amount',
  'catatan': 'notes',
};

export interface ImportResult {
  success: boolean;
  data: any[];
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  column?: string;
  message: string;
}

const parseDate = (value: any): string | null => {
  if (!value) return null;
  
  // If it's a Date object
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // If it's a number (Excel serial date)
  if (typeof value === 'number') {
    // Excel serial date conversion (days since 1900-01-01, with leap year bug)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    // Try DD/MM/YYYY format
    const ddmmyyyy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
    }
    
    // Try YYYY-MM-DD format
    const yyyymmdd = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmdd) {
      return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
    }
  }
  
  return null;
};

const parseAmount = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  
  if (typeof value === 'number') return value;
  
  if (typeof value === 'string') {
    // Remove currency symbols, thousand separators, and spaces
    const cleaned = value.replace(/[Rp\s.]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  
  return null;
};

const getCellValue = (cell: ExcelJS.Cell): any => {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  
  const value = cell.value;
  
  // Handle rich text
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('');
  }
  
  // Handle formula results
  if (typeof value === 'object' && 'result' in value) {
    return (value as ExcelJS.CellFormulaValue).result;
  }
  
  // Handle hyperlinks
  if (typeof value === 'object' && 'text' in value) {
    return (value as ExcelJS.CellHyperlinkValue).text;
  }
  
  return value;
};

export const parseExcelFile = async (file: File): Promise<any[][]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          reject(new Error('No worksheet found'));
          return;
        }
        
        const jsonData: any[][] = [];
        worksheet.eachRow((row, rowNumber) => {
          const rowData: any[] = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            // Ensure we fill in any gaps
            while (rowData.length < colNumber - 1) {
              rowData.push(null);
            }
            rowData.push(getCellValue(cell));
          });
          jsonData.push(rowData);
        });
        
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const validateAndMapApData = (
  rows: any[][],
  vendors: { id: string; vendor_name: string }[],
  paymentTerms: { id: string; terms_name: string; days: number }[]
): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];
  
  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }
  
  // Get headers from first row and normalize them
  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  
  // Map headers to canonical keys
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = AP_HEADERS_MAP[header];
    if (mappedKey) {
      headerMap[index] = mappedKey;
    }
  });
  
  // Validate required headers
  const requiredHeaders = ['vendor_name', 'vendor_invoice_number', 'po_number', 'sp_po_date', 'invoice_date', 'terms_name', 'invoice_amount'];
  const mappedHeaders = Object.values(headerMap);
  const missingHeaders = requiredHeaders.filter(h => !mappedHeaders.includes(h));
  
  if (missingHeaders.length > 0) {
    errors.push({ 
      row: 1, 
      message: `Missing required columns: ${missingHeaders.join(', ')}. Expected Indonesian headers like: Nama Vendor, No Invoice Vendor, No PO, etc.` 
    });
    return { success: false, data: [], errors };
  }
  
  // Process data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) {
      continue; // Skip empty rows
    }
    
    const rowData: Record<string, any> = {};
    let hasError = false;
    
    // Map row data
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });
    
    // Validate and transform vendor
    const vendor = vendors.find(v => 
      v.vendor_name.toLowerCase() === String(rowData.vendor_name || '').toLowerCase().trim()
    );
    if (!vendor) {
      errors.push({ row: i + 1, column: 'Nama Vendor', message: `Vendor "${rowData.vendor_name}" not found` });
      hasError = true;
    } else {
      rowData.vendor_id = vendor.id;
    }
    
    // Validate and transform payment terms
    const terms = paymentTerms.find(t => 
      t.terms_name.toLowerCase() === String(rowData.terms_name || '').toLowerCase().trim()
    );
    if (!terms) {
      errors.push({ row: i + 1, column: 'Terms Pembayaran', message: `Payment terms "${rowData.terms_name}" not found` });
      hasError = true;
    } else {
      rowData.terms_id = terms.id;
      rowData.terms_days = terms.days;
    }
    
    // Parse dates
    const spPoDate = parseDate(rowData.sp_po_date);
    if (!spPoDate) {
      errors.push({ row: i + 1, column: 'Tanggal PO SP', message: 'Invalid date format' });
      hasError = true;
    } else {
      rowData.sp_po_date = spPoDate;
    }
    
    const invoiceDate = parseDate(rowData.invoice_date);
    if (!invoiceDate) {
      errors.push({ row: i + 1, column: 'Tanggal Invoice', message: 'Invalid date format' });
      hasError = true;
    } else {
      rowData.invoice_date = invoiceDate;
    }
    
    // Calculate due date
    if (invoiceDate && terms) {
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + terms.days);
      rowData.due_date = dueDate.toISOString().split('T')[0];
    }
    
    // Parse amount
    const amount = parseAmount(rowData.invoice_amount);
    if (amount === null || amount <= 0) {
      errors.push({ row: i + 1, column: 'Jumlah Invoice', message: 'Invalid amount' });
      hasError = true;
    } else {
      rowData.invoice_amount = amount;
      rowData.outstanding_amount = amount;
    }
    
    // Validate required strings
    if (!rowData.vendor_invoice_number || !String(rowData.vendor_invoice_number).trim()) {
      errors.push({ row: i + 1, column: 'No Invoice Vendor', message: 'Required field is empty' });
      hasError = true;
    }
    
    if (!rowData.po_number || !String(rowData.po_number).trim()) {
      errors.push({ row: i + 1, column: 'No PO', message: 'Required field is empty' });
      hasError = true;
    }
    
    if (!hasError) {
      data.push({
        vendor_id: rowData.vendor_id,
        vendor_invoice_number: String(rowData.vendor_invoice_number).trim(),
        po_number: String(rowData.po_number).trim(),
        product_name: rowData.product_name ? String(rowData.product_name).trim() : null,
        sp_po_date: rowData.sp_po_date,
        invoice_date: rowData.invoice_date,
        due_date: rowData.due_date,
        terms_id: rowData.terms_id,
        invoice_amount: rowData.invoice_amount,
        outstanding_amount: rowData.outstanding_amount,
        notes: rowData.notes ? String(rowData.notes).trim() : null,
        status: 'DRAFT',
      });
    }
  }
  
  return { success: errors.length === 0, data, errors };
};

export const validateAndMapArData = (
  rows: any[][],
  customers: { id: string; customer_name: string }[],
  sales: { id: string; sales_name: string }[],
  paymentTerms: { id: string; terms_name: string; days: number }[]
): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];
  
  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }
  
  // Get headers from first row and normalize them
  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  
  // Map headers to canonical keys
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = AR_HEADERS_MAP[header];
    if (mappedKey) {
      headerMap[index] = mappedKey;
    }
  });
  
  // Validate required headers
  const requiredHeaders = ['customer_name', 'invoice_number', 'order_number', 'sp_po_date', 'invoice_date', 'terms_name', 'invoice_amount'];
  const mappedHeaders = Object.values(headerMap);
  const missingHeaders = requiredHeaders.filter(h => !mappedHeaders.includes(h));
  
  if (missingHeaders.length > 0) {
    errors.push({ 
      row: 1, 
      message: `Missing required columns: ${missingHeaders.join(', ')}. Expected Indonesian headers like: Nama Customer, No Invoice, No Order, etc.` 
    });
    return { success: false, data: [], errors };
  }
  
  // Process data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) {
      continue; // Skip empty rows
    }
    
    const rowData: Record<string, any> = {};
    let hasError = false;
    
    // Map row data
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });
    
    // Validate and transform customer
    const customer = customers.find(c => 
      c.customer_name.toLowerCase() === String(rowData.customer_name || '').toLowerCase().trim()
    );
    if (!customer) {
      errors.push({ row: i + 1, column: 'Nama Customer', message: `Customer "${rowData.customer_name}" not found` });
      hasError = true;
    } else {
      rowData.customer_id = customer.id;
    }
    
    // Validate and transform sales (optional)
    if (rowData.sales_name && String(rowData.sales_name).trim()) {
      const salesPerson = sales.find(s => 
        s.sales_name.toLowerCase() === String(rowData.sales_name).toLowerCase().trim()
      );
      if (!salesPerson) {
        errors.push({ row: i + 1, column: 'Nama Sales', message: `Sales "${rowData.sales_name}" not found` });
        hasError = true;
      } else {
        rowData.sales_id = salesPerson.id;
      }
    } else {
      rowData.sales_id = null;
    }
    
    // Validate and transform payment terms
    const terms = paymentTerms.find(t => 
      t.terms_name.toLowerCase() === String(rowData.terms_name || '').toLowerCase().trim()
    );
    if (!terms) {
      errors.push({ row: i + 1, column: 'Terms Pembayaran', message: `Payment terms "${rowData.terms_name}" not found` });
      hasError = true;
    } else {
      rowData.terms_id = terms.id;
      rowData.terms_days = terms.days;
    }
    
    // Parse dates
    const spPoDate = parseDate(rowData.sp_po_date);
    if (!spPoDate) {
      errors.push({ row: i + 1, column: 'Tanggal PO SP', message: 'Invalid date format' });
      hasError = true;
    } else {
      rowData.sp_po_date = spPoDate;
    }
    
    const invoiceDate = parseDate(rowData.invoice_date);
    if (!invoiceDate) {
      errors.push({ row: i + 1, column: 'Tanggal Invoice', message: 'Invalid date format' });
      hasError = true;
    } else {
      rowData.invoice_date = invoiceDate;
    }
    
    // Calculate due date
    if (invoiceDate && terms) {
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + terms.days);
      rowData.due_date = dueDate.toISOString().split('T')[0];
    }
    
    // Parse amount
    const amount = parseAmount(rowData.invoice_amount);
    if (amount === null || amount <= 0) {
      errors.push({ row: i + 1, column: 'Jumlah Invoice', message: 'Invalid amount' });
      hasError = true;
    } else {
      rowData.invoice_amount = amount;
      rowData.outstanding_amount = amount;
    }
    
    // Validate required strings
    if (!rowData.invoice_number || !String(rowData.invoice_number).trim()) {
      errors.push({ row: i + 1, column: 'No Invoice', message: 'Required field is empty' });
      hasError = true;
    }
    
    if (!rowData.order_number || !String(rowData.order_number).trim()) {
      errors.push({ row: i + 1, column: 'No Order', message: 'Required field is empty' });
      hasError = true;
    }
    
    if (!hasError) {
      data.push({
        customer_id: rowData.customer_id,
        sales_id: rowData.sales_id,
        invoice_number: String(rowData.invoice_number).trim(),
        order_number: String(rowData.order_number).trim(),
        sp_po_date: rowData.sp_po_date,
        invoice_date: rowData.invoice_date,
        due_date: rowData.due_date,
        terms_id: rowData.terms_id,
        invoice_amount: rowData.invoice_amount,
        outstanding_amount: rowData.outstanding_amount,
        notes: rowData.notes ? String(rowData.notes).trim() : null,
        status: 'DRAFT',
      });
    }
  }
  
  return { success: errors.length === 0, data, errors };
};

export const generateApTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template AP');
  
  // Add headers
  const headers = [
    'Nama Vendor',
    'No Invoice Vendor',
    'No PO',
    'Nama Produk',
    'Tanggal PO SP',
    'Tanggal Invoice',
    'Terms Pembayaran',
    'Jumlah Invoice',
    'Catatan',
  ];
  
  worksheet.addRow(headers);
  
  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFCCCCCC' }
  };
  
  // Add sample data
  worksheet.addRow(['PT Supplier ABC', 'INV-001', 'PO-2024-001', 'Material A', '01/01/2024', '05/01/2024', 'NET 30', 10000000, '']);
  
  // Auto-fit columns
  worksheet.columns.forEach(column => {
    column.width = 20;
  });
  
  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_AP_Invoice.xlsx');
};

export const generateArTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template AR');
  
  const headers = [
    'Nama Customer', 'Nama Sales', 'No Invoice', 'No Order',
    'Tanggal PO SP', 'Tanggal Invoice', 'Terms Pembayaran', 'Jumlah Invoice', 'Catatan',
  ];
  
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['PT Customer XYZ', 'John Doe', 'INV-AR-001', 'ORD-2024-001', '01/01/2024', '05/01/2024', 'NET 30', 15000000, '']);
  worksheet.columns.forEach(column => { column.width = 20; });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_AR_Invoice.xlsx');
};

// ==================== VENDOR IMPORT ====================

export const VENDOR_HEADERS_MAP: Record<string, string> = {
  'nama vendor': 'vendor_name',
  'alamat': 'address',
  'telepon': 'phone',
  'email': 'email',
  'nama bank': 'bank_name',
  'no rekening': 'bank_account_no',
};

export const generateVendorTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Vendor');
  
  const headers = ['Nama Vendor', 'Alamat', 'Telepon', 'Email', 'Nama Bank', 'No Rekening'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['PT Supplier ABC', 'Jl. Industri No. 1', '021-12345678', 'supplier@abc.com', 'Bank Mandiri', '1234567890']);
  worksheet.addRow(['CV Maju Jaya', 'Jl. Raya No. 10', '021-87654321', 'info@majujaya.com', 'Bank BCA', '0987654321']);
  worksheet.columns.forEach(column => { column.width = 22; });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Vendor.xlsx');
};

export const validateAndMapVendorData = (rows: any[][]): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];
  
  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }
  
  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = VENDOR_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });
  
  const mappedHeaders = Object.values(headerMap);
  if (!mappedHeaders.includes('vendor_name')) {
    errors.push({ row: 1, message: 'Missing required column: Nama Vendor' });
    return { success: false, data: [], errors };
  }
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;
    
    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });
    
    const vendorName = rowData.vendor_name ? String(rowData.vendor_name).trim() : '';
    if (!vendorName) {
      errors.push({ row: i + 1, column: 'Nama Vendor', message: 'Nama vendor wajib diisi' });
      continue;
    }
    
    data.push({
      vendor_name: vendorName,
      address: rowData.address ? String(rowData.address).trim() : null,
      phone: rowData.phone ? String(rowData.phone).trim() : null,
      email: rowData.email ? String(rowData.email).trim() : null,
      bank_name: rowData.bank_name ? String(rowData.bank_name).trim() : null,
      bank_account_no: rowData.bank_account_no ? String(rowData.bank_account_no).trim() : null,
      is_active: true,
    });
  }
  
  return { success: errors.length === 0, data, errors };
};

// ==================== CUSTOMER IMPORT ====================

export const CUSTOMER_HEADERS_MAP: Record<string, string> = {
  'nama customer': 'customer_name',
  'nama pelanggan': 'customer_name',
  'alamat': 'address',
  'telepon': 'phone',
  'email penagihan': 'billing_email',
  'billing email': 'billing_email',
};

export const generateCustomerTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Customer');
  
  const headers = ['Nama Customer', 'Alamat', 'Telepon', 'Email Penagihan'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['PT Customer XYZ', 'Jl. Sudirman No. 1', '021-11111111', 'billing@xyz.com']);
  worksheet.addRow(['CV Abadi Sentosa', 'Jl. Gatot Subroto No. 5', '021-22222222', 'finance@abadi.com']);
  worksheet.columns.forEach(column => { column.width = 22; });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Customer.xlsx');
};

// ==================== SALES IMPORT ====================

export const SALES_HEADERS_MAP: Record<string, string> = {
  'nama sales': 'sales_name',
  'telepon': 'phone',
  'email': 'email',
};

export const generateSalesTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Sales');

  const headers = ['Nama Sales', 'Telepon', 'Email'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['Budi Santoso', '0812-3456-7890', 'budi@kemika.co.id']);
  worksheet.addRow(['Siti Rahma', '0813-9876-5432', 'siti@kemika.co.id']);
  worksheet.columns.forEach(column => { column.width = 22; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Sales.xlsx');
};

export const validateAndMapSalesData = (rows: any[][]): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];

  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }

  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = SALES_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });

  const mappedHeaders = Object.values(headerMap);
  if (!mappedHeaders.includes('sales_name')) {
    errors.push({ row: 1, message: 'Missing required column: Nama Sales' });
    return { success: false, data: [], errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;

    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });

    const salesName = rowData.sales_name ? String(rowData.sales_name).trim() : '';
    if (!salesName) {
      errors.push({ row: i + 1, column: 'Nama Sales', message: 'Nama sales wajib diisi' });
      continue;
    }

    data.push({
      sales_name: salesName,
      phone: rowData.phone ? String(rowData.phone).trim() : null,
      email: rowData.email ? String(rowData.email).trim() : null,
      is_active: true,
    });
  }

  return { success: errors.length === 0, data, errors };
};

// ==================== PAYMENT TERMS IMPORT ====================

export const PAYMENT_TERMS_HEADERS_MAP: Record<string, string> = {
  'nama termin': 'terms_name',
  'nama terms': 'terms_name',
  'jumlah hari': 'days',
  'hari': 'days',
};

export const generatePaymentTermsTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Termin');

  const headers = ['Nama Termin', 'Jumlah Hari'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['NET 30', 30]);
  worksheet.addRow(['NET 60', 60]);
  worksheet.columns.forEach(column => { column.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Payment_Terms.xlsx');
};

export const validateAndMapPaymentTermsData = (rows: any[][]): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];

  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }

  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = PAYMENT_TERMS_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });

  const mappedHeaders = Object.values(headerMap);
  if (!mappedHeaders.includes('terms_name')) {
    errors.push({ row: 1, message: 'Missing required column: Nama Termin' });
    return { success: false, data: [], errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;

    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });

    const termsName = rowData.terms_name ? String(rowData.terms_name).trim() : '';
    if (!termsName) {
      errors.push({ row: i + 1, column: 'Nama Termin', message: 'Nama termin wajib diisi' });
      continue;
    }

    const days = parseAmount(rowData.days);
    if (days === null || days < 0) {
      errors.push({ row: i + 1, column: 'Jumlah Hari', message: 'Jumlah hari tidak valid' });
      continue;
    }

    data.push({ terms_name: termsName, days, is_active: true });
  }

  return { success: errors.length === 0, data, errors };
};

// ==================== BANK ACCOUNTS IMPORT ====================

export const BANK_ACCOUNT_HEADERS_MAP: Record<string, string> = {
  'nama bank': 'bank_name',
  'no rekening': 'account_no',
  'nama pemilik rekening': 'account_name',
  'nama rekening': 'account_name',
  'kode akun gl': 'gl_account_code',
};

export const generateBankAccountTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Rekening');

  const headers = ['Nama Bank', 'No Rekening', 'Nama Pemilik Rekening', 'Kode Akun GL'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['Bank Mandiri', '1234567890', 'PT. Kemika Karya Pratama', '1100']);
  worksheet.addRow(['Bank BCA', '0987654321', 'PT. Kemika Karya Pratama', '']);
  worksheet.columns.forEach(column => { column.width = 24; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Bank_Accounts.xlsx');
};

export const validateAndMapBankAccountData = (
  rows: any[][],
  glAccounts: { id: string; code: string }[]
): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];

  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }

  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = BANK_ACCOUNT_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });

  const mappedHeaders = Object.values(headerMap);
  if (!mappedHeaders.includes('bank_name') || !mappedHeaders.includes('account_no') || !mappedHeaders.includes('account_name')) {
    errors.push({ row: 1, message: 'Missing required columns: Nama Bank, No Rekening, Nama Pemilik Rekening' });
    return { success: false, data: [], errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;

    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });

    const bankName = rowData.bank_name ? String(rowData.bank_name).trim() : '';
    const accountNo = rowData.account_no ? String(rowData.account_no).trim() : '';
    const accountName = rowData.account_name ? String(rowData.account_name).trim() : '';
    let hasError = false;

    if (!bankName) {
      errors.push({ row: i + 1, column: 'Nama Bank', message: 'Nama bank wajib diisi' });
      hasError = true;
    }
    if (!accountNo) {
      errors.push({ row: i + 1, column: 'No Rekening', message: 'No rekening wajib diisi' });
      hasError = true;
    }
    if (!accountName) {
      errors.push({ row: i + 1, column: 'Nama Pemilik Rekening', message: 'Nama pemilik rekening wajib diisi' });
      hasError = true;
    }

    let glAccountId: string | null = null;
    const glCode = rowData.gl_account_code ? String(rowData.gl_account_code).trim() : '';
    if (glCode) {
      const acc = glAccounts.find(a => a.code === glCode);
      if (!acc) {
        errors.push({ row: i + 1, column: 'Kode Akun GL', message: `Akun dengan kode "${glCode}" tidak ditemukan` });
        hasError = true;
      } else {
        glAccountId = acc.id;
      }
    }

    if (!hasError) {
      data.push({
        bank_name: bankName,
        account_no: accountNo,
        account_name: accountName,
        gl_account_id: glAccountId,
        is_active: true,
      });
    }
  }

  return { success: errors.length === 0, data, errors };
};

// ==================== CHART OF ACCOUNTS IMPORT ====================

export const COA_HEADERS_MAP: Record<string, string> = {
  'kode akun': 'code',
  'nama akun': 'name',
  'tipe akun': 'account_type',
  'saldo normal': 'normal_balance',
  'kode akun induk': 'parent_code',
  'akun kontrol': 'is_control_account',
};

const ACCOUNT_TYPE_ALIASES: Record<string, string> = {
  'aset': 'ASSET', 'asset': 'ASSET',
  'liabilitas': 'LIABILITY', 'liability': 'LIABILITY', 'kewajiban': 'LIABILITY',
  'ekuitas': 'EQUITY', 'equity': 'EQUITY',
  'pendapatan': 'REVENUE', 'revenue': 'REVENUE',
  'beban': 'EXPENSE', 'expense': 'EXPENSE',
};

const NORMAL_BALANCE_ALIASES: Record<string, string> = {
  'debit': 'DEBIT', 'debet': 'DEBIT',
  'kredit': 'CREDIT', 'credit': 'CREDIT',
};

export const generateChartOfAccountsTemplate = async (): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Bagan Akun');

  const headers = ['Kode Akun', 'Nama Akun', 'Tipe Akun', 'Saldo Normal', 'Kode Akun Induk', 'Akun Kontrol'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
  worksheet.addRow(['1000', 'ASET', 'Aset', 'Debit', '', 'Tidak']);
  worksheet.addRow(['1110', 'Kas', 'Aset', 'Debit', '1000', 'Tidak']);
  worksheet.addRow(['1210', 'Piutang Usaha', 'Aset', 'Debit', '1000', 'Ya']);
  worksheet.columns.forEach(column => { column.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Template_Import_Chart_of_Accounts.xlsx');
};

// Two-pass mapping so a row can reference a parent code defined earlier in the
// same file, resolved after all rows in the batch have been validated.
export const validateAndMapChartOfAccountsData = (
  rows: any[][],
  existingAccounts: { id: string; code: string }[]
): ImportResult => {
  const errors: ImportError[] = [];
  const staged: { code: string; name: string; account_type: string; normal_balance: string; parent_code: string; is_control_account: boolean }[] = [];

  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }

  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = COA_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });

  const mappedHeaders = Object.values(headerMap);
  const requiredHeaders = ['code', 'name', 'account_type', 'normal_balance'];
  const missingHeaders = requiredHeaders.filter(h => !mappedHeaders.includes(h));
  if (missingHeaders.length > 0) {
    errors.push({ row: 1, message: `Missing required columns: Kode Akun, Nama Akun, Tipe Akun, Saldo Normal` });
    return { success: false, data: [], errors };
  }

  const knownCodes = new Set(existingAccounts.map(a => a.code));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;

    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });

    const code = rowData.code ? String(rowData.code).trim() : '';
    const name = rowData.name ? String(rowData.name).trim() : '';
    let hasError = false;

    if (!code) {
      errors.push({ row: i + 1, column: 'Kode Akun', message: 'Kode akun wajib diisi' });
      hasError = true;
    } else if (knownCodes.has(code)) {
      errors.push({ row: i + 1, column: 'Kode Akun', message: `Kode akun "${code}" sudah ada` });
      hasError = true;
    }
    if (!name) {
      errors.push({ row: i + 1, column: 'Nama Akun', message: 'Nama akun wajib diisi' });
      hasError = true;
    }

    const typeRaw = String(rowData.account_type || '').toLowerCase().trim();
    const accountType = ACCOUNT_TYPE_ALIASES[typeRaw];
    if (!accountType) {
      errors.push({ row: i + 1, column: 'Tipe Akun', message: 'Tipe akun harus salah satu dari: Aset, Liabilitas, Ekuitas, Pendapatan, Beban' });
      hasError = true;
    }

    const balanceRaw = String(rowData.normal_balance || '').toLowerCase().trim();
    const normalBalance = NORMAL_BALANCE_ALIASES[balanceRaw];
    if (!normalBalance) {
      errors.push({ row: i + 1, column: 'Saldo Normal', message: 'Saldo normal harus Debit atau Kredit' });
      hasError = true;
    }

    const parentCode = rowData.parent_code ? String(rowData.parent_code).trim() : '';
    if (parentCode && !knownCodes.has(parentCode)) {
      errors.push({ row: i + 1, column: 'Kode Akun Induk', message: `Kode akun induk "${parentCode}" tidak ditemukan` });
      hasError = true;
    }

    const controlRaw = String(rowData.is_control_account || '').toLowerCase().trim();
    const isControl = ['ya', 'yes', 'true', '1'].includes(controlRaw);

    if (!hasError) {
      if (code) knownCodes.add(code); // allow later rows in the same file to reference this as parent
      staged.push({ code, name, account_type: accountType, normal_balance: normalBalance, parent_code: parentCode, is_control_account: isControl });
    }
  }

  const data = staged.map(s => ({
    code: s.code,
    name: s.name,
    account_type: s.account_type,
    normal_balance: s.normal_balance,
    parent_code: s.parent_code || null, // resolved to parent_id by the caller after insert, since new codes in this same batch don't have ids yet
    is_control_account: s.is_control_account,
    is_active: true,
  }));

  return { success: errors.length === 0, data, errors };
};

export const validateAndMapCustomerData = (rows: any[][]): ImportResult => {
  const errors: ImportError[] = [];
  const data: any[] = [];
  
  if (rows.length < 2) {
    errors.push({ row: 0, message: 'File is empty or has no data rows' });
    return { success: false, data: [], errors };
  }
  
  const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
  const headerMap: Record<number, string> = {};
  headers.forEach((header, index) => {
    const mappedKey = CUSTOMER_HEADERS_MAP[header];
    if (mappedKey) headerMap[index] = mappedKey;
  });
  
  const mappedHeaders = Object.values(headerMap);
  if (!mappedHeaders.includes('customer_name')) {
    errors.push({ row: 1, message: 'Missing required column: Nama Customer' });
    return { success: false, data: [], errors };
  }
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === '')) continue;
    
    const rowData: Record<string, any> = {};
    Object.entries(headerMap).forEach(([colIndex, key]) => {
      rowData[key] = row[parseInt(colIndex)];
    });
    
    const customerName = rowData.customer_name ? String(rowData.customer_name).trim() : '';
    if (!customerName) {
      errors.push({ row: i + 1, column: 'Nama Customer', message: 'Nama customer wajib diisi' });
      continue;
    }
    
    data.push({
      customer_name: customerName,
      address: rowData.address ? String(rowData.address).trim() : null,
      phone: rowData.phone ? String(rowData.phone).trim() : null,
      billing_email: rowData.billing_email ? String(rowData.billing_email).trim() : null,
      is_active: true,
    });
  }
  
  return { success: errors.length === 0, data, errors };
};
