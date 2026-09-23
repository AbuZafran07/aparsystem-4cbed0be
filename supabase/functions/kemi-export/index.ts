import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kemi-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Constant-time comparison (length-independent via HMAC-style digest compare)
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = va.length ^ vb.length;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("KEMI_EXPORT_SECRET") ?? "";
  const provided = req.headers.get("x-kemi-secret") ?? "";

  if (!expected || !(await timingSafeEqual(provided, expected))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const [arRes, apRes, custRes, vendRes, bankRes] = await Promise.all([
      supabase
        .from("ar_invoices")
        .select(
          "id, invoice_number, order_number, wms_so_number, customer_id, invoice_date, due_date, invoice_amount, paid_amount, outstanding_amount, overdue_amount, overdue_days, status, doc_sent_date, paid_date",
        )
        .neq("status", "CANCELLED")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("ap_invoices")
        .select(
          "id, vendor_invoice_number, po_number, vendor_id, invoice_date, due_date, invoice_amount, paid_amount, outstanding_amount, overdue_amount, overdue_days, status, paid_date",
        )
        .neq("status", "CANCELLED")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("customers")
        .select("id, customer_name, is_active")
        .order("customer_name"),
      supabase
        .from("vendors")
        .select("id, vendor_name, is_active")
        .order("vendor_name"),
      supabase
        .from("bank_accounts")
        .select("id, bank_name, account_name, account_no, is_active, gl_account_id")
        .eq("is_active", true)
        .order("bank_name"),
    ]);

    for (const r of [arRes, apRes, custRes, vendRes, bankRes]) {
      if (r.error) throw r.error;
    }

    const ar = arRes.data ?? [];
    const ap = apRes.data ?? [];
    const customers = custRes.data ?? [];
    const vendors = vendRes.data ?? [];
    const banks = bankRes.data ?? [];

    // Current cash/bank balances from the general ledger (debit - credit, up to today)
    const asOf = new Date().toISOString().slice(0, 10);
    const glAccountIds = banks
      .map((b) => b.gl_account_id)
      .filter((id): id is string => Boolean(id));

    const balanceByAccount = new Map<string, number>();
    if (glAccountIds.length > 0) {
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: glRows, error: glError } = await supabase
          .from("general_ledger")
          .select("account_id, debit, credit")
          .in("account_id", glAccountIds)
          .lte("posting_date", asOf)
          .range(from, from + pageSize - 1);
        if (glError) throw glError;
        for (const row of glRows ?? []) {
          const prev = balanceByAccount.get(row.account_id) ?? 0;
          balanceByAccount.set(
            row.account_id,
            prev + Number(row.debit ?? 0) - Number(row.credit ?? 0),
          );
        }
        if (!glRows || glRows.length < pageSize) break;
      }
    }

    const cashPositions = banks.map((b) => ({
      id: b.id,
      as_of_date: asOf,
      bank_name: b.bank_name,
      account_name: b.account_name,
      account_no_masked: b.account_no
        ? `****${String(b.account_no).slice(-4)}`
        : null,
      gl_account_id: b.gl_account_id,
      balance: b.gl_account_id
        ? (balanceByAccount.get(b.gl_account_id) ?? 0)
        : 0,
      has_gl_mapping: Boolean(b.gl_account_id),
    }));


    const customerMap = new Map(customers.map((c) => [c.id, c.customer_name]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v.vendor_name]));

    const sum = (rows: Array<Record<string, unknown>>, key: string) =>
      rows.reduce((t, r) => t + Number(r[key] ?? 0), 0);

    const summarize = (rows: Array<Record<string, unknown>>) => ({
      invoice_count: rows.length,
      total_amount: sum(rows, "invoice_amount"),
      total_paid: sum(rows, "paid_amount"),
      total_outstanding: sum(rows, "outstanding_amount"),
      total_overdue: sum(rows, "overdue_amount"),
      overdue_count: rows.filter((r) => Number(r.overdue_amount ?? 0) > 0).length,
    });

    const arInvoices = ar.map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      order_number: i.order_number,
      wms_so_number: i.wms_so_number,
      customer_id: i.customer_id,
      customer_name: customerMap.get(i.customer_id) ?? null,
      invoice_date: i.invoice_date,
      due_date: i.due_date,
      doc_sent_date: i.doc_sent_date,
      paid_date: i.paid_date,
      invoice_amount: Number(i.invoice_amount ?? 0),
      paid_amount: Number(i.paid_amount ?? 0),
      outstanding_amount: Number(i.outstanding_amount ?? 0),
      overdue_amount: Number(i.overdue_amount ?? 0),
      overdue_days: Number(i.overdue_days ?? 0),
      status: i.status,
    }));

    const apInvoices = ap.map((i) => ({
      id: i.id,
      vendor_invoice_number: i.vendor_invoice_number,
      po_number: i.po_number,
      vendor_id: i.vendor_id,
      vendor_name: vendorMap.get(i.vendor_id) ?? null,
      invoice_date: i.invoice_date,
      due_date: i.due_date,
      paid_date: i.paid_date,
      invoice_amount: Number(i.invoice_amount ?? 0),
      paid_amount: Number(i.paid_amount ?? 0),
      outstanding_amount: Number(i.outstanding_amount ?? 0),
      overdue_amount: Number(i.overdue_amount ?? 0),
      overdue_days: Number(i.overdue_days ?? 0),
      status: i.status,
    }));

    const customerList = customers.map((c) => {
      const rows = arInvoices.filter((i) => i.customer_id === c.id);
      return {
        id: c.id,
        customer_name: c.customer_name,
        is_active: c.is_active,
        invoice_count: rows.length,
        total_outstanding: rows.reduce((t, r) => t + r.outstanding_amount, 0),
        total_overdue: rows.reduce((t, r) => t + r.overdue_amount, 0),
      };
    });

    const vendorList = vendors.map((v) => {
      const rows = apInvoices.filter((i) => i.vendor_id === v.id);
      return {
        id: v.id,
        vendor_name: v.vendor_name,
        is_active: v.is_active,
        invoice_count: rows.length,
        total_outstanding: rows.reduce((t, r) => t + r.outstanding_amount, 0),
        total_overdue: rows.reduce((t, r) => t + r.overdue_amount, 0),
      };
    });

    return json({
      generated_at: new Date().toISOString(),
      currency: "IDR",
      summary: {
        ar: summarize(ar as Array<Record<string, unknown>>),
        ap: summarize(ap as Array<Record<string, unknown>>),
        customer_count: customers.length,
        vendor_count: vendors.length,
        cash_total: cashPositions.reduce((t, c) => t + c.balance, 0),
      },
      cash_positions: cashPositions,
      customers: customerList,
      vendors: vendorList,
      ar_invoices: arInvoices,
      ap_invoices: apInvoices,
    });
  } catch (e) {
    console.error("kemi-export error", e);
    return json({ error: "Internal server error" }, 500);
  }
});
