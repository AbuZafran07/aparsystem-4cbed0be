// Dispatcher untuk mengirim event AR invoice ke SalesPulse.
// Dipanggil dari frontend setelah aksi sukses (approve, payment, cancel, edit, dll).
// Mengambil data invoice dari DB, build payload, kirim ke SalesPulse, log hasilnya.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  sendWithRetry,
  type SalesPulseEvent,
  type SalesPulsePayload,
} from "../_shared/salespulseWebhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.object({
  event_type: z.enum([
    "approved",
    "partial_paid",
    "paid",
    "overdue",
    "cancelled",
    "revised",
  ]),
  ar_invoice_id: z.string().uuid(),
  reason: z.string().optional(),
});

const APP_BASE_URL =
  Deno.env.get("APP_BASE_URL") ?? "https://aparsystem.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller (must be logged-in user)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing Authorization header" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse(401, { error: "Invalid token" });
    }
    const userId = userData.user.id;

    // Only roles that can actually change AR invoices may emit AR events.
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["FINANCE", "ADMIN", "SUPER_ADMIN", "PURCHASING"])
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const body = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(400, {
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { event_type, ar_invoice_id, reason } = parsed.data;

    // Read the invoice AS THE CALLER so RLS decides what they may dispatch.
    // The service-role client is used only for the internal log insert.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: invoice, error: invErr } = await userClient
      .from("ar_invoices")
      .select(
        "id, invoice_number, invoice_date, due_date, invoice_amount, paid_amount, paid_date, status, wms_so_number, order_number",
      )
      .eq("id", ar_invoice_id)
      .maybeSingle();

    if (invErr || !invoice) {
      return jsonResponse(404, { error: "Invoice not found" });
    }


    // so_number resolution: prefer wms_so_number, fallback to order_number
    const soNumber = invoice.wms_so_number || invoice.order_number;
    if (!soNumber) {
      return jsonResponse(400, {
        error:
          "Invoice tidak punya wms_so_number — tidak bisa di-match ke SalesPulse",
      });
    }

    // Build payload per event_type
    const payload: SalesPulsePayload = {
      event_type: event_type as SalesPulseEvent,
      so_number: soNumber,
      ar_url: `${APP_BASE_URL}/ar/${invoice.id}`,
    };

    if (event_type !== "cancelled") {
      payload.invoice_number = invoice.invoice_number;
    }

    if (event_type === "approved" || event_type === "revised") {
      payload.invoice_date = invoice.invoice_date;
      payload.invoice_amount = Number(invoice.invoice_amount);
      payload.due_date = invoice.due_date;
    }

    if (event_type === "partial_paid") {
      payload.paid_amount = Number(invoice.paid_amount);
    }

    if (event_type === "paid") {
      payload.paid_date =
        invoice.paid_date ?? new Date().toISOString().slice(0, 10);
    }

    if (event_type === "overdue") {
      // Only invoice_number + so_number needed
    }

    if (event_type === "cancelled" && reason) {
      payload.reason = reason;
    }

    // Send with retry
    const { result, attempts } = await sendWithRetry(payload);

    // Log to webhook log table
    await admin.from("salespulse_webhook_log").insert({
      ar_invoice_id: invoice.id,
      event_type,
      so_number: soNumber,
      invoice_number: invoice.invoice_number,
      request_payload: payload,
      response_status: result.status,
      response_body: result.body as Record<string, unknown>,
      ok: result.ok,
      error_message: result.error ?? null,
      attempt: attempts,
      created_by: userId,
    });

    return jsonResponse(200, {
      ok: result.ok,
      status: result.status,
      body: result.body,
      attempts,
    });
  } catch (err) {
    console.error("salespulse-dispatch error:", err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
