CREATE TABLE IF NOT EXISTS public.return_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    order_id uuid NOT NULL REFERENCES public.orders(id),
    phone text NOT NULL,
    description text NOT NULL,
    image_urls text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    admin_note text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own return requests" ON public.return_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND EXISTS (
        SELECT 1 FROM public.orders WHERE orders.id = order_id AND orders.user_id = auth.uid()
    ));

CREATE POLICY "Users can view their own return requests" ON public.return_requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all return requests" ON public.return_requests
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update return requests" ON public.return_requests
    FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('return-request-images', 'return-request-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Return request images are viewable by everyone" ON storage.objects FOR SELECT USING (bucket_id = 'return-request-images');
CREATE POLICY "Authenticated users can upload return request images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'return-request-images');
CREATE POLICY "Admins can delete return request images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'return-request-images' AND public.has_role(auth.uid(), 'admin'));
