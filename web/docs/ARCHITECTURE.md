# REST architecture

REST has a mobile PWA frontend and a Supabase backend. The current delivered slice uses `app/storage.ts` as a clearly temporary IndexedDB repository; it is the local source of truth for an active workout and manual meal logging.

When Supabase is configured, `app/supabase.ts` authenticates the private owner. Cloud repositories will replace the local adapter behind the same equipment, workout, and nutrition boundaries. They must not be called directly from visual components.

No Firebase, service role key, or AI key exists in frontend code. There is deliberately no public signup, social data, gym/branch entity, rest timer, or meal-image AI in this slice.
