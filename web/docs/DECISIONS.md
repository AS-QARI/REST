# Product decisions

- Arabic RTL and dark athletic visual direction are first class.
- Primary navigation is Today, Workout, Nutrition, and Progress.
- Equipment is nested inside Workout; there is no multi-gym or branch support.
- Weight is stored and displayed in kilograms only for the MVP.
- A weight PR is a positive working-set weight above every earlier session for the same exercise; the first logged weight establishes a PR. Warm-ups and tied weights do not count. Historical PR flames stay on the session/day that earned them, and recalculate after edits or deletions across the full history, independent of visible date or muscle filters.
- Workout templates start empty. REST does not ship Push/Pull/Legs or other prebuilt plans.
- Rest timer and AI meal photos are intentionally deferred.
- Nutrition goals are user entered, not calculated automatically.
- There is no backend by design. The app is local-only (IndexedDB); login is username and password only, checked against a locally stored hash.
