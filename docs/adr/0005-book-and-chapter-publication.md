# Livre et chapitres publiés séparément

Status: accepted

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
  writes the book and its chapters in one atomic Firestore batch, removes obsolete chapters
  belonging to that book, and removes legacy `units` documents. An invalid or missing
  source file prevents publication.
- Reject v1 sources rather than maintaining a compatibility path. The import is limited
  to 400 book and chapter documents; required deletions must also fit the atomic batch.
- Partial `--chapter` publication remains a separate follow-up: when implemented, it must
  still validate the whole book, republish the book document, and never delete documents.
  The #29 implementation supports only complete-book publication.
- Keep the conversion of real curriculum content outside this repository's implementation
  tranche. Preserve existing chapter IDs when that content is migrated.

## Consequences

- Source editors can validate the manifest and chapter files independently using
  `tools/curriculum/book.schema.json` and `tools/curriculum/chapter.schema.json`.
- The validator remains responsible for cross-file references, uniqueness, ordering,
  objective coverage, and the complete set of chapter files.
- Firestore access rules allow Google-authenticated reads of `books` and `chapters`; client
  writes remain forbidden.
