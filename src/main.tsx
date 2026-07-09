import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
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
        offline or slow launch shows last-known data instantly. */}
    <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <UpdatePrompt />
    </PersistQueryClientProvider>
  </StrictMode>,
)
