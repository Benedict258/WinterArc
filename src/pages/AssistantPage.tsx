import { Sparkles } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import AssistantChat, { type Quick } from '@/components/AssistantChat'

export { AI_STORAGE_PREFIX } from '@/components/AssistantChat'

const QUICK: Quick[] = [
  { label: 'Break a goal into steps', prompt: 'Break this goal into concrete steps and tasks: ', focus: true },
  { label: 'Plan my week', prompt: 'Look at my threads, tasks and backlog and suggest a plan for this week.' },
  { label: 'Weekly review', prompt: 'Review my past week honestly: what got done, what slipped, and what should change.' },
  { label: 'Tidy my backlog', prompt: 'Go through my backlog and suggest what to schedule, what to merge, and what to drop.' },
]

export default function AssistantPage() {
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4 min-h-[calc(100vh-8rem)]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Sparkles className="text-primary" size={28} /> Assistant</h1>
          <p className="text-muted-foreground mt-1">Ask about your plan. It suggests changes; nothing happens until you approve.</p>
        </div>
        <AssistantChat quick={QUICK} scope="main" />
      </div>
    </MainLayout>
  )
}
