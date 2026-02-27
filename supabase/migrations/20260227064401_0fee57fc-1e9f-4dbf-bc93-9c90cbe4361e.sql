
-- Create generic invoice_comments table for both AR and AP
CREATE TABLE public.invoice_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ar_invoice', 'ap_invoice')),
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can read invoice comments"
  ON public.invoice_comments FOR SELECT
  USING (
    has_role(auth.uid(), 'FINANCE'::user_role) OR
    has_role(auth.uid(), 'PURCHASING'::user_role) OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

CREATE POLICY "Authenticated users can insert invoice comments"
  ON public.invoice_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments or admin"
  ON public.invoice_comments FOR DELETE
  USING (
    auth.uid() = user_id OR
    has_role(auth.uid(), 'ADMIN'::user_role) OR
    has_role(auth.uid(), 'SUPER_ADMIN'::user_role)
  );

-- Index for fast lookups
CREATE INDEX idx_invoice_comments_entity ON public.invoice_comments(entity_type, entity_id);
