# Supabase setup

1. In the selected Supabase project, open SQL Editor and run the migrations once, in order: `supabase/migrations/20260710_0001_rest_core.sql`, then `supabase/migrations/20260710_0002_owner_snapshots.sql`.
2. In Auth settings, keep email/password enabled, disable **Allow new users to sign up**, and disable email confirmation because the technical identity is not an inbox.
3. Create the one owner account in the Auth dashboard with the internal address `orez@rest.invalid`, the private password selected by the owner, and user metadata `username: OREZ`. The migration creates the matching profile automatically.
4. Copy `.env.example` to `.env` and add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` locally. Never put a `service_role` key in the browser or this file.
5. Confirm that the `equipment-media` bucket is private and that every RLS policy was created successfully. `owner_snapshots` mirrors the offline app state for the one signed-in owner; it is protected by RLS and is never readable with the publishable key alone.

The SQL migration is designed for a private single-owner application while retaining `owner_id` and RLS for future multi-user support.
