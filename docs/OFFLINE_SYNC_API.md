# Offline synchronisation contract (Stage 4)

Written so the future PHP/MySQL backend can implement the same behaviour.

## Idempotent creates
`POST /api/v1/marketplace/listings`, `POST /api/v1/expert-requests/demo` and `POST /api/v1/farmer/questions`
accept an optional `Idempotency-Key` header (8–100 chars of `A-Za-z0-9._:-`; the phone sends a random UUID).

* First 2xx response is stored per `(actor, key)`; a repeat returns the same status and body plus `"replayed": true`
  and header `Idempotent-Replay: true`. Actor = signed-in user id, else the body's `ownerToken` / `requesterToken`.
* Non-2xx responses are not stored, so a corrected retry is allowed.
* Same key with a different endpoint → `422 IDEMPOTENCY_KEY_REUSED`.
* Storage: table `sync_operations(actor, op_key, kind, status_code, response_json, created_at)`, primary key
  `(actor, op_key)`, rows older than 30 days purged. MySQL equivalent: same columns, `PRIMARY KEY (actor, op_key)`.
* Requests without the header behave exactly as before.

## Phone numbers
When `Idempotency-Key` is present and `phoneConsent` is not true, the server stores no phone number (create) or clears it (update).

## Conflict detection on edits
`PATCH /api/v1/marketplace/listings/:id` accepts `baseUpdatedAt`. If it differs from the stored `updated_at` the server answers
`409 CONFLICT` and changes nothing. The client then offers "Keep my changes" (resend without `baseUpdatedAt`) or "Discard".

## Client queue (IndexedDB `agri-advisory-offline`)
Stores `drafts` (listings), `questions`, `syncQueue`. Statuses: Draft → Pending Sync → Published (or Sync Failed).
"Published" is only set after a 2xx response. Local records are never deleted by a failed sync.
Retry: network/5xx/429 back off 5 s × 2^n (max 5 min, 6 automatic attempts); 4xx/401/403/409 stop and show the reason.
Triggers: `online` event, tab visible, 15 s timer, manual Sync Now. Browser Background Sync is NOT used.
