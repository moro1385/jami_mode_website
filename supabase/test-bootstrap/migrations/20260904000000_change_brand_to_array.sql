ALTER TABLE public.products
ALTER COLUMN brand TYPE text[] USING string_to_array(brand, ',');
