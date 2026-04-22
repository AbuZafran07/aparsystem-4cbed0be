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
  wms_id: z.string().trim().max(100).optional(),
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

const SalesOrderSchema = z.object({
  customer_name: z.string().trim().min(1).max(255),
  customer_address: z.string().trim().max(500).nullable().optional(),
  customer_phone: z.string().trim().max(50).nullable().optional(),
  customer_billing_email: z.string().trim().email().max(255).nullable().optional(),
  order_number: z.string().trim().min(1).max(100),
  customer_po_number: z.string().trim().max(100).nullable().optional(),
  invoice_number: z.string().trim().min(1).max(100),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  sp_po_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  invoice_amount: z.number().positive("Invoice amount must be positive"),
  sales_name: z.string().trim().max(255).nullable().optional(),
  payment_terms_name: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  wms_id: z.string().trim().max(100).optional(),
  created_by_email: z.string().trim().email().max(255).optional(),
  created_by_name: z.string().trim().max(255).optional(),
});

const PlanOrderSchema = z.object({
  vendor_name: z.string().trim().min(1).max(255),
  vendor_address: z.string().trim().max(500).nullable().optional(),
  vendor_phone: z.string().trim().max(50).nullable().optional(),
  vendor_email: z.string().trim().email().max(255).nullable().optional(),
  vendor_bank_name: z.string().trim().max(100).nullable().optional(),
  vendor_bank_account_no: z.string().trim().max(50).nullable().optional(),
  po_number: z.string().trim().min(1).max(100),
  vendor_invoice_number: z.string().trim().min(1).max(100),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  sp_po_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  invoice_amount: z.number().positive("Invoice amount must be positive"),
  product_name: z.string().trim().max(255).nullable().optional(),
  payment_terms_name: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  wms_id: z.string().trim().max(100).optional(),
  created_by_email: z.string().trim().email().max(255).optional(),
  created_by_name: z.string().trim().max(255).optional(),
});

const SyncRequestSchema = z.object({
  entity: z.enum(["customer", "vendor", "sales_order", "plan_order"]),
  action: z.enum(["upsert", "sync_batch"]),
  data: z.any(),
}).refine((val) => {
  // Validate data matches entity schema
  const schemaMap: Record<string, z.ZodSchema> = {
    customer: z.union([CustomerSchema, z.array(CustomerSchema)]),
    vendor: z.union([VendorSchema, z.array(VendorSchema)]),
    sales_order: z.union([SalesOrderSchema, z.array(SalesOrderSchema)]),
    plan_order: z.union([PlanOrderSchema, z.array(PlanOrderSchema)]),
  };
  const schema = schemaMap[val.entity];
  return schema ? schema.safeParse(val.data).success : false;
}, {
  message: "Data does not match expected schema for the given entity",
  path: ["data"],
});

// Helper: calculate due date based on payment terms days
function calculateDueDate(invoiceDate: string, days: number): string {
  const date = new Date(invoiceDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Helper: resolve WMS user to system user by email or name
async function resolveCreator(
  supabase: any,
  email?: string,
  name?: string,
  fallbackId?: string
): Promise<string> {
  // Try by email first (most reliable)
  if (email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();
    if (profile) {
      console.log(`Resolved creator by email "${email}" -> ${profile.user_id}`);
      return profile.user_id;
    }
  }

  // Try by full_name (case-insensitive)
  if (name) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("full_name", name)
      .eq("is_active", true)
      .maybeSingle();
    if (profile) {
      console.log(`Resolved creator by name "${name}" -> ${profile.user_id}`);
      return profile.user_id;
    }
  }

  console.log(`Creator not resolved (email: ${email}, name: ${name}), using fallback`);
  return fallbackId || "00000000-0000-0000-0000-000000000000";
}

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

    // Use dedicated WMS System service account as default creator
    // This ensures invoices created via WMS are clearly marked as system-generated
    const WMS_SYSTEM_USER_ID = "5c2d93f2-d564-46ba-9a2c-66e028788147";
    const systemActorId = WMS_SYSTEM_USER_ID;

    const items = Array.isArray(data) ? data : [data];
    const results: { success: number; failed: number; errors: string[]; synced_ids: string[]; created_invoices?: string[] } = {
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

          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("customer_name", dbData.customer_name)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from("customers")
              .update({ ...dbData, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
            results.synced_ids.push(existing.id);
          } else {
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
    } else if (entity === "sales_order") {
      results.created_invoices = [];

      for (const item of items) {
        try {
          const soData = SalesOrderSchema.parse(item);

          // 1. Find or auto-create customer
          let { data: customer } = await supabase
            .from("customers")
            .select("id, customer_name")
            .eq("customer_name", soData.customer_name)
            .eq("is_active", true)
            .maybeSingle();

          if (!customer) {
            // Auto-create customer
            const { data: newCustomer, error: custErr } = await supabase
              .from("customers")
              .insert({
                customer_name: soData.customer_name,
                address: soData.customer_address || null,
                phone: soData.customer_phone || null,
                billing_email: soData.customer_billing_email || null,
                is_active: true,
              })
              .select("id, customer_name")
              .single();
            if (custErr) throw new Error(`Failed to auto-create customer "${soData.customer_name}": ${custErr.message}`);
            customer = newCustomer;
            console.log(`Auto-created customer: ${soData.customer_name}`);
          }

          // 2. Check duplicate invoice_number
          const { data: existingInvoice } = await supabase
            .from("ar_invoices")
            .select("id, invoice_number")
            .eq("invoice_number", soData.invoice_number)
            .maybeSingle();

          if (existingInvoice) {
            throw new Error(`Invoice "${soData.invoice_number}" already exists (ID: ${existingInvoice.id})`);
          }

          // 3. Resolve sales person (optional)
          let salesId: string | null = null;
          if (soData.sales_name) {
            const { data: sales } = await supabase
              .from("sales")
              .select("id")
              .eq("sales_name", soData.sales_name)
              .eq("is_active", true)
              .maybeSingle();
            salesId = sales?.id || null;
          }

          // 4. Resolve payment terms & calculate due date
          let termsId: string | null = null;
          let termsDays = 0;

          if (soData.payment_terms_name) {
            const { data: terms } = await supabase
              .from("payment_terms")
              .select("id, days")
              .eq("terms_name", soData.payment_terms_name)
              .eq("is_active", true)
              .maybeSingle();

            if (terms) {
              termsId = terms.id;
              termsDays = terms.days;
            }
          }

          // If no terms specified, try to get a default (first active)
          if (!termsId) {
            const { data: defaultTerms } = await supabase
              .from("payment_terms")
              .select("id, days")
              .eq("is_active", true)
              .order("days", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (defaultTerms) {
              termsId = defaultTerms.id;
              termsDays = defaultTerms.days;
            }
          }

          const dueDate = calculateDueDate(soData.invoice_date, termsDays);

          // 5. Resolve creator from WMS payload or fallback to system actor
          console.log(`[WMS] sales_order creator fields - email: "${soData.created_by_email || 'NOT SET'}", name: "${soData.created_by_name || 'NOT SET'}"`);
          const creatorId = await resolveCreator(supabase, soData.created_by_email, soData.created_by_name, systemActorId);
          console.log(`[WMS] Resolved creatorId: ${creatorId} (systemActorId fallback: ${systemActorId})`);

          // Use customer_po_number as order_number if provided, otherwise fall back to order_number
          // Always store the WMS SO number separately as wms_so_number for SalesPulse matching
          const effectiveOrderNumber = soData.customer_po_number || soData.order_number;

          const { data: newInvoice, error: insertError } = await supabase
            .from("ar_invoices")
            .insert({
              customer_id: customer.id,
              order_number: effectiveOrderNumber,
              wms_so_number: soData.order_number,
              invoice_number: soData.invoice_number,
              invoice_date: soData.invoice_date,
              sp_po_date: soData.sp_po_date,
              invoice_amount: soData.invoice_amount,
              outstanding_amount: soData.invoice_amount,
              due_date: dueDate,
              status: "DRAFT",
              created_by: creatorId,
              sales_id: salesId,
              terms_id: termsId,
              notes: soData.notes || `Auto-created from WMS Sales Order`,
            })
            .select("id, invoice_number")
            .single();

          if (insertError) throw new Error(insertError.message);

          // Notify FINANCE, ADMIN, SUPER_ADMIN users about new AR invoice
          const { data: targetUsers } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["FINANCE", "ADMIN", "SUPER_ADMIN"]);

          if (targetUsers && targetUsers.length > 0) {
            const notifications = targetUsers.map((u: any) => ({
              user_id: u.user_id,
              title: "Invoice AR Baru dari WMS",
              message: `Invoice AR ${newInvoice.invoice_number} untuk ${customer!.customer_name} senilai ${soData.invoice_amount.toLocaleString('id-ID')} telah dibuat otomatis dari WMS.`,
              type: "wms_sync",
              entity_type: "ar_invoice",
              entity_id: newInvoice.id,
            }));
            await supabase.from("notifications").insert(notifications);
          }

          results.synced_ids.push(newInvoice.id);
          results.created_invoices!.push(newInvoice.invoice_number);
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push(`Sales Order "${(item as any).order_number || (item as any).invoice_number}": ${e.message}`);
        }
      }
    } else if (entity === "plan_order") {
      results.created_invoices = [];

      for (const item of items) {
        try {
          const poData = PlanOrderSchema.parse(item);

          // 1. Find or auto-create vendor
          let { data: vendor } = await supabase
            .from("vendors")
            .select("id, vendor_name")
            .eq("vendor_name", poData.vendor_name)
            .eq("is_active", true)
            .maybeSingle();

          if (!vendor) {
            const { data: newVendor, error: vendErr } = await supabase
              .from("vendors")
              .insert({
                vendor_name: poData.vendor_name,
                address: poData.vendor_address || null,
                phone: poData.vendor_phone || null,
                email: poData.vendor_email || null,
                bank_name: poData.vendor_bank_name || null,
                bank_account_no: poData.vendor_bank_account_no || null,
                is_active: true,
              })
              .select("id, vendor_name")
              .single();
            if (vendErr) throw new Error(`Failed to auto-create vendor "${poData.vendor_name}": ${vendErr.message}`);
            vendor = newVendor;
            console.log(`Auto-created vendor: ${poData.vendor_name}`);
          }

          // 2. Check duplicate vendor_invoice_number for this vendor
          const { data: existingInvoice } = await supabase
            .from("ap_invoices")
            .select("id, vendor_invoice_number")
            .eq("vendor_invoice_number", poData.vendor_invoice_number)
            .eq("vendor_id", vendor.id)
            .maybeSingle();

          if (existingInvoice) {
            throw new Error(`AP Invoice "${poData.vendor_invoice_number}" already exists for vendor "${poData.vendor_name}" (ID: ${existingInvoice.id})`);
          }

          // 3. Resolve payment terms & calculate due date
          let termsId: string | null = null;
          let termsDays = 0;

          if (poData.payment_terms_name) {
            const { data: terms } = await supabase
              .from("payment_terms")
              .select("id, days")
              .eq("terms_name", poData.payment_terms_name)
              .eq("is_active", true)
              .maybeSingle();

            if (terms) {
              termsId = terms.id;
              termsDays = terms.days;
            }
          }

          // Fallback to default payment terms
          if (!termsId) {
            const { data: defaultTerms } = await supabase
              .from("payment_terms")
              .select("id, days")
              .eq("is_active", true)
              .order("days", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (defaultTerms) {
              termsId = defaultTerms.id;
              termsDays = defaultTerms.days;
            }
          }

          const dueDate = calculateDueDate(poData.invoice_date, termsDays);

          // 4. Resolve creator from WMS payload or fallback to system actor
          console.log(`[WMS] plan_order creator fields - email: "${poData.created_by_email || 'NOT SET'}", name: "${poData.created_by_name || 'NOT SET'}"`);
          const creatorId = await resolveCreator(supabase, poData.created_by_email, poData.created_by_name, systemActorId);
          console.log(`[WMS] Resolved creatorId: ${creatorId} (systemActorId fallback: ${systemActorId})`);

          // Create AP Invoice as DRAFT
          const { data: newInvoice, error: insertError } = await supabase
            .from("ap_invoices")
            .insert({
              vendor_id: vendor.id,
              po_number: poData.po_number,
              vendor_invoice_number: poData.vendor_invoice_number,
              invoice_date: poData.invoice_date,
              sp_po_date: poData.sp_po_date,
              invoice_amount: poData.invoice_amount,
              outstanding_amount: poData.invoice_amount,
              due_date: dueDate,
              status: "DRAFT",
              created_by: creatorId,
              terms_id: termsId,
              product_name: poData.product_name || null,
              notes: poData.notes || `Auto-created from WMS Plan Order`,
            })
            .select("id, vendor_invoice_number")
            .single();

          if (insertError) throw new Error(insertError.message);

          // Notify PURCHASING, FINANCE, SUPER_ADMIN users about new AP invoice
          const { data: targetUsers } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["PURCHASING", "FINANCE", "SUPER_ADMIN"]);

          if (targetUsers && targetUsers.length > 0) {
            const notifications = targetUsers.map((u: any) => ({
              user_id: u.user_id,
              title: "Invoice AP Baru dari WMS",
              message: `Invoice AP ${newInvoice.vendor_invoice_number} dari ${vendor!.vendor_name} senilai ${poData.invoice_amount.toLocaleString('id-ID')} telah dibuat otomatis dari WMS.`,
              type: "wms_sync",
              entity_type: "ap_invoice",
              entity_id: newInvoice.id,
            }));
            await supabase.from("notifications").insert(notifications);
          }

          results.synced_ids.push(newInvoice.id);
          results.created_invoices!.push(newInvoice.vendor_invoice_number);
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push(`Plan Order "${(item as any).po_number || (item as any).vendor_invoice_number}": ${e.message}`);
        }
      }
    }

    // --- Audit Log ---
    await supabase.from("audit_logs").insert({
      action: `WMS_SYNC_${entity.toUpperCase()}`,
      actor_id: systemActorId,
      actor_role: "SUPER_ADMIN",
      entity_type: entity === "sales_order" ? "ar_invoice" : entity === "plan_order" ? "ap_invoice" : entity,
      after_data: {
        synced: results.success,
        failed: results.failed,
        total: items.length,
        ...(results.created_invoices ? { invoices_created: results.created_invoices } : {}),
      },
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
