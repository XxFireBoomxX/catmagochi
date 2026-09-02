import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { shouldPushTo } from './pushTargets.js'

const sub = (over = {}) => ({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x' }, ...over })

describe('shouldPushTo', () => {
  test('sends to a subscriber with no preferences recorded', () => {
    assert.equal(shouldPushTo(sub(), 'message', null), true)
  })

  test('skips a subscriber who turned this type off', () => {
    assert.equal(shouldPushTo(sub({ types: { message: false } }), 'message', null), false)
  })

  test('sends when a different type is turned off', () => {
    assert.equal(shouldPushTo(sub({ types: { update: false } }), 'message', null), true)
  })

  // Otherwise sending a nudge buzzes your own phone with the note you just
  // wrote, and tapping it opens an app with nothing to show.
  test('skips the device the notification originated from', () => {
    assert.equal(shouldPushTo(sub({ device: 'device-a' }), 'message', 'device-a'), false)
  })

  test('still sends to the other device', () => {
    assert.equal(shouldPushTo(sub({ device: 'device-b' }), 'message', 'device-a'), true)
  })

  test('sends to everyone when the notification has no origin (sender.html)', () => {
    assert.equal(shouldPushTo(sub({ device: 'device-a' }), 'message', null), true)
  })

  test('sends to a subscriber registered before device ids existed', () => {
    assert.equal(shouldPushTo(sub(), 'message', 'device-a'), true)
  })
})
