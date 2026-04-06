import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const wmsApiKey = Deno.env.get('WMS_API_KEY')!;

    // Test plan_order payload
    const testPayload = {
      entity: "plan_order",
      action: "upsert",
      data: {
        vendor_name: "PT Test Vendor WMS Auto",
        vendor_invoice_number: "TEST-WMS-" + Date.now(),
        po_number: "PO/TEST/001",
        sp_po_date: "2026-04-06",
        invoice_date: "2026-04-06",
        invoice_amount: 5000000,
        payment_terms: "NET 30",
        product_name: "Test Product dari WMS",
        address: "Jl. Test Alamat No. 1, Jakarta",
        phone: "08123456789",
        email: "vendor-test@wms.com",
        bank_name: "BCA",
        bank_account_no: "1234567890"
      }
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/wms-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': wmsApiKey,
      },
      body: JSON.stringify(testPayload),
    });

    const responseBody = await response.text();

    return new Response(JSON.stringify({
      test: "plan_order sync",
      status: response.status,
      payload_sent: testPayload,
      response: JSON.parse(responseBody),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
