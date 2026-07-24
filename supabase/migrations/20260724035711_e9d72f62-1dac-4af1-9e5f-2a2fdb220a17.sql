
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, user_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM authenticated;
