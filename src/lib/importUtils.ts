import * as XLSX from 'xlsx';

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
  
  // If it's already a Date object or number (Excel serial date)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
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

export const parseExcelFile = async (file: File): Promise<any[][]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        resolve(jsonData as any[][]);
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

export const generateApTemplate = (): void => {
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
  
  const sampleData = [
    ['PT Supplier ABC', 'INV-001', 'PO-2024-001', 'Material A', '01/01/2024', '05/01/2024', 'NET 30', '10000000', ''],
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template AP');
  XLSX.writeFile(wb, 'Template_Import_AP_Invoice.xlsx');
};

export const generateArTemplate = (): void => {
  const headers = [
    'Nama Customer',
    'Nama Sales',
    'No Invoice',
    'No Order',
    'Tanggal PO SP',
    'Tanggal Invoice',
    'Terms Pembayaran',
    'Jumlah Invoice',
    'Catatan',
  ];
  
  const sampleData = [
    ['PT Customer XYZ', 'John Doe', 'INV-AR-001', 'ORD-2024-001', '01/01/2024', '05/01/2024', 'NET 30', '15000000', ''],
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template AR');
  XLSX.writeFile(wb, 'Template_Import_AR_Invoice.xlsx');
};
