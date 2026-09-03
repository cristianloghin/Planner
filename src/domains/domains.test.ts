import { describe, expect, it, vi } from 'vitest'

// The domain modules reach the Supabase client at import time, and the client
// refuses to build without env vars. The map under test never touches it.
vi.mock('../client/supabase', () => ({ supabase: {} }))

import { queryKeysForTable } from './index'

const ids = { accountId: 'acc', userId: 'usr' }

describe('queryKeysForTable', () => {
  it('treats a change to anything attached to an event as a change to the event', () => {
    for (const table of ['event_series', 'event_person', 'checklist_item', 'note', 'reminder']) {
      expect(queryKeysForTable(table, ids)).toEqual([
        ['events', 'acc'],
        ['templates', 'acc'],
      ])
    }
  })

  it('routes what happened on a day to the completions windows', () => {
    expect(queryKeysForTable('event_occurrence', ids)).toEqual([['completions', 'acc']])
    expect(queryKeysForTable('occurrence_item_state', ids)).toEqual([['completions', 'acc']])
  })

  it('keys preferences by user as well as account', () => {
    expect(queryKeysForTable('user_preference', ids)).toEqual([['preferences', 'acc', 'usr']])
  })

  it('keys people by account and the account itself by user', () => {
    expect(queryKeysForTable('person', ids)).toEqual([['people', 'acc']])
    expect(queryKeysForTable('account_member', ids)).toEqual([['account', 'usr']])
  })

  it('names nothing for a table no domain reads', () => {
    expect(queryKeysForTable('push_subscription', ids)).toEqual([])
    expect(queryKeysForTable('something_new', ids)).toEqual([])
  })
})
