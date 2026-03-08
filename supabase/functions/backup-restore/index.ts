import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const BACKUP_TABLES = [
  'payment_terms',
  'bank_accounts',
  'vendors',
  'customers',
  'sales',
  'company_profile',
  'ap_invoices',
  'ar_invoices',
  'ap_payments',
  'ap_payment_allocations',
  'ar_receipts',
  'ar_receipt_allocations',
  'billing_letters',
  'billing_letter_comments',
  'billing_email_logs',
  'payment_requests',
  'attachments',
  'invoice_comments',
  'notifications',
  'audit_logs',
  'import_batches',
  'import_row_errors',
  'profiles',
  'user_roles',
]

async function verifySupAdmin(supabaseClient: any, authHeader: string): Promise<boolean> {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseClient.auth.getUser(token)
  if (error || !user) return false

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return data?.role === 'SUPER_ADMIN'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const isAdmin = await verifySupAdmin(supabaseClient, authHeader)
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: SUPER_ADMIN only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (action === 'backup') {
      const tablesParam = url.searchParams.get('tables')
      const selectedTables = tablesParam ? tablesParam.split(',') : BACKUP_TABLES

      const backupData: Record<string, any[]> = {}

      for (const table of selectedTables) {
        if (!BACKUP_TABLES.includes(table)) continue
        
        let allRows: any[] = []
        let from = 0
        const batchSize = 1000
        
        while (true) {
          const { data, error } = await adminClient
            .from(table)
            .select('*')
            .range(from, from + batchSize - 1)
          
          if (error) {
            console.error(`Error fetching ${table}:`, error.message)
            break
          }
          
          if (!data || data.length === 0) break
          allRows = allRows.concat(data)
          if (data.length < batchSize) break
          from += batchSize
        }
        
        backupData[table] = allRows
      }

      const backup = {
        version: '1.0',
        created_at: new Date().toISOString(),
        app: 'AP/AR HUB Finance System',
        tables: backupData,
        table_counts: Object.fromEntries(
          Object.entries(backupData).map(([k, v]) => [k, v.length])
        ),
      }

      return new Response(JSON.stringify(backup), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'restore') {
      const body = await req.json()
      const { tables } = body

      if (!tables || typeof tables !== 'object') {
        return new Response(JSON.stringify({ error: 'Invalid backup data' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Restore order: master data first, then transactions
      const restoreOrder = [
        'payment_terms',
        'bank_accounts',
        'vendors',
        'customers',
        'sales',
        'company_profile',
        'profiles',
        'user_roles',
        'ap_invoices',
        'ar_invoices',
        'ap_payments',
        'ap_payment_allocations',
        'ar_receipts',
        'ar_receipt_allocations',
        'billing_letters',
        'billing_letter_comments',
        'billing_email_logs',
        'payment_requests',
        'attachments',
        'invoice_comments',
        'notifications',
        'audit_logs',
        'import_batches',
        'import_row_errors',
      ]

      const results: Record<string, { success: number; failed: number; error?: string }> = {}

      for (const table of restoreOrder) {
        if (!tables[table] || !Array.isArray(tables[table]) || tables[table].length === 0) continue

        try {
          const batchSize = 500
          let success = 0
          let failed = 0

          for (let i = 0; i < tables[table].length; i += batchSize) {
            const batch = tables[table].slice(i, i + batchSize)
            const { error } = await adminClient
              .from(table)
              .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })

            if (error) {
              console.error(`Restore error on ${table}:`, error.message)
              failed += batch.length
            } else {
              success += batch.length
            }
          }

          results[table] = { success, failed }
        } catch (e) {
          results[table] = { success: 0, failed: tables[table].length, error: 'An internal error occurred' }
        }
      }

      return new Response(JSON.stringify({ message: 'Restore completed', results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use ?action=backup or ?action=restore' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
