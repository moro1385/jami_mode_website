-- Add title and snapshot details to order_items to capture the cart item properly
ALTER TABLE public.order_items
ADD COLUMN title text,
ADD COLUMN variant_title text,
ADD COLUMN image_url text;
