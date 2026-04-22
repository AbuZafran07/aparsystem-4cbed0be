import { supabase } from "@/integrations/supabase/client";

export type SalesPulseEvent =
  | "approved"
  | "partial_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "revised";

export interface DispatchOptions {
  event_type: SalesPulseEvent;
  ar_invoice_id: string;
  reason?: string;
}

export interface DispatchResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

/**
 * Kirim event AR invoice ke SalesPulse via edge function.
 * Fail-soft: jika gagal, error dilog ke console & ke salespulse_webhook_log
 * tapi tidak melempar exception (agar tidak mengganggu flow utama).
 */
export async function dispatchSalesPulseEvent(
  opts: DispatchOptions,
): Promise<DispatchResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "salespulse-dispatch",
      { body: opts },
    );
    if (error) {
      console.error("[SalesPulse] dispatch error:", error);
      return { ok: false, error: error.message };
    }
    if (data && typeof data === "object" && "ok" in data) {
      return data as DispatchResult;
    }
    return { ok: true, body: data };
  } catch (err) {
    console.error("[SalesPulse] dispatch exception:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown",
    };
  }
}
