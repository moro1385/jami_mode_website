ALTER TABLE public.products ADD COLUMN tags text[] DEFAULT '{}'::text[];
