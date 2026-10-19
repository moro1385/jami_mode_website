CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert a ticket" ON public.tickets
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view tickets" ON public.tickets
    FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update tickets" ON public.tickets
    FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
);
