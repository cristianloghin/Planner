import '@fontsource-variable/source-sans-3'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './App'
import './assets/styles/swatches.css'
import './assets/styles/tokens.css'
import { AuthProvider } from './auth'
import { UpdatePrompt } from './components/UpdatePrompt'
import { registerDomainDefaults } from './domains'
import './index.css'
import { queryClient, queryPersistOptions } from './lib/queryClient'

// Before anything is read back out of storage: a write paused offline is
// resumed as soon as the saved cache lands, and one whose behaviour is not
// registered by then is dropped silently.
registerDomainDefaults(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Persist variant of the provider: restores the query cache (templates,
        completions windows) from localStorage before first render, so an
        offline or slow launch shows last-known data instantly. Paused offline
        mutations are dehydrated too; once the restore lands, resume them —
        their behaviour is looked up from the defaults registered above. */}
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={queryPersistOptions}
      onSuccess={() => void queryClient.resumePausedMutations()}
    >
      <AuthProvider>
        <Root />
      </AuthProvider>
      <UpdatePrompt />
    </PersistQueryClientProvider>
  </StrictMode>,
)
