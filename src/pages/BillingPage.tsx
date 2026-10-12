import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Crown } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { formatBytes, type Limits, type Plan, type PlanId } from '@/shared/plans'

type Status = {
  enabled: boolean
  plan: PlanId
  expiresAt: string | null
  prices: { month: { amountMinor: number; label: string }; year: { amountMinor: number; label: string }; currency: string }
  limits: Limits
  plans: Record<PlanId, Plan>
  usage: { dropBytes: number; dropItems: number; threads: number; aiTokens: number; partners: number; sharedMembers: number }
}

async function call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data as T
}

function Meter({ label, used, max, format = (n: number) => String(n) }: { label: string; used: number; max: number; format?: (n: number) => string }) {
  const pct = Math.min(100, Math.round((used / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span>{label}</span><span className="text-muted-foreground">{format(used)} of {format(max)}</span></div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className={`h-full ${pct >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

const ROWS: { label: string; get: (l: Limits) => string }[] = [
  { label: 'Drop storage', get: l => formatBytes(l.dropQuotaBytes) },
  { label: 'Largest Drop file', get: l => formatBytes(l.dropMaxFileBytes) },
  { label: 'AI assistant per month', get: l => `${Math.round(l.aiMonthlyTokens / 1000).toLocaleString()}k tokens` },
  { label: 'Threads', get: l => String(l.maxThreads) },
  { label: 'Accountability partners', get: l => String(l.maxPartners) },
  { label: 'People in shared threads', get: l => String(l.maxSharedMembers) },
]

export default function BillingPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error } = useQuery({ queryKey: ['billing'], queryFn: () => call<Status>('/api/billing/status') })
  const [confirming, setConfirming] = useState(false)

  // Coming back from the payment page: check the payment with the server (the webhook may be a moment behind)
  const reference = params.get('reference') ?? params.get('trxref')
  useEffect(() => {
    if (!reference) return
    setConfirming(true)
    call<{ status: string; applied: boolean }>('/api/billing/confirm', 'POST', { reference })
      .then(r => {
        toast(r.status === 'success' ? { title: 'Payment received', description: 'Your Pro plan is active.' } : r.status === 'pending' ? { title: 'Payment still processing', description: 'Refresh in a minute.' } : { title: 'Payment didn’t go through', variant: 'destructive' })
        queryClient.invalidateQueries({ queryKey: ['billing'] })
      })
      .catch((e: Error) => toast({ title: 'Couldn’t confirm the payment', description: e.message, variant: 'destructive' }))
      .finally(() => { setConfirming(false); setParams({}, { replace: true }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per reference
  }, [reference])

  const checkout = useMutation({
    mutationFn: (interval: 'month' | 'year') => call<{ url: string }>('/api/billing/checkout', 'POST', { interval }),
    onSuccess: r => { window.location.assign(r.url) },
    onError: (e: Error) => toast({ title: 'Couldn’t start checkout', description: e.message, variant: 'destructive' }),
  })

  const pro = data?.plan === 'pro'
  const l = data?.limits
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Crown className="text-primary" size={28} /> Plan &amp; usage</h1>
          <p className="text-muted-foreground mt-1">{pro ? `You’re on Pro until ${new Date(data!.expiresAt!).toLocaleDateString()}.` : 'You’re on the Free plan.'}</p>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Couldn’t load your plan.</p>}
        {confirming && <p role="status" className="text-sm">Checking your payment…</p>}

        {data && l && (
          <>
            <Card>
              <CardHeader><CardTitle>What you’re using</CardTitle><CardDescription>Your data is never deleted when a plan ends; you just can’t add past the limit until you free up room or upgrade.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Meter label="Drop storage" used={data.usage.dropBytes} max={l.dropQuotaBytes} format={formatBytes} />
                <Meter label="Threads" used={data.usage.threads} max={l.maxThreads} />
                <Meter label="AI assistant this month" used={data.usage.aiTokens} max={l.aiMonthlyTokens} format={n => `${Math.round(n / 1000)}k`} />
                <Meter label="Partners" used={data.usage.partners} max={l.maxPartners} />
                <Meter label="People in your shared threads" used={data.usage.sharedMembers} max={l.maxSharedMembers} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Free and Pro</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-3 font-medium"></th><th className="py-1.5 pr-3 font-medium">Free</th><th className="py-1.5 font-medium text-primary">Pro</th></tr></thead>
                    <tbody>
                      {ROWS.map(r => (
                        <tr key={r.label} className="border-t border-border"><td className="py-1.5 pr-3">{r.label}</td><td className="py-1.5 pr-3 text-muted-foreground">{r.get(data.plans.free.limits)}</td><td className="py-1.5">{r.get(data.plans.pro.limits)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.enabled ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl border border-border space-y-2">
                      <p className="font-semibold">1 month</p>
                      <p className="text-2xl font-bold">{data.prices.month.label}</p>
                      <Button className="w-full" disabled={checkout.isPending} onClick={() => checkout.mutate('month')}>{pro ? 'Add a month' : 'Upgrade to Pro'}</Button>
                    </div>
                    <div className="p-4 rounded-xl border border-primary space-y-2">
                      <p className="font-semibold flex items-center gap-1.5">1 year <span className="text-[10px] uppercase text-primary">2 months free</span></p>
                      <p className="text-2xl font-bold">{data.prices.year.label}</p>
                      <Button className="w-full" disabled={checkout.isPending} onClick={() => checkout.mutate('year')}>{pro ? 'Add a year' : 'Upgrade for a year'}</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Check size={14} /> Paid plans aren’t switched on yet. Ask the person running this server if you need more room.</p>
                )}
                <p className="text-xs text-muted-foreground">Pro is paid for a period at a time and doesn’t renew by itself; we email you a few days before it ends. Payments are handled by Paystack; we never see your card.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  )
}
