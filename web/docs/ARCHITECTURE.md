# REST architecture

REST is a local-only mobile PWA. `app/storage.ts` is an IndexedDB repository that is the single source of truth for equipment, workouts, and manual meal logging — there is no backend and no cloud sync.

`app/auth.ts` authenticates the private owner against a locally stored password hash. It must not be called directly from visual components.

No Firebase, Supabase, service role key, or AI key exists in frontend code. There is deliberately no public signup, social data, gym/branch entity, rest timer, or meal-image AI in this slice.
