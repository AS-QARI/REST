# Offline behavior

The app is local-only. IndexedDB is the single source of truth for equipment, workouts, and nutrition — a set is committed locally the moment it's logged, and nothing leaves the device.

There is no cloud sync, no outbox, and no backend. Data lives only on the device it was entered on.
