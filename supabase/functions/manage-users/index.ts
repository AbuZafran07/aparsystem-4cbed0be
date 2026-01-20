import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS - restrict to known frontend domains
const allowedOrigins = [
  'https://aparsystem.lovable.app',
  'https://id-preview--33a78b09-aa11-45a9-b298-7040a810eb4c.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
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

// Validation helpers
const VALID_ROLES = ['PURCHASING', 'FINANCE', 'ADMIN'] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;
const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function isValidUUID(uuid: string): boolean {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

function isValidRole(role: string): role is typeof VALID_ROLES[number] {
  return VALID_ROLES.includes(role as typeof VALID_ROLES[number]);
}

function isValidName(name: string): boolean {
  return typeof name === 'string' && name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH;
}

function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
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
        
        // Validate email format
        if (!isValidEmail(email)) {
          return new Response(
            JSON.stringify({ error: 'Invalid email format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate password
        if (!isValidPassword(password)) {
          return new Response(
            JSON.stringify({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate name
        if (!isValidName(fullName)) {
          return new Response(
            JSON.stringify({ error: `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate role
        if (!isValidRole(role)) {
          return new Response(
            JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Create auth user
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: email.trim(),
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName.trim() },
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
          after_data: { email: email.trim(), fullName: fullName.trim(), role },
        });

        return new Response(
          JSON.stringify({ success: true, userId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        const { userId, fullName, role, isActive } = payload as UpdateUserPayload;

        // Validate userId
        if (!isValidUUID(userId)) {
          return new Response(
            JSON.stringify({ error: 'Invalid user ID format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate name if provided
        if (fullName !== undefined && !isValidName(fullName)) {
          return new Response(
            JSON.stringify({ error: `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate role if provided
        if (role !== undefined && !isValidRole(role)) {
          return new Response(
            JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
          if (fullName !== undefined) updates.full_name = fullName.trim();
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
          after_data: { fullName: fullName?.trim(), role, isActive },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        const { userId } = payload as DeleteUserPayload;

        // Validate userId
        if (!isValidUUID(userId)) {
          return new Response(
            JSON.stringify({ error: 'Invalid user ID format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});