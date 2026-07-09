import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '../auth'
import { uid } from '../lib/id'
import { supabase } from '../lib/supabase'
import type { SupabaseStore } from '../store/supabaseStore'
import type { EventTemplate } from '../types'
import { useAccountStore } from './useAccountStore'

/**
 * Templates: the first slice migrated off the reducer/AppState onto TanStack
 * Query (the strangler-fig pilot). Everything else still flows through the
 * reducer + ScheduleStore. The two coexist under one rule — each slice has
 * exactly one owner; templates are owned here.
 *
 * Reads/writes reuse SupabaseStore's row mapping via its public template
 * methods, so there's no duplicated event_series shape. Mutations are
 * optimistic and reconcile through invalidation.
 */

type TemplateInput = Omit<EventTemplate, 'id'>

const templatesKey = (accountId: string | null | undefined) => ['templates', accountId] as const

/**
 * Mount once near the app root: bridges Realtime to the templates cache. A
 * change to `event_series` invalidates the query so a partner's edit shows up.
 * The table is shared with events, so an event change invalidates here too —
 * a harmless refetch that disappears once events also move to Query.
 */
export function useTemplatesRealtime(): void {
  const { accountId } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    if (!accountId) return
    const channel = supabase
      .channel('templates-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_series' },
        () => void qc.invalidateQueries({ queryKey: templatesKey(accountId) }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [accountId, qc])
}

/** Read the account's templates. */
export function useTemplates() {
  const { accountId } = useAuth()
  const store = useAccountStore()
  return useQuery({
    queryKey: templatesKey(accountId),
    queryFn: () => store!.listTemplates(),
    enabled: !!store,
    // Realtime invalidation (useTemplatesRealtime) keeps this fresh; without a
    // staleTime every consumer mount and window focus refetches redundantly.
    staleTime: 5 * 60_000,
  })
}

/**
 * Shared optimistic-mutation plumbing: snapshot the list, apply `optimistic`
 * locally, roll back on error, and always re-sync on settle.
 */
function useTemplateMutation<V>(
  mutationFn: (store: SupabaseStore, vars: V) => Promise<unknown>,
  optimistic: (current: EventTemplate[], vars: V) => EventTemplate[],
) {
  const { accountId } = useAuth()
  const store = useAccountStore()
  const qc = useQueryClient()
  const key = templatesKey(accountId)

  return useMutation({
    mutationFn: (vars: V) => {
      if (!store) throw new Error('Templates: not signed in yet')
      return mutationFn(store, vars)
    },
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<EventTemplate[]>(key) ?? []
      qc.setQueryData<EventTemplate[]>(key, optimistic(prev, vars))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useAddTemplate() {
  const mutation = useTemplateMutation<EventTemplate>(
    (store, t) => store.saveTemplate(t),
    // The optimistic row carries the REAL id (minted below, before the write),
    // so editing/deleting it before invalidation lands targets a valid uuid —
    // a placeholder id would fail the server's uuid cast.
    (current, t) => [...current, t],
  )
  return {
    ...mutation,
    mutate: (input: TemplateInput) => mutation.mutate({ ...input, id: uid() }),
  }
}

export function useUpdateTemplate() {
  return useTemplateMutation<EventTemplate>(
    (store, t) => store.saveTemplate(t),
    (current, t) => current.map((x) => (x.id === t.id ? t : x)),
  )
}

export function useDeleteTemplate() {
  return useTemplateMutation<string>(
    (store, id) => store.deleteTemplate(id),
    (current, id) => current.filter((x) => x.id !== id),
  )
}
