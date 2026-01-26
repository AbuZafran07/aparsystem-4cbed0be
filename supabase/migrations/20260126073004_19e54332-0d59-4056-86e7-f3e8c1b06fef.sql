-- Fix SECURITY DEFINER function to include role validation
-- This prevents unauthorized users from generating payment request numbers

CREATE OR REPLACE FUNCTION public.generate_payment_request_no()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_prefix TEXT;
  last_number INTEGER;
  new_number TEXT;
BEGIN
  -- Security check: Only PURCHASING and SUPER_ADMIN can generate payment request numbers
  IF NOT (has_role(auth.uid(), 'PURCHASING'::user_role) OR 
          has_role(auth.uid(), 'SUPER_ADMIN'::user_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Only PURCHASING and SUPER_ADMIN can generate payment request numbers';
  END IF;

  -- Format: PR-YYYYMM-XXXX
  current_prefix := 'PR-' || to_char(CURRENT_DATE, 'YYYYMM') || '-';
  
  -- Get the last number for current month
  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(request_no, '^PR-\d{6}-', ''),
        ''
      )::INTEGER
    ),
    0
  )
  INTO last_number
  FROM public.payment_requests
  WHERE request_no LIKE current_prefix || '%';
  
  -- Generate new number
  new_number := current_prefix || LPAD((last_number + 1)::TEXT, 4, '0');
  
  RETURN new_number;
END;
$function$;