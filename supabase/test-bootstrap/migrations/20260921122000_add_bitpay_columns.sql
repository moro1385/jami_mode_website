ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_trans_id text UNIQUE;
