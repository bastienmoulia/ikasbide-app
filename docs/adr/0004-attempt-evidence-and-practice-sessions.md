# Attempt evidence and practice sessions

Each corrected Item is stored as an immutable attempt in `learners/{uid}/attempts/{attemptId}` with only `chapterId` and `itemId` (Item ids are unique per chapter), `outcome`, `occurredAt` and `sessionId`; the submitted answer is never kept. Security rules allow only the owning Google account to read and create them; an update is accepted only when it is identical, so a write resent after a lost acknowledgement succeeds without becoming a second piece of evidence, while deletion and changes are refused.

Writes go through Firestore's persistent cache (see [ADR 0003](0003-device-cache-for-offline-reading.md)) rather than a custom queue: offline attempts survive reloads, are kept per account, and are sent on reconnection. The client-generated document id is the synchronization identifier, so retries never duplicate evidence. Attempts queued by one account stay on the device until that account signs in online again.

A practice session is one visit to a sequence page: a random id is created when the sequence is opened and replaced on reload or when navigating to another sequence. Re-answering an Item within a visit therefore shares a session id, while practising it on another visit or device does not. This simple, observable boundary is what the "two distinct practice sessions" mastery criterion counts; time-based windows were rejected as harder to test and to explain.

Detailed practice state is cached locally per learner, chapter and sequence so a current answer
and feedback can survive a reload on that browser. The current submitted answer may remain in
that local cache while feedback is visible; submitted answers are never written to Firestore.
Attempt evidence retains only the item, outcome, date and session identifiers.

The sequence journey interleaves complete readings and corrected Items in curriculum order.
The account-scoped `learners/{uid}/sequenceProgress/{chapterId}--{sequenceId}` document stores
only visited step identifiers, successful and incorrect item identifiers, and skipped step
identifiers. Firestore array unions merge progress from multiple devices without overwriting
successes; the next unvisited step is the resume point. Incorrect answers and skipped Items do
not block the rest of the sequence and are not automatically repeated. Readings and oral prompts
remain non-graded. Reviewing an earlier Item shows its prompt without replaying a response or
creating new attempt evidence. Legacy local saves are migrated into the current state and synced
without uploading answer text.
