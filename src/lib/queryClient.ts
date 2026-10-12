import { QueryClient } from '@tanstack/react-query'

/**
 * 'always': our own code decides what to do without a connection (read the saved copy, or queue the change).
 * TanStack Query's default would pause every request and every queued edit until the browser reports it is
 * back online, and an edit paused that way is lost if the app is closed first.
 */
export const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { networkMode: 'always' }, mutations: { networkMode: 'always' } } })
