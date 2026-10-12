import type { CapacitorConfig } from '@capacitor/cli'

// The native app bundles the built web app (dist/) so it opens instantly and
// works offline from the first launch. API calls go to the Render backend
// (see VITE_API_BASE in the build) with a bearer token instead of cookies.
const config: CapacitorConfig = {
  appId: 'dev.benedictisaac.winterarc', // same id + signing key as the old TWA, so installs upgrade in place
  appName: 'WinterArc',
  webDir: 'dist',
  android: { backgroundColor: '#0b1220' },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#0b1220' },
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#5b8def' },
  },
}

export default config
