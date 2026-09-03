import '@fontsource-variable/source-sans-3'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './App'
import './assets/styles/swatches.css'
import './assets/styles/tokens.css'
import { UpdatePrompt } from './components/UpdatePrompt'
import { registerDomainDefaults } from './domains'
import './index.css'
import { queryClient, queryPersistOptions } from './queryClient'
import { SessionProvider } from './services/session'
import { sessionSource } from './session'

// Before anything is read back out of storage: a write paused offline is
// resumed as soon as the saved cache lands, and one whose behaviour is not
// registered by then is dropped silently.
registerDomainDefaults(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Persist variant of the provider: restores the query cache from
        localStorage before first render, so an offline or slow launch shows
        last-known data instantly. Once the restore lands: resume the writes
        paused offline (their behaviour is looked up from the defaults
        registered above), then treat the launch like a reconnection — nothing
        was subscribed while the app was closed, so everything cached may be
        stale and is refetched once. Offline, the resume waits for the network
        and the refetch waits with it, with the cached data still on screen. */}
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={queryPersistOptions}
      onSuccess={() =>
        void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())
      }
    >
      <SessionProvider source={sessionSource}>
        <Root />
      </SessionProvider>
      <UpdatePrompt />
    </PersistQueryClientProvider>
  </StrictMode>,
)
