// Who a given push actually goes to. Pulled out of server.js so it can be
// unit-tested directly: server.js starts listening on import, so there is no
// way to exercise this through it without standing up a real push service.
//
// Two independent reasons to skip a subscriber:
//
// - they turned this notification type off in the app's settings; or
// - the notification is about something *they* just did. The relay already
//   avoids echoing a message back to the device that sent it, but a push is
//   a separate delivery path keyed by endpoint, so without this you press
//   [PLAY], your own phone buzzes with the note you just wrote, you tap it,
//   and the app opens to nothing -- the in-app copy was correctly suppressed.
export function shouldPushTo(entry, type, originDevice) {
  if (entry.types?.[type] === false) return false
  if (originDevice && entry.device === originDevice) return false
  return true
}
