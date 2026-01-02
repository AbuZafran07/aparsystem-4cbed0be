import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  role: 'PURCHASING' | 'FINANCE' | 'ADMIN';
}

interface UpdateUserPayload {
  userId: string;
  fullName?: string;
  role?: 'PURCHASING' | 'FINANCE' | 'ADMIN';
  isActive?: boolean;
}

interface DeleteUserPayload {
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get the authorization header to verify the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify they're SUPER_ADMIN
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is SUPER_ADMIN
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .single();

    if (callerRole?.role !== 'SUPER_ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Only SUPER_ADMIN can manage users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ...payload } = await req.json();
    console.log('Action:', action, 'Payload:', payload);

    switch (action) {
      case 'create': {
        const { email, password, fullName, role } = payload as CreateUserPayload;
        
        // Create auth user
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          console.error('Create user error:', createError);
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const userId = authData.user!.id;

        // Wait for trigger to create profile
        await new Promise(r => setTimeout(r, 300));

        // Assign role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: userId, role });

        if (roleError) {
          console.error('Assign role error:', roleError);
        }

        // Log audit
        await supabaseAdmin.from('audit_logs').insert({
          actor_id: callerUser.id,
          actor_role: 'SUPER_ADMIN',
          action: 'CREATE_USER',
          entity_type: 'USER',
          entity_id: userId,
          is_super_admin_action: true,
          after_data: { email, fullName, role },
        });

        return new Response(
          JSON.stringify({ success: true, userId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        const { userId, fullName, role, isActive } = payload as UpdateUserPayload;

        // Get before data
        const { data: beforeProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        const { data: beforeRole } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .single();

        // Update profile if needed
        if (fullName !== undefined || isActive !== undefined) {
          const updates: Record<string, unknown> = {};
          if (fullName !== undefined) updates.full_name = fullName;
          if (isActive !== undefined) updates.is_active = isActive;

          await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('user_id', userId);
        }

        // Update role if needed
        if (role !== undefined) {
          await supabaseAdmin
            .from('user_roles')
            .update({ role })
            .eq('user_id', userId);
        }

        // Log audit
        await supabaseAdmin.from('audit_logs').insert({
          actor_id: callerUser.id,
          actor_role: 'SUPER_ADMIN',
          action: 'UPDATE_USER',
          entity_type: 'USER',
          entity_id: userId,
          is_super_admin_action: true,
          before_data: { ...beforeProfile, role: beforeRole?.role },
          after_data: { fullName, role, isActive },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        const { userId } = payload as DeleteUserPayload;

        // Get before data for audit
        const { data: beforeProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        // Delete auth user (cascades to profiles and roles)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        
        if (deleteError) {
          return new Response(
            JSON.stringify({ error: deleteError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log audit
        await supabaseAdmin.from('audit_logs').insert({
          actor_id: callerUser.id,
          actor_role: 'SUPER_ADMIN',
          action: 'DELETE_USER',
          entity_type: 'USER',
          entity_id: userId,
          is_super_admin_action: true,
          before_data: beforeProfile,
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
