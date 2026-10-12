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
import AppearanceApplier from './components/AppearanceApplier'
import ModuleRoute from './components/ModuleRoute'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import AdminPage from './pages/AdminPage'
import AssistantPage from './pages/AssistantPage'
import ImportPage from './pages/ImportPage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Reachable while signed out: links from emails */}
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
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
                      <Route path="/wishlist" element={<ModuleRoute module="wishlist"><WishlistView /></ModuleRoute>} />
                      <Route path="/goals" element={<ModuleRoute module="goals"><GoalsView /></ModuleRoute>} />
                      <Route path="/drop" element={<ModuleRoute module="drop"><DropView /></ModuleRoute>} />
                      <Route path="/settings" element={<SettingsView />} />
                      <Route path="/assistant" element={<ModuleRoute module="ai"><AssistantPage /></ModuleRoute>} />
                      <Route path="/import" element={<ImportPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                    </Routes>
                    <AppearanceApplier />
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
