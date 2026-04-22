// Helper untuk mengirim event invoice AR ke SalesPulse.
// HARUS dipanggil dari edge function (server-side), JANGAN dari browser
// karena membawa SALESPULSE_WEBHOOK_KEY.

const SALESPULSE_ENDPOINT =
  "https://ggzttrxpkbpjbymrzpsg.supabase.co/functions/v1/apar-invoice-event";

export type SalesPulseEvent =
  | "approved"
  | "partial_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "revised";

export interface SalesPulsePayload {
  event_type: SalesPulseEvent;
  so_number: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_amount?: number;
  due_date?: string;
  paid_amount?: number;
  paid_date?: string;
  reason?: string;
  ar_url?: string;
}

export interface SalesPulseResponse {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

export async function sendToSalesPulse(
  payload: SalesPulsePayload,
): Promise<SalesPulseResponse> {
  const apiKey = Deno.env.get("SALESPULSE_WEBHOOK_KEY");
  if (!apiKey) {
    console.error("SALESPULSE_WEBHOOK_KEY belum dikonfigurasi");
    return {
      ok: false,
      status: 500,
      body: { error: "Missing API key" },
      error: "Missing API key",
    };
  }

  try {
    const res = await fetch(SALESPULSE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APAR-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("SalesPulse webhook returned non-2xx", res.status, body);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.error("SalesPulse webhook error:", err);
    return {
      ok: false,
      status: 0,
      body: { error: err instanceof Error ? err.message : "Unknown" },
      error: err instanceof Error ? err.message : "Unknown",
    };
  }
}

export async function sendWithRetry(
  payload: SalesPulsePayload,
): Promise<{ result: SalesPulseResponse; attempts: number }> {
  let attempts = 1;
  let result = await sendToSalesPulse(payload);
  if (!result.ok && (result.status === 0 || result.status >= 500)) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts = 2;
    result = await sendToSalesPulse(payload);
  }
  return { result, attempts };
}
