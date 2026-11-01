# Book-scoped chapter identity

Status: accepted

## Context

The original publication and learner-data layouts identified a chapter globally.
That prevented two books from using the same chapter ID, and chapter URLs did not
identify their book. Existing synchronized attempts and sequence progress must remain
available without guessing which book owns them.

## Decision

- Identify chapters within a book. Sequence and item IDs remain scoped to their
  existing chapter or sequence, so different books may reuse all of these identifiers.
- Use `/{bookId}/{chapterId}` and `/{bookId}/{chapterId}/{sequenceId}` for chapters
  and sequences. Old URLs are not retained. The only book summary remains `/`: it
  shows the current book when returning from a chapter or refreshing that summary.
  A new tab opening `/` starts with the configured default, `a1`. There is no book
  selector or `/{bookId}` summary route.
- Publish chapters at `books/{bookId}/chapters/{chapterId}` and keep the ordered
  summary at `books/{bookId}`. A chapter is accessible only when its book's summary
  lists it. Complete publication deletes stale chapters only within that book;
  partial publication still checks the consistency of unselected chapters.
- Freeze existing `chapters/{chapterId}` documents. Their `bookId` is the evidence
  of the original owner of synchronized data created before this change. A legacy
  chapter can also serve its original book until it is republished in the new
  location, provided the book summary still lists it. Do not run an older publisher
  that could overwrite or delete these ownership records.
- Include `bookId` in new immutable attempts. Store new sequence progress at
  `learners/{uid}/books/{bookId}/chapters/{chapterId}/sequenceProgress/{sequenceId}`.
  Read older attempts and progress for a book only when the frozen chapter proves
  that book owned them; merge legacy and new progress without deleting the former.
  Data with no provable owner stays stored separately and is not attributed.
- Use new book-scoped local practice keys. Previously synchronized evidence is
  recovered automatically, but old local-only practice state is not migrated.
  There is no compatibility window for old client writes: pending writes from an
  earlier version may be rejected after the new rules are deployed.

## Consequences

- Direct links can open chapters from any published book, including books that reuse
  chapter IDs. The default book is changed in application configuration and requires
  redeployment. If it is absent while other books exist, the summary shows an error.
- Legacy ownership documents must be retained for as long as old learner evidence
  is needed. A missing or ambiguous record is not repaired by assigning evidence to
  a guessed book.
- Publish with the updated tools and synchronize old clients before changing rules.
  After the transition, old offline writes are not accepted; opening previously
  cached content online again may be necessary before reading it offline.
