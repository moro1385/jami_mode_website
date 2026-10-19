ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_out_of_stock boolean NOT NULL DEFAULT false;
