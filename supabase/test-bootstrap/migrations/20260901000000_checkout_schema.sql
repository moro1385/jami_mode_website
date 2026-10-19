-- Add wallet balance to profiles
ALTER TABLE public.profiles
ADD COLUMN wallet_balance numeric(10,2) NOT NULL DEFAULT 0;

-- Adjust addresses table to match frontend type
ALTER TABLE public.addresses
RENAME COLUMN title TO label;
ALTER TABLE public.addresses
RENAME COLUMN address TO line1;
ALTER TABLE public.addresses
ADD COLUMN line2 text,
ADD COLUMN recipient text,
ADD COLUMN country text DEFAULT 'Iran';

-- Update addresses missing required fields
UPDATE public.addresses SET recipient = 'Self', country = 'Iran' WHERE recipient IS NULL;

-- Add checkout specific columns to orders
ALTER TABLE public.orders
ADD COLUMN shipping_cost numeric(10,2) NOT NULL DEFAULT 0,
ADD COLUMN shipping_method text,
ADD COLUMN payment_method text;
