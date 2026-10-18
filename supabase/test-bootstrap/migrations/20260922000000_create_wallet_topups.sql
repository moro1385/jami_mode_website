CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment',
  payment_ref text,
  payment_trans_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own topups" ON public.wallet_topups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own topups" ON public.wallet_topups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all topups" ON public.wallet_topups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
