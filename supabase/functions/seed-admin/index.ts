import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPER_ADMIN_EMAIL = 'ferry@kemika.co.id';
const SUPER_ADMIN_PASSWORD = 'Ksatria2312';
const SUPER_ADMIN_NAME = 'Ferry Kemika';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting seed-admin function...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if super admin already exists in profiles
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id')
      .eq('email', SUPER_ADMIN_EMAIL)
      .single();

    if (existingProfile) {
      console.log('Super admin already exists:', existingProfile);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Super admin already exists',
          seeded: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating super admin user...');
    
    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: SUPER_ADMIN_NAME,
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      throw authError;
    }

    console.log('Auth user created:', authData.user?.id);

    const userId = authData.user!.id;

    // The trigger should create the profile, but let's verify and update if needed
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if profile was created by trigger
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      console.log('Profile not created by trigger, creating manually...');
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: userId,
          email: SUPER_ADMIN_EMAIL,
          full_name: SUPER_ADMIN_NAME,
          is_active: true,
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        throw profileError;
      }
    }

    // Assign SUPER_ADMIN role
    console.log('Assigning SUPER_ADMIN role...');
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'SUPER_ADMIN',
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      throw roleError;
    }

    // Log this action in audit logs
    console.log('Logging seed action...');
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        actor_id: userId,
        actor_role: 'SUPER_ADMIN',
        action: 'SEED_SUPER_ADMIN',
        entity_type: 'USER',
        entity_id: userId,
        is_super_admin_action: true,
        after_data: {
          email: SUPER_ADMIN_EMAIL,
          full_name: SUPER_ADMIN_NAME,
          role: 'SUPER_ADMIN',
        },
        reason: 'Initial super admin seed',
      });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
      // Don't throw, audit log is not critical
    }

    console.log('Super admin seeded successfully!');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Super admin seeded successfully',
        seeded: true,
        userId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Seed admin error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
