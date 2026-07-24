
-- Trigger functions: no client should ever call these directly
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Server-side utility (called by triggers/server code only)
REVOKE EXECUTE ON FUNCTION public.generate_payment_request_no() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_payment_request_no() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_payment_request_no() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payment_request_no() TO service_role;

-- Role lookup helper: only signed-in users need this
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;
