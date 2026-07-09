import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './App'
import { AuthProvider } from './auth'
import { UpdatePrompt } from './components/UpdatePrompt'
import { queryClient, queryPersistOptions } from './lib/queryClient'
import '@fontsource-variable/source-sans-3'
import './styles/tokens.css'
import './styles/swatches.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Persist variant of the provider: restores the query cache (templates,
        completions windows) from localStorage before first render, so an
        offline or slow launch shows last-known data instantly. Paused offline
        mutations are dehydrated too; once the restore lands, resume them —
        their behaviour is looked up from the mutation defaults registered in
        src/data/completions.ts. */}
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
