import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SendBillingEmailRequest {
  ar_invoice_id: string;
  billing_letter_id?: string;
  to_email: string;
  cc_email?: string;
  subject: string;
  html_content: string;
  body_preview?: string;
}

interface ResendEmailPayload {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

// Validation helpers
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_CONTENT_LENGTH = 500000; // 500KB limit

function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function isValidUUID(uuid: string): boolean {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

async function sendEmailWithResend(payload: ResendEmailPayload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || "Failed to send email");
  }
  
  return data;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Send billing email function called");
  // corsHeaders already defined at top level

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("User authenticated:", user.id);

    const requestData: SendBillingEmailRequest = await req.json();
    console.log("Request data:", {
      ar_invoice_id: requestData.ar_invoice_id,
      to_email: requestData.to_email,
      subject: requestData.subject
    });

    // Validate required fields
    if (!requestData.ar_invoice_id || !requestData.to_email || !requestData.subject || !requestData.html_content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format for ar_invoice_id
    if (!isValidUUID(requestData.ar_invoice_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid invoice ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate billing_letter_id if provided
    if (requestData.billing_letter_id && !isValidUUID(requestData.billing_letter_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid billing letter ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    if (!isValidEmail(requestData.to_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid recipient email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate CC email if provided
    if (requestData.cc_email && !isValidEmail(requestData.cc_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid CC email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate subject length
    if (requestData.subject.length > MAX_SUBJECT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Subject must be ${MAX_SUBJECT_LENGTH} characters or less` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate HTML content length
    if (requestData.html_content.length > MAX_HTML_CONTENT_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Email content too large" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bind the message to an invoice the caller is allowed to see (RLS applies
    // because we use the caller's token) and to that invoice's own customer.
    const { data: invoice, error: invoiceError } = await supabase
      .from("ar_invoices")
      .select("id, customer_id, customers!inner(billing_email)")
      .eq("id", requestData.ar_invoice_id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found or not accessible" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company profile for sender info
    const { data: companyProfile } = await supabase
      .from("company_profile")
      .select("company_name, email")
      .limit(1)
      .single();

    const customerEmail = (invoice as any)?.customers?.billing_email as string | null;
    const normalize = (v?: string | null) => (v || "").trim().toLowerCase();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Customer has no billing email on record" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (normalize(requestData.to_email) !== normalize(customerEmail)) {
      return new Response(
        JSON.stringify({ error: "Recipient must match the customer billing email on record" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedCc = [customerEmail, companyProfile?.email, user.email].map(normalize).filter(Boolean);
    if (requestData.cc_email && !allowedCc.includes(normalize(requestData.cc_email))) {
      return new Response(
        JSON.stringify({ error: "CC address not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderName = companyProfile?.company_name || "AP/AR HUB";
    const fromEmail = "onboarding@resend.dev";

    console.log("Sending email from:", senderName);

    const toEmails = [requestData.to_email];
    const ccEmails = requestData.cc_email ? [requestData.cc_email] : undefined;

    let emailStatus: "SENT" | "FAILED" = "SENT";
    let errorMessage: string | null = null;
    let emailResponse = null;

    try {
      emailResponse = await sendEmailWithResend({
        from: `${senderName} <${fromEmail}>`,
        to: toEmails,
        cc: ccEmails,
        subject: requestData.subject,
        html: requestData.html_content,
      });
      console.log("Email response:", emailResponse);
    } catch (emailError: any) {
      emailStatus = "FAILED";
      errorMessage = emailError.message;
      console.error("Resend error:", emailError);
    }

    const { error: logError } = await supabase
      .from("billing_email_logs")
      .insert({
        ar_invoice_id: requestData.ar_invoice_id,
        billing_letter_id: requestData.billing_letter_id || null,
        to_email: requestData.to_email,
        cc_email: requestData.cc_email || null,
        subject: requestData.subject,
        body_preview: requestData.body_preview || null,
        status: emailStatus,
        error_message: errorMessage,
        sent_by: user.id,
      });

    if (logError) {
      console.error("Error logging email:", logError);
    }

    if (emailStatus === "FAILED") {
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully");
    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-billing-email function:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
