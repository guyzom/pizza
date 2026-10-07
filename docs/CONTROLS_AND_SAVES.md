# Controls and local progress

## Input and focus

Four native buttons provide physical left/right movement, power activation and jumping. Their row uses LTR order while Hebrew labels remain RTL. Pointer dragging and tap-to-jump are available on the input pad; secondary pointers cannot take ownership and cancellation does not count as a tap.

Space activates a focused button instead of also triggering a gameplay jump. Modal Tab/Shift+Tab navigation stays inside the dialog. Resuming returns focus to gameplay; leaving settings returns it to the opener. Transient gameplay messages are hidden during pause.

Returning players can open the map directly. Completion shows rewards, save status and replay controls; replaying cannot lower an existing best star rating.

## Save contract

The primary localStorage key is `pizza-dogs-save-v1`, and the recovery key is `pizza-dogs-save-v1:backup`. Saved fields include nine star ratings, unlocked stage, known stickers, character selection, help status and gameplay settings. The normalized schema has `version: 1`.

Reads validate the primary and recovery records. A missing or corrupt primary can recover from the second copy; valid copies are merged to preserve progress. Serialized records over 65,536 characters, malformed JSON and non-object records are rejected before normalization.

Before writing, the store merges maximum star ratings and unlocked stage, plus the union of known stickers, from current and persisted state. Character and preferences belong to the current session. Native `storage` events refresh the idle map and album without changing the active character, pace or stage. Reads and storage-event handling do not write.

After a successful primary write, a second validated copy is attempted. If the primary write fails, the existing recovery record remains untouched and play continues with a failure message. A recovery-copy quota error does not mark a successful primary save as lost.

## Limits

Both copies belong to the same device and origin. Clearing site data or losing the device removes both. There is no cloud backup, cross-device synchronization or mid-stage checkpoint. localStorage provides no multi-key transaction or cross-process lock: progress merging protects ordinary stale-window writes, but simultaneous racing writes are not guaranteed atomic.

The tests cover storage denial, quota errors, malformed saves, progress merging, real two-window storage events, recovery and UI feedback. Layout and browser checks are described in [QA.md](../QA.md); physical touch feel, VoiceOver and switch-access behavior require device verification.

## References

- [WAI button semantics](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [WAI modal focus](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Alternatives to dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)
- [Same-origin storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)
