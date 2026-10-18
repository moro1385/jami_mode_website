ALTER TABLE public.products ADD COLUMN department text;
ALTER TABLE public.products ADD COLUMN category text;
ALTER TABLE public.products ADD COLUMN type text;
ALTER TABLE public.products ADD COLUMN brand text;
ALTER TABLE public.products ADD COLUMN pattern text;
ALTER TABLE public.products ADD COLUMN sizes text[] DEFAULT '{}'::text[];
