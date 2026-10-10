# Runtime Wish: execution recovery boundaries

Partial-write crash safety is deferred. The current conditional writer validates the preimage on its open handle, then writes, truncates and syncs in place. A process/OS failure during mutation can leave partial content. It is not an OS-wide compare-and-swap.

A future runtime design must address atomic replacement, concurrent external writers, encoding/metadata preservation, durable recovery and platform-specific guarantees. Neither a missing receipt nor an unknown outcome authorizes repeating a write.

The receipt outbox preserves completed operation results before network submission. A crash before the result is journaled remains unknown. Reconciliation retains the original attribution and connection epoch; fenced or already-settled results remain retained for explicit review rather than bypassing receipt validation.

Verification recovery is explicitly read-only, requires a committed verified write receipt and fresh authorization, and does not reset or consume another permit. Interrupted preparation and unknown write outcomes remain review-only. Historical execution reads are bounded to 128 retained revisions and fail explicitly when unavailable.
