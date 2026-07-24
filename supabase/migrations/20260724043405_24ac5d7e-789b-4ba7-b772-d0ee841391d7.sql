-- Convert has_role & get_user_role to SECURITY INVOKER (RLS on user_roles allows users to read their own rows, and both functions filter by _user_id which is always auth.uid())
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Explicit SELECT policies for public storage buckets so read access is intentional & auditable
DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public read access for company logos" ON storage.objects;
CREATE POLICY "Public read access for company logos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'company-logos');