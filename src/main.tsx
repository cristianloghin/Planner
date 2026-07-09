import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Root } from './App'
import { AuthProvider } from './auth'
import { UpdatePrompt } from './components/UpdatePrompt'
import { queryClient } from './lib/queryClient'
import '@fontsource-variable/source-sans-3'
import './styles/tokens.css'
import './styles/swatches.css'
import './index.css'

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
