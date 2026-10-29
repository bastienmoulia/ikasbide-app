# Device cache for offline reading

Chapters read online are kept in Firestore's persistent IndexedDB cache, and the last validated Firebase configuration in `localStorage`, so a signed-in learner can reread them offline. The cache is not cleared on sign-out: it holds only published unit content, never progress, and the app shows content only to a signed-in session, which keeps [authenticated access](0001-authenticated-unit-access.md) at the interface level while accepting that the browser's storage on a shared device still contains the consulted chapters.
