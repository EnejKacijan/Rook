# Workout Photo Timeline

## Storage model

Workout Photo Timeline reuses the existing `rook-workout-media` IndexedDB database. A completed workout keeps only its `photoId`; the original prepared photo blob remains stored once in the existing `photos` store.

The Timeline stores no additional thumbnails or duplicate photo blobs. It joins lightweight IndexedDB metadata with authoritative workout history at runtime. Photos whose workout no longer exists are not displayed.

## Rendering and memory

- Timeline ordering is newest first and grouped by calendar month and year.
- Only metadata is read for the complete collection.
- An `IntersectionObserver` loads blobs only for thumbnails within 240 px of the viewport.
- Images use lazy loading and asynchronous decoding.
- Every thumbnail and viewer object URL is represented by an idempotent lease and revoked when it leaves the loading window or unmounts.
- A thumbnail stays in an explicit loading state until image decoding completes, then resolves to either the photo or an unavailable state.

This keeps the number of decoded full-size sources bounded even when hundreds of photos exist. No EXIF data is shown or sent to analytics.

## Privacy and deletion

Photos remain local to the device and are never uploaded or cloud-processed by Timeline. The shared private workout-photo viewer is used from both History and Timeline.

Deleting a Timeline photo deletes the existing IndexedDB record and clears the workout's `photoId`. The completed workout and its History record remain intact.

## Backup and Restore

No backup schema change is required. Existing ROOK backups already include every referenced workout photo. Runtime QA covers backup, clean local state, restore, and Timeline reconstruction against the restored workout/photo relationship.
