import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { useSyncListener } from '@/hooks/useTasks'
import { installNativeNetworking } from '@/lib/native'
import { startNativeReminders } from '@/lib/nativeReminders'
import { startHealthSync } from '@/lib/healthSync'

installNativeNetworking()
startNativeReminders()
startHealthSync()

function AppWithSyncListener() {
  useSyncListener()
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithSyncListener />
  </React.StrictMode>,
)