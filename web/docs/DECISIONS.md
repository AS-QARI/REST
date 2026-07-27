# Product decisions

- Arabic RTL and dark athletic visual direction are first class.
- Primary navigation is Today, Workout, Nutrition, and Progress.
- Equipment is nested inside Workout; there is no multi-gym or branch support.
- Weight is stored and displayed in kilograms only for the MVP.
- Workout templates start empty. REST does not ship Push/Pull/Legs or other prebuilt plans.
- Rest timer and AI meal photos are intentionally deferred.
- Nutrition goals are user entered, not calculated automatically.
- Supabase is the intended backend. The visible login is username and password only; Supabase uses a non-visible technical identity under the hood.
