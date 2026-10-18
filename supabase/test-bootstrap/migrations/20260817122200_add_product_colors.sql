ALTER TABLE public.products ADD COLUMN colors text[] DEFAULT '{}'::text[];

-- Migrate type from text to text[] for multiselect
ALTER TABLE public.products ALTER COLUMN type TYPE text[] USING string_to_array(type, ',');
