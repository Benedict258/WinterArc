import { Navigate } from 'react-router-dom'
import { useSettings } from '@/hooks/useSettings'
import { normalizeModules, type ModuleId } from '@/shared/appearance'

/** Sends you home when you open a page whose module you switched off (waits for settings so a reload isn't bounced). */
export default function ModuleRoute({ module, children }: { module: ModuleId; children: React.ReactNode }) {
  const { data: settings, isLoading } = useSettings()
  if (isLoading) return null
  return normalizeModules(settings?.modules)[module] ? <>{children}</> : <Navigate to="/" replace />
}
