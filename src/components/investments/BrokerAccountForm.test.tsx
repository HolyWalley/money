import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { BrokerAccountForm } from './BrokerAccountForm'
import type { BrokerAccountFormValues } from './BrokerAccountForm'
import type { Wallet } from '../../../shared/schemas/wallet.schema'

// The real select is a Base UI popup; a native one keeps the label wiring and
// lets the test drive the value handlers directly.
vi.mock('@/components/ui/select', () => {
  function triggerId(children: ReactNode): string | undefined {
    for (const child of Children.toArray(children)) {
      if (isValidElement<{ id?: string }>(child) && child.props.id) return child.props.id
    }
    return undefined
  }

  return {
    Select: ({ items, value, onValueChange, children, disabled }: {
      items?: { value: string; label: string }[]
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactNode
      disabled?: boolean
    }) => (
      <select
        id={triggerId(children)}
        value={value ?? ''}
        disabled={disabled}
        onChange={event => onValueChange?.(event.target.value)}
      >
        {(items ?? []).map(item => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    ),
    SelectTrigger: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
    SelectValue: () => null,
  }
})

const wallets: Wallet[] = [
  {
    _id: 'w-cash',
    type: 'wallet',
    name: 'DEGIRO cash',
    currency: 'EUR',
    initialBalance: 0,
    isSavings: false,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'w-other',
    type: 'wallet',
    name: 'Everyday',
    currency: 'PLN',
    initialBalance: 0,
    isSavings: false,
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function Harness({ defaults }: { defaults?: Partial<BrokerAccountFormValues> }) {
  const form = useForm<BrokerAccountFormValues>({
    defaultValues: { name: 'Broker', broker: 'degiro', ...defaults },
  })

  return (
    <>
      <BrokerAccountForm form={form} wallets={wallets} isSubmitting={false} />
      <pre data-testid="values">{JSON.stringify(form.watch())}</pre>
    </>
  )
}

function values(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('values').textContent ?? '{}')
}

describe('BrokerAccountForm', () => {
  it('explains what the cash wallet link is for and offers every wallet', () => {
    render(<Harness />)

    expect(
      screen.getByText("The wallet holding this broker's cash, so imported trades draw from it.")
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'DEGIRO cash (EUR)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Everyday (PLN)' })).toBeInTheDocument()
  })

  it('leaves the cash wallet unlinked until one is chosen', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Cash wallet (optional)')).toHaveValue('none')
    expect('cashWalletId' in values()).toBe(false)
  })

  it('links a cash wallet by id', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.selectOptions(screen.getByLabelText('Cash wallet (optional)'), 'w-cash')

    expect(values().cashWalletId).toBe('w-cash')
  })

  // The link is optional, so the form has to be able to take it away again.
  it('clears the link when the wallet is set back to none', async () => {
    const user = userEvent.setup()
    render(<Harness defaults={{ cashWalletId: 'w-cash' }} />)

    expect(screen.getByLabelText('Cash wallet (optional)')).toHaveValue('w-cash')

    await user.selectOptions(screen.getByLabelText('Cash wallet (optional)'), 'none')

    expect(screen.getByLabelText('Cash wallet (optional)')).toHaveValue('none')
    expect(values().cashWalletId).toBeUndefined()
  })

  it('offers the three supported brokers', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByLabelText('Broker')).toHaveValue('degiro')

    await user.selectOptions(screen.getByLabelText('Broker'), 'revolut')

    expect(values().broker).toBe('revolut')
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument()
  })
})
