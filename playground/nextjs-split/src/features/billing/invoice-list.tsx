import { plural, t } from 'best-i18n/macro'

const invoices = [
  { id: 'INV-0042', total: '$480.00' },
  { id: 'INV-0041', total: '$480.00' },
]

export function InvoiceList() {
  const count = invoices.length

  return (
    <section>
      <h2>{t`Invoices`}</h2>
      <p>{plural(count, `One invoice`, `${count} invoices`)}</p>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            {invoice.id} - {invoice.total}
          </li>
        ))}
      </ul>
    </section>
  )
}
