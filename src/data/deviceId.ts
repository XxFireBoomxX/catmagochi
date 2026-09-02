const DEVICE_ID_KEY = 'catmagochi-device-id-v1'

// Set only when localStorage is unusable (private mode, blocked site data).
let fallbackId: string | null = null

// A stable id for this install. The relay uses it to avoid handing a message
// or care event back to the device that sent it: `origin` on what we POST,
// `?device=` on the WebSocket we listen on (see server/server.js's
// isOwnEcho). Without that, a device acks the echo of its own action and --
// because the relay's pending queue is shared and drained by the first ack
// from any client -- deletes it before the other device ever connects.
//
// Not an identity: it never leaves the relay and only has to differ from the
// other device's id.
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    // A per-session id still suppresses echoes for as long as the app is
    // open. Deliberately not crypto.randomUUID(): that is one of the things
    // that can land us here (it's undefined outside a secure context), and
    // retrying it from the catch would throw again, uncaught, out of the
    // WebSocket connect() that asked for the id. This only has to differ
    // from the other device's id, so a non-crypto value is fine.
    fallbackId ??= `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    return fallbackId
  }
}
