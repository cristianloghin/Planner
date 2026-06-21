import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Root } from './App'
import { AuthProvider } from './auth'
import { UpdatePrompt } from './components/UpdatePrompt'
import '@fontsource-variable/source-sans-3'
import './styles/tokens.css'
import './styles/swatches.css'
import './index.css'

// Shared cache for the slices migrated to TanStack Query (currently: templates).
// The reducer-backed store still owns everything else; the two coexist.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <UpdatePrompt />
    </QueryClientProvider>
  </StrictMode>,
)
