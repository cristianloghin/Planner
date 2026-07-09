import { QueryClient } from '@tanstack/react-query'

// Shared cache for the slices migrated to TanStack Query (currently: templates).
// The reducer-backed store still owns everything else; the two coexist. Lives in
// its own module so auth can clear it on sign-out.
export const queryClient = new QueryClient()
