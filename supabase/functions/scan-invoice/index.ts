import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_base64, type, mime_type } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isAR = type === "ar";

    const systemPrompt = `You are an invoice data extraction AI. Extract the following fields from the invoice image and return them using the tool provided. 
If a field is not found, return an empty string for text fields and 0 for numeric fields.
For dates, return in YYYY-MM-DD format.
For amounts, return as a number without currency symbols or thousand separators.
${isAR ? `
Extract these AR invoice fields:
- invoice_number: The invoice number
- order_number: The order/PO number from customer
- sp_po_date: The SP/PO date
- invoice_date: The invoice date
- invoice_amount: The total invoice amount
- notes: Any additional notes
` : `
Extract these AP invoice fields:
- vendor_invoice_number: The vendor's invoice number
- po_number: The PO number
- product_name: Product/service description
- sp_po_date: The SP/PO date
- invoice_date: The invoice date
- invoice_amount: The total invoice amount
- notes: Any additional notes
`}`;

    const extractFields = isAR
      ? {
          invoice_number: { type: "string" },
          order_number: { type: "string" },
          sp_po_date: { type: "string", description: "YYYY-MM-DD format" },
          invoice_date: { type: "string", description: "YYYY-MM-DD format" },
          invoice_amount: { type: "number" },
          notes: { type: "string" },
        }
      : {
          vendor_invoice_number: { type: "string" },
          po_number: { type: "string" },
          product_name: { type: "string" },
          sp_po_date: { type: "string", description: "YYYY-MM-DD format" },
          invoice_date: { type: "string", description: "YYYY-MM-DD format" },
          invoice_amount: { type: "number" },
          notes: { type: "string" },
        };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all invoice data from this image." },
              { type: "image_url", image_url: { url: `data:${mime_type || "image/jpeg"};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice_data",
              description: "Extract structured invoice data from the image",
              parameters: {
                type: "object",
                properties: extractFields,
                required: Object.keys(extractFields),
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No structured data extracted");
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted invoice data:", extracted);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-invoice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
