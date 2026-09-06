import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Cloud, Download, Upload, Lock, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle, Sliders } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useGridSettings, useUpdateGridSettings } from '@/hooks/useGrid'
import { useCalendar } from '@/hooks/useCalendar'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/use-toast'

export default function SettingsView() {
  const { logout } = useAuth()
  const { toast } = useToast()
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useSettings()
  const { 
    mutate: updateSettings, 
    isPending: isUpdating,
  } = useUpdateSettings()
  
  const {
    calendarStatus,
    lastSyncedAt,
    connectCalendar,
    isConnecting,
    disconnectCalendar,
    isDisconnecting,
    syncCalendar,
    isSyncing,
  } = useCalendar()
  
  const [editTimezone, setEditTimezone] = useState('Africa/Lagos')
  const [editMultipleThreadsPerWeekTarget, setEditMultipleThreadsPerWeekTarget] = useState(3)
  const [isDirty, setIsDirty] = useState(false)

  const { data: gridBalancing } = useGridSettings()
  const { mutate: updateGridBalancing } = useUpdateGridSettings()
  const [editMaxDailyIntensity, setEditMaxDailyIntensity] = useState(6)
  const [editPreferLow, setEditPreferLow] = useState(true)
  const [gridDirty, setGridDirty] = useState(false)

  useEffect(() => {
    if (gridBalancing) {
      setEditMaxDailyIntensity(gridBalancing.maxDailyIntensity)
      setEditPreferLow(gridBalancing.preferLowIntensityOnBusyDays)
      setGridDirty(false)
    }
  }, [gridBalancing])
  
  // Initialize edit form with current settings
  useEffect(() => {
    if (settings) {
      setEditTimezone(settings.timezone || 'Africa/Lagos')
      setEditMultipleThreadsPerWeekTarget(settings.multipleThreadsPerWeekTarget || 3)
      setIsDirty(false)
    }
  }, [settings])

  const handleSavePreferences = () => {
    updateSettings({
      timezone: editTimezone,
      multipleThreadsPerWeekTarget: editMultipleThreadsPerWeekTarget,
    }, {
      onSuccess: () => {
        setIsDirty(false)
        toast({
          title: 'Settings Saved',
          description: 'Your workspace preferences have been updated.',
        })
      }
    })
  }

  const handleExportData = async () => {
    try {
      const [threadsRes, tasksRes, goalsRes, wishlistRes, settingsRes] = await Promise.all([
        fetch('/api/threads'),
        fetch('/api/tasks'),
        fetch('/api/goals'),
        fetch('/api/wishlist'),
        fetch('/api/settings'),
      ])
      const exportData = {
        threads: await threadsRes.json(),
        tasks: await tasksRes.json(),
        goals: await goalsRes.json(),
        wishlist: await wishlistRes.json(),
        settings: await settingsRes.json(),
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({
        title: 'Export Complete',
        description: 'Workspace data exported to JSON successfully.',
      })
    } catch {
      toast({
        title: 'Export Failed',
        description: 'Failed to export workspace data.',
        variant: 'destructive',
      })
    }
  }

  // PWA Install handler
  const handleInstall = async () => {
    const win = window as any
    if (win.deferredPrompt) {
      win.deferredPrompt.prompt()
      const choiceResult = await win.deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt')
      }
      win.deferredPrompt = null
    }
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Settings</h1>
          <p className="text-lg text-muted-foreground">Manage your workspace configuration</p>
        </div>

        {/* Loading state */}
        {settingsLoading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        )}
        
        {/* Error state */}
        {settingsError && (
          <div className="text-center py-8">
            <p className="text-destructive">Error loading settings: {settingsError.message}</p>
          </div>
        )}
        
        {/* Settings Content */}
        {!settingsLoading && (
          <>
            {/* Security & Access */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-primary" />
                  Security & Access Control
                </CardTitle>
                <CardDescription>Passcode gate protection for your private workspace</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <p className="text-sm font-semibold">Passcode Protection Active</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Access is gated to Benedict Isaac. Sessions remain unlocked on this device until you manually lock.
                    </p>
                  </div>
                  <Button onClick={logout} variant="outline" size="sm" className="gap-2 shrink-0">
                    <Lock size={15} />
                    Lock Session Now
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Google Calendar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud size={20} />
                  Google Calendar Sync
                </CardTitle>
                <CardDescription>Connect your Google Calendar for two-way synchronization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">Connection Status</p>
                      <div className="flex items-center gap-2 mt-1">
                        {calendarStatus === 'connected' ? (
                          <>
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={16} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Not connected</span>
                          </>
                        )}
                      </div>
                    </div>
                    {lastSyncedAt && (
                      <p className="text-xs text-muted-foreground">
                        Last synced: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 mt-4">
                    {calendarStatus === 'disconnected' ? (
                      <Button onClick={() => connectCalendar()} disabled={isConnecting} className="gap-2">
                        <Cloud size={16} />
                        {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={() => syncCalendar()} 
                          disabled={isSyncing} 
                          variant="secondary"
                          className="gap-2 bg-background"
                        >
                          <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                          {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                        <Button 
                          onClick={() => disconnectCalendar()} 
                          disabled={isDisconnecting} 
                          variant="outline"
                        >
                          {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Preferences */}
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Customize your workspace scheduling rules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Timezone</label>
                  <select
                    value={editTimezone}
                    onChange={(e) => {
                      setEditTimezone(e.target.value)
                      setIsDirty(true)
                    }}
                    className="mt-2 w-full p-2 rounded-lg border border-border bg-background"
                  >
                    <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</option>
                    <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Weekly Generation</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Auto-generate weekly schedule starting Monday following thread frequency rules.
                  </p>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium mb-1">Tasks per Week for Multiple Threads</label>
                  <input
                    type="number"
                    value={editMultipleThreadsPerWeekTarget}
                    onChange={(e) => {
                      setEditMultipleThreadsPerWeekTarget(parseInt(e.target.value) || 3)
                      setIsDirty(true)
                    }}
                    min="1"
                    max="7"
                    className="w-full p-2 rounded-lg border border-border bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    How many times per week should multiple-frequency threads appear in the grid?
                  </p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button 
                    type="button"
                    onClick={handleSavePreferences}
                    disabled={isUpdating || !isDirty}
                  >
                    {isUpdating ? 'Saving...' : 'Save Preferences'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}  
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders size={20} />
                  Grid Balancing
                </CardTitle>
                <CardDescription>Control how the weekly generator distributes load across days</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Max Daily Intensity</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={editMaxDailyIntensity}
                      onChange={(e) => {
                        setEditMaxDailyIntensity(parseInt(e.target.value))
                        setGridDirty(true)
                      }}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-mono w-10 text-right">{editMaxDailyIntensity}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sum cap: light=1, medium=2, heavy=4. Default 6 ≈ 3 medium tasks per day.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
                  <input
                    id="preferLow"
                    type="checkbox"
                    checked={editPreferLow}
                    onChange={(e) => {
                      setEditPreferLow(e.target.checked)
                      setGridDirty(true)
                    }}
                    className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                  />
                  <label htmlFor="preferLow" className="text-sm cursor-pointer">
                    <span className="font-medium block">Prefer low-intensity on busy days</span>
                    <span className="text-xs text-muted-foreground">
                      When cap is approached, place lighter tasks first.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateGridBalancing(
                        {
                          maxDailyIntensity: editMaxDailyIntensity,
                          preferLowIntensityOnBusyDays: editPreferLow,
                        },
                        { onSuccess: () => setGridDirty(false) }
                      )
                    }
                    disabled={!gridDirty}
                  >
                    {gridDirty ? 'Save Grid Balancing' : 'Saved'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card>
              <CardHeader>
                <CardTitle>Data Management</CardTitle>
                <CardDescription>Export or import your workspace data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleExportData} className="w-full justify-start gap-2" variant="outline">
                  <Download size={18} />
                  Export All Data (JSON)
                </Button>
                <Button
                  id="pwa-install-button"
                  onClick={handleInstall}
                  className="w-full justify-start gap-2 mt-2"
                  variant="outline"
                  style={{ display: 'none' }}
                >
                  Install App
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  )
}