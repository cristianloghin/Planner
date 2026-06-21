import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './App'
import { AuthProvider } from './auth'
import { UpdatePrompt } from './components/UpdatePrompt'
import '@fontsource-variable/source-sans-3'
import './styles/tokens.css'
import './styles/swatches.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
    <UpdatePrompt />
  </StrictMode>,
)
