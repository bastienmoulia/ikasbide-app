# Attempt evidence and practice sessions

Each corrected Item is stored as an immutable attempt in `learners/{uid}/attempts/{attemptId}` with only `chapterId` and `itemId` (Item ids are unique per chapter), `outcome`, `occurredAt` and `sessionId`; the submitted answer is never kept. Security rules allow only the owning Google account to read and create them; an update is accepted only when it is identical, so a write resent after a lost acknowledgement succeeds without becoming a second piece of evidence, while deletion and changes are refused.

Writes go through Firestore's persistent cache (see [ADR 0003](0003-device-cache-for-offline-reading.md)) rather than a custom queue: offline attempts survive reloads, are kept per account, and are sent on reconnection. The client-generated document id is the synchronization identifier, so retries never duplicate evidence. Attempts queued by one account stay on the device until that account signs in online again.

A practice session is one visit to a sequence page: a random id is created when the sequence is opened and replaced on reload or when navigating to another sequence. Re-answering an Item within a visit therefore shares a session id, while practising it on another visit or device does not. This simple, observable boundary is what the "two distinct practice sessions" mastery criterion counts; time-based windows were rejected as harder to test and to explain.

An in-progress practice series is stored locally per learner, chapter and sequence so it can resume on the same browser, including offline. The local state may temporarily retain the current submitted answer while its feedback is still visible; advancing or restarting removes it. Submitted answers are never written to Firestore. Each locally retained feedback state also keeps its original attempt id, timestamp and practice-session id, so a response restored after reload can safely retry the same immutable Firestore write instead of creating duplicate evidence. A new response after returning to an Item is a new attempt in the current practice session.

The sequence journey now interleaves complete readings and corrected Items in curriculum
order. Local state also retains its remaining steps, visited step identifiers and an optional
read-only review position. Readings advance freely and never produce attempts or mastery
evidence; oral prompts and external links remain optional. Incorrect Items move to the end of
the remaining journey. Reviewing an earlier Item shows its prompt without replaying a response
or retaining past submitted answers. The current unsubmitted draft stays mounted while reviewing
within the page, but is not persisted on reload. Legacy item-only saves retain their queue and
feedback; previously untracked readings are inserted before their next pending Item, or at the
end if no later Item remains. Pending feedback is restored first, without creating a new attempt.
