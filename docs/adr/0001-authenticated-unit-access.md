# Authenticated access to unit content

Status: accepted; the content structure is superseded by
[ADR 0005](0005-book-and-chapter-publication.md).

Unit content in Firestore is readable by any Google-authenticated account; access is not limited to a manually maintained allowlist. Each account's progress and attempts remain private to that account, while source files stay in a separate private repository.
