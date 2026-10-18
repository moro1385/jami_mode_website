-- Drop the existing SELECT policy on profiles (assuming it's named 'Users can view their own profile' or similar)
-- We use a DO block to safely drop it if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'Users can view their own profile'
    ) THEN
        DROP POLICY "Users can view their own profile" ON public.profiles;
    END IF;

    -- Try another common name just in case
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'Profiles are viewable by users who created them.'
    ) THEN
        DROP POLICY "Profiles are viewable by users who created them." ON public.profiles;
    END IF;
END
$$;

-- Create the new SELECT policy allowing Admins to see all, and users to see their own
CREATE POLICY "Admins can view all profiles, users can view own"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR
  public.has_role(auth.uid(), 'admin'::public.app_role)
);
