# Offline and sync behavior

During an active workout, IndexedDB is the source of truth. A set is committed locally before any future cloud request, so a connection failure cannot discard a completed set.

The UI currently reports local saving only. Supabase synchronization is intentionally not claimed as complete: it is the next integration slice after project credentials and the SQL migration are applied.

The future outbox will record an immutable `client_mutation_id`, entity id, timestamp, retry state, and server acknowledgement. The first conflict policy will be record-level last-write-wins with an explicit conflict notice; set logs remain append-only and are not silently deduplicated without matching mutation IDs.
