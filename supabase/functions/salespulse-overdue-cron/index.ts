// Cron-driven overdue detector. Dijalankan harian via pg_cron.
// Menemukan invoice AR dengan due_date < today, status bukan PAID/CANCELLED,
// outstanding > 0, dan belum pernah di-notify sebagai overdue.
// Untuk setiap invoice tersebut: kirim event "overdue" ke SalesPulse,
// catat ke salespulse_webhook_log, tandai di salespulse_overdue_notified.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  sendWithRetry,
  type SalesPulsePayload,
} from "../_shared/salespulseWebhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL =
  Deno.env.get("APP_BASE_URL") ?? "https://aparsystem.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().slice(0, 10);

    // Find candidate overdue invoices
    const { data: invoices, error } = await admin
      .from("ar_invoices")
      .select(
        "id, invoice_number, wms_so_number, order_number, outstanding_amount, due_date, status",
      )
      .lt("due_date", today)
      .gt("outstanding_amount", 0)
      .not("status", "in", "(PAID,CANCELLED)");

    if (error) throw new Error(error.message);

    // Filter out already-notified
    const ids = (invoices ?? []).map((i) => i.id);
    let alreadyNotified = new Set<string>();
    if (ids.length > 0) {
      const { data: notified } = await admin
        .from("salespulse_overdue_notified")
        .select("ar_invoice_id")
        .in("ar_invoice_id", ids);
      alreadyNotified = new Set((notified ?? []).map((n) => n.ar_invoice_id));
    }

    const targets = (invoices ?? []).filter((i) => !alreadyNotified.has(i.id));

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors: Array<{ invoice_id: string; error: string }> = [];

    for (const inv of targets) {
      const so = inv.wms_so_number || inv.order_number;
      if (!so) {
        skipped++;
        continue;
      }

      const payload: SalesPulsePayload = {
        event_type: "overdue",
        so_number: so,
        invoice_number: inv.invoice_number,
        ar_url: `${APP_BASE_URL}/ar/${inv.id}`,
      };

      const { result, attempts } = await sendWithRetry(payload);

      await admin.from("salespulse_webhook_log").insert({
        ar_invoice_id: inv.id,
        event_type: "overdue",
        so_number: so,
        invoice_number: inv.invoice_number,
        request_payload: payload,
        response_status: result.status,
        response_body: result.body as Record<string, unknown>,
        ok: result.ok,
        error_message: result.error ?? null,
        attempt: attempts,
      });

      if (result.ok) {
        await admin
          .from("salespulse_overdue_notified")
          .insert({ ar_invoice_id: inv.id });
        success++;
      } else {
        failed++;
        errors.push({
          invoice_id: inv.id,
          error: result.error ?? `HTTP ${result.status}`,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: invoices?.length ?? 0,
        already_notified: alreadyNotified.size,
        attempted: targets.length,
        success,
        failed,
        skipped,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("salespulse-overdue-cron error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
