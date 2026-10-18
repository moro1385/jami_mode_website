CREATE TABLE IF NOT EXISTS public.user_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    title text NOT NULL,
    body text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert messages" ON public.user_messages
    FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can view their own messages" ON public.user_messages
    FOR SELECT TO authenticated USING (
    auth.uid() = user_id
);

CREATE POLICY "Admins can view all messages" ON public.user_messages
    FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can mark their own messages as read" ON public.user_messages
    FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
) WITH CHECK (
    auth.uid() = user_id
);
