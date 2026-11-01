# Livre et chapitres publiés séparément

Status: accepted; chapter identity and storage are partially superseded by
[ADR 0006](0006-book-scoped-identities.md).

## Context

The curriculum was previously a single nested v1 document containing units and chapters.
That structure duplicated chapter ordering and required publishing the entire curriculum
to change one chapter. The application also grouped the chapter list by unit.

## Decision

- Split source files into `book.json` and `chapters/<chapterId>.json`, all using
  `schemaVersion: 2`. The manifest contains the explicit book id, title, and ordered
  chapter IDs. Chapter numbers are derived from that order and are not repeated in
  chapter files.
- The book title requires Basque (`eu`) and may include French (`fr`). All other displayed
  curriculum text remains bilingual.
- Keep globally unique chapter IDs because attempts reference a chapter by ID alone.
- Publish `books/{bookId}` with an ordered chapter summary and `chapters/{chapterId}` with
  `bookId`, derived `number`, content, and no `unitId`.
- Display the book's ordered chapter list without unit grouping. Chapter colors continue
  to use the chapter number; progress behavior is unchanged.
- Validate the entire book and every source chapter before any write. A complete import
  writes the book and its chapters in one atomic Firestore transaction, removes obsolete
  chapters belonging to that book, and removes legacy `units` documents. An invalid or
  missing source file prevents publication.
- A partial `--chapter` import validates the whole book, republishes its summary and only
  the selected chapters, and never deletes documents. Reject it if an unselected chapter is
  missing or its published number or title differs, so the summary and chapter views cannot
  diverge; select all affected chapters or publish the complete book instead.
- Check chapter ownership and partial-publication consistency inside the same transaction
  as the writes. Concurrent publications recheck these constraints rather than claiming the
  same chapter or leaving its summary out of sync.
- Reject v1 sources rather than maintaining a compatibility path. Each atomic publication
  is limited to 400 writes, including deletions; validation itself does not limit book size.
- Convert real curriculum content in its private repository, preserving existing chapter IDs
  without adding that content or the one-off migration script to this repository.

## Consequences

- Source editors can validate the manifest and chapter files independently using
  `tools/curriculum/book.schema.json` and `tools/curriculum/chapter.schema.json`.
- The validator remains responsible for cross-file references, uniqueness, ordering,
  objective coverage, and the complete set of chapter files.
- Firestore access rules allow Google-authenticated reads of `books` and `chapters`; client
  writes remain forbidden.
