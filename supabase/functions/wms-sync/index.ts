import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// --- Validation Schemas ---
const CustomerSchema = z.object({
  customer_name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  billing_email: z.string().trim().email().max(255).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  wms_id: z.string().trim().max(100).optional(), // optional WMS reference ID
});

const VendorSchema = z.object({
  vendor_name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  bank_name: z.string().trim().max(100).nullable().optional(),
  bank_account_no: z.string().trim().max(50).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  wms_id: z.string().trim().max(100).optional(),
});

const SyncRequestSchema = z.object({
  entity: z.enum(["customer", "vendor"]),
  action: z.enum(["upsert", "sync_batch"]),
  data: z.union([
    CustomerSchema,
    VendorSchema,
    z.array(CustomerSchema),
    z.array(VendorSchema),
  ]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- API Key Authentication ---
    const apiKey = req.headers.get("x-api-key");
    const WMS_API_KEY = Deno.env.get("WMS_API_KEY");

    if (!WMS_API_KEY) {
      console.error("WMS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "An internal error occurred" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey || apiKey !== WMS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse & Validate Request ---
    const body = await req.json();
    const parsed = SyncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { entity, action, data } = parsed.data;

    // --- Supabase Admin Client ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const items = Array.isArray(data) ? data : [data];
    const results: { success: number; failed: number; errors: string[]; synced_ids: string[] } = {
      success: 0,
      failed: 0,
      errors: [],
      synced_ids: [],
    };

    if (entity === "customer") {
      for (const item of items) {
        try {
          const customerData = CustomerSchema.parse(item);
          const { wms_id, ...dbData } = customerData;

          // Upsert by customer_name (check if exists)
          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("customer_name", dbData.customer_name)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { error } = await supabase
              .from("customers")
              .update({ ...dbData, updated_at: new Date().toISOString() })
              .eq("id", existing.id);

            if (error) throw new Error(error.message);
            results.synced_ids.push(existing.id);
          } else {
            // Insert new
            const { data: newRow, error } = await supabase
              .from("customers")
              .insert(dbData)
              .select("id")
              .single();

            if (error) throw new Error(error.message);
            results.synced_ids.push(newRow.id);
          }
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push(`Customer "${(item as any).customer_name}": ${e.message}`);
        }
      }
    } else if (entity === "vendor") {
      for (const item of items) {
        try {
          const vendorData = VendorSchema.parse(item);
          const { wms_id, ...dbData } = vendorData;

          const { data: existing } = await supabase
            .from("vendors")
            .select("id")
            .eq("vendor_name", dbData.vendor_name)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from("vendors")
              .update({ ...dbData, updated_at: new Date().toISOString() })
              .eq("id", existing.id);

            if (error) throw new Error(error.message);
            results.synced_ids.push(existing.id);
          } else {
            const { data: newRow, error } = await supabase
              .from("vendors")
              .insert(dbData)
              .select("id")
              .single();

            if (error) throw new Error(error.message);
            results.synced_ids.push(newRow.id);
          }
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push(`Vendor "${(item as any).vendor_name}": ${e.message}`);
        }
      }
    }

    // --- Audit Log ---
    await supabase.from("audit_logs").insert({
      action: `WMS_SYNC_${entity.toUpperCase()}`,
      actor_id: "00000000-0000-0000-0000-000000000000", // system actor
      actor_role: "SUPER_ADMIN",
      entity_type: entity,
      after_data: { synced: results.success, failed: results.failed, total: items.length },
      is_super_admin_action: true,
    });

    return new Response(
      JSON.stringify({
        message: `Sync completed: ${results.success} success, ${results.failed} failed`,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("WMS Sync error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
