import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import TodayView from './pages/TodayView'
import WeekView from './pages/WeekView'
import ThreadsView from './pages/ThreadsView'
import ThreadDetailView from './pages/ThreadDetailView'
import BacklogView from './pages/BacklogView'
import WishlistView from './pages/WishlistView'
import GoalsView from './pages/GoalsView'
import SettingsView from './pages/SettingsView'
import DropView from './pages/DropView'
import { Toaster } from './components/ui/toaster'
import { AuthProvider } from './context/AuthContext'
import DialogHost from './components/DialogHost'
import SyncStatus from './components/SyncStatus'
import AuthGate from './components/AuthGate'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Reachable while signed out: links from emails */}
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/*"
                element={
                  <AuthGate>
                    <Routes>
                      <Route path="/" element={<TodayView />} />
                      <Route path="/week" element={<WeekView />} />
                      <Route path="/threads" element={<ThreadsView />} />
                      <Route path="/threads/:id" element={<ThreadDetailView />} />
                      <Route path="/backlog" element={<BacklogView />} />
                      <Route path="/wishlist" element={<WishlistView />} />
                      <Route path="/goals" element={<GoalsView />} />
                      <Route path="/drop" element={<DropView />} />
                      <Route path="/settings" element={<SettingsView />} />
                    </Routes>
                    <DialogHost />
                    <SyncStatus />
                  </AuthGate>
                }
              />
            </Routes>
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
