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

const MAX_AUTO_BACKUPS = 4

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

async function verifySupAdmin(supabaseClient: any, authHeader: string): Promise<boolean> {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseClient.auth.getUser(token)
  if (error || !user) return false

  const adminClient = getAdminClient()
  const { data } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return data?.role === 'SUPER_ADMIN'
}

async function fetchAllTables(adminClient: any, tables: string[]) {
  const backupData: Record<string, any[]> = {}

  for (const table of tables) {
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

  return backupData
}

async function notifySuperAdmins(adminClient: any, title: string, message: string, type: string) {
  try {
    const { data: superAdmins } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'SUPER_ADMIN')

    if (superAdmins && superAdmins.length > 0) {
      const notifications = superAdmins.map((sa: any) => ({
        user_id: sa.user_id,
        title,
        message,
        type,
        entity_type: 'backup',
      }))
      await adminClient.from('notifications').insert(notifications)
    }
  } catch (e) {
    console.error('Failed to send notifications:', e)
  }
}

async function performAutoBackup() {
  const adminClient = getAdminClient()

  try {
    // Fetch all data
    const backupData = await fetchAllTables(adminClient, BACKUP_TABLES)

    const backup = {
      version: '1.0',
      created_at: new Date().toISOString(),
      app: 'AP/AR HUB Finance System',
      type: 'auto',
      tables: backupData,
      table_counts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, v.length])
      ),
    }

    const jsonString = JSON.stringify(backup)
    const encoder = new TextEncoder()
    const encoded = encoder.encode(jsonString)

    // Upload to storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filePath = `auto/backup-${timestamp}.json`

    const { error: uploadError } = await adminClient.storage
      .from('backups')
      .upload(filePath, encoded, {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    // Log success
    await adminClient.from('backup_logs').insert({
      backup_type: 'auto',
      file_path: filePath,
      file_size: encoded.byteLength,
      table_counts: backup.table_counts,
      status: 'SUCCESS',
    })

    // Notify Super Admins
    const totalRows = Object.values(backup.table_counts).reduce((a: number, b: number) => a + b, 0)
    const sizeMB = (encoded.byteLength / 1024 / 1024).toFixed(2)
    await notifySuperAdmins(
      adminClient,
      '✅ Auto Backup Berhasil',
      `Backup otomatis selesai: ${totalRows} baris data (${sizeMB} MB) tersimpan di cloud storage.`,
      'success'
    )

    // Cleanup old backups (keep only last MAX_AUTO_BACKUPS)
    const { data: logs } = await adminClient
      .from('backup_logs')
      .select('id, file_path')
      .eq('backup_type', 'auto')
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false })

    if (logs && logs.length > MAX_AUTO_BACKUPS) {
      const toDelete = logs.slice(MAX_AUTO_BACKUPS)
      for (const log of toDelete) {
        if (log.file_path) {
          await adminClient.storage.from('backups').remove([log.file_path])
        }
        await adminClient.from('backup_logs').delete().eq('id', log.id)
      }
    }

    return { success: true, file_path: filePath, size: encoded.byteLength }
  } catch (error: any) {
    // Log failure
    await adminClient.from('backup_logs').insert({
      backup_type: 'auto',
      status: 'FAILED',
      error_message: error.message || 'Unknown error',
    })

    // Notify Super Admins about failure
    await notifySuperAdmins(
      adminClient,
      '❌ Auto Backup Gagal',
      `Backup otomatis gagal. Silakan periksa halaman Backup & Restore untuk detail.`,
      'error'
    )

    throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // Auto backup: triggered by cron, uses anon key auth (no user session)
    if (action === 'auto-backup') {
      const result = await performAutoBackup()
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // All other actions require SUPER_ADMIN auth
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

    const adminClient = getAdminClient()

    if (action === 'backup') {
      const tablesParam = url.searchParams.get('tables')
      const selectedTables = tablesParam ? tablesParam.split(',') : BACKUP_TABLES

      const backupData = await fetchAllTables(adminClient, selectedTables)

      const backup = {
        version: '1.0',
        created_at: new Date().toISOString(),
        app: 'AP/AR HUB Finance System',
        type: 'manual',
        tables: backupData,
        table_counts: Object.fromEntries(
          Object.entries(backupData).map(([k, v]) => [k, v.length])
        ),
      }

      return new Response(JSON.stringify(backup), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'backup-history') {
      const { data, error } = await adminClient
        .from('backup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      return new Response(JSON.stringify({ logs: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'download-backup') {
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        return new Response(JSON.stringify({ error: 'Missing path parameter' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await adminClient.storage
        .from('backups')
        .createSignedUrl(filePath, 300) // 5 min expiry

      if (error) throw error

      return new Response(JSON.stringify({ url: data.signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete-backup') {
      const body = await req.json()
      const { id, file_path } = body

      if (file_path) {
        await adminClient.storage.from('backups').remove([file_path])
      }
      if (id) {
        await adminClient.from('backup_logs').delete().eq('id', id)
      }

      return new Response(JSON.stringify({ success: true }), {
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

      const restoreOrder = [
        'payment_terms', 'bank_accounts', 'vendors', 'customers', 'sales',
        'company_profile', 'profiles', 'user_roles',
        'ap_invoices', 'ar_invoices',
        'ap_payments', 'ap_payment_allocations',
        'ar_receipts', 'ar_receipt_allocations',
        'billing_letters', 'billing_letter_comments', 'billing_email_logs',
        'payment_requests', 'attachments', 'invoice_comments',
        'notifications', 'audit_logs', 'import_batches', 'import_row_errors',
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

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
