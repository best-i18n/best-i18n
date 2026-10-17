import { t } from 'best-i18n/macro'
import { InvoiceList } from '@/features/billing/invoice-list'
import { PlanCard } from '@/features/billing/plan-card'

// Shard `app/[locale]/billing`: the route segment rides along in the path.
export default function BillingPage() {
  return (
    <>
      <h1>{t`Billing`}</h1>
      <p>{t`Your plan and past invoices.`}</p>
      <PlanCard />
      <InvoiceList />
    </>
  )
}
