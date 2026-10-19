-- psql variable is required; never run against an existing application database.
SELECT :'target_project' = 'cifhcrlmjnsxpkhyloen' AS correct_target \gset
\if :correct_target
\else
  \echo 'Refused: this bootstrap is only for jamimode-test.'
  \quit 3
\endif
DO $$ BEGIN
 IF to_regclass('public.products') IS NOT NULL OR to_regclass('public.profiles') IS NOT NULL
 OR to_regclass('public.orders') IS NOT NULL OR to_regnamespace('checkout_private') IS NOT NULL THEN
   RAISE EXCEPTION 'Fresh database required; do not resume or overwrite an existing bootstrap';
 END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
 OR to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
   RAISE EXCEPTION 'Hosted Supabase Auth and Storage prerequisites missing';
 END IF;
END $$;
