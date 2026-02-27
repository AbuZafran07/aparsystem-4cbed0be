
-- Create billing letter comments table for collection activity tracking
CREATE TABLE public.billing_letter_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_letter_id UUID NOT NULL REFERENCES public.billing_letters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_letter_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Finance can manage billing letter comments"
ON public.billing_letter_comments
FOR ALL
USING (has_role(auth.uid(), 'FINANCE'::user_role) OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

CREATE POLICY "Role-based billing_letter_comments read access"
ON public.billing_letter_comments
FOR SELECT
USING (has_role(auth.uid(), 'FINANCE'::user_role) OR has_role(auth.uid(), 'ADMIN'::user_role) OR has_role(auth.uid(), 'SUPER_ADMIN'::user_role));

CREATE POLICY "Authenticated users can insert comments"
ON public.billing_letter_comments
FOR INSERT
WITH CHECK (auth.uid() = user_id);
