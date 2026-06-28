import { test, expect, type Page } from '@playwright/test'

const TEST_USER = {
  userId: 'e2e-test-user',
  username: 'e2e_tester',
  createdAt: new Date().toISOString(),
  premium: { active: false },
}

async function authenticate(page: Page) {
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const url = route.request().url()
    if (url.includes('/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: TEST_USER } }) })
    }
    if (url.includes('/refresh')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
    return route.continue()
  })

  await page.addInitScript((user) => {
    localStorage.setItem('money-app-user', JSON.stringify(user))
  }, TEST_USER)

  await page.goto('/dashboard')
  await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 10000 })
}

async function createWallet(
  page: Page,
  name: string,
  balance: number,
  options: { isSavings?: boolean; currency?: 'USD' | 'EUR' | 'PLN' } = {}
) {
  await page.goto('/wallets')
  await page.getByRole('button', { name: /Add Wallet|Create Wallet/ }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('textbox', { name: 'Name' }).fill(name)
  await page.getByRole('spinbutton', { name: 'Initial Balance' }).fill(String(balance))
  if (options.currency && options.currency !== 'USD') {
    // The wallet form ships with USD selected by default. Switch when needed.
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: options.currency }).click()
  }
  if (options.isSavings) {
    await page.getByRole('checkbox', { name: 'Savings wallet' }).check()
  }
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible()
}

async function openNewTransaction(page: Page) {
  const plusButton = page.locator('button[class*="size-8"]')
  await plusButton.click()
  await page.getByRole('dialog').waitFor()
}

// Create an expense transaction with an optional note. Uses the default
// (first-ordered) wallet, so the caller must arrange wallet order beforehand.
async function createExpenseTransaction(
  page: Page,
  amount: number,
  options: { note?: string } = {}
) {
  await openNewTransaction(page)
  await page.getByRole('radio', { name: 'Expense' }).click()
  await page.getByRole('textbox', { name: /USD|EUR|PLN/ }).fill(String(amount))
  await page.getByRole('button', { name: 'Food & Drink' }).click()
  if (options.note) {
    await page.getByRole('textbox', { name: 'Note' }).fill(options.note)
  }
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
}

// Click the "Make recurring" button on the row matching the given note text.
async function openMakeRecurringFor(page: Page, note: string) {
  const row = page.locator('div.grid').filter({ hasText: note }).first()
  await row.getByRole('button', { name: 'Make recurring' }).click()
}

// Inside the open Make Recurring drawer, enable Save Up and select a savings
// wallet by visible name (e.g., "Holiday").
async function enableSaveUp(page: Page, walletName: string) {
  await page.getByRole('checkbox', { name: /Save up/ }).check()
  // The savings wallet trigger is a combobox labelled "Savings wallet"; the
  // form auto-selects the first option when the dropdown only contains one,
  // but we click anyway to be safe and switch if needed.
  await page.getByRole('combobox').filter({ hasText: /Select a savings wallet|/ }).last().click()
  await page.getByRole('option', { name: walletName }).click()
}

test.describe('Recurring Payments + Savings Link', () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
    // Order matters: non-savings checking wallet first so it becomes the
    // default for new transactions (TransactionForm uses wallets[0]).
    await createWallet(page, 'Checking', 0, { isSavings: false, currency: 'USD' })
    await createWallet(page, 'Holiday', 0, { isSavings: true, currency: 'USD' })
  })

  test('auto-creates linked goal when Save Up is enabled', async ({ page }) => {
    await page.goto('/transactions')
    await createExpenseTransaction(page, 100, { note: 'Concert tickets' })

    await openMakeRecurringFor(page, 'Concert tickets')
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).toBeVisible()

    // monthly is the default frequency; just enable Save Up.
    await enableSaveUp(page, 'Holiday')
    await page.getByRole('button', { name: 'Create Recurring Payment' }).click()
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).not.toBeVisible({ timeout: 5000 })

    await page.goto('/savings')
    const goalCard = page.locator('[data-slot="card"]').filter({ hasText: 'Concert tickets' })
    await expect(goalCard).toBeVisible()
    // Target amount $100 should show on the linked goal card.
    await expect(goalCard).toContainText('$100.00')
    // Linked goals display the rotate-cw icon (svg.lucide-rotate-cw).
    await expect(goalCard.locator('svg.lucide-rotate-cw')).toBeVisible()
  })

  test('achieves goal on log and spawns a fresh active goal for the next occurrence', async ({ page }) => {
    await page.goto('/transactions')
    await createExpenseTransaction(page, 100, { note: 'Concert tickets' })
    await openMakeRecurringFor(page, 'Concert tickets')
    await enableSaveUp(page, 'Holiday')
    await page.getByRole('button', { name: 'Create Recurring Payment' }).click()
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).not.toBeVisible({ timeout: 5000 })

    // The source transaction for the RP is auto-logged for the current
    // occurrence, so the next upcoming entry falls in the next period.
    // Move forward one period to surface it. Only "due" occurrences render
    // directly; "upcoming" ones are hidden behind a collapsible — click it.
    await page.goto('/transactions')
    await page.getByRole('button', { name: 'Next period' }).click()
    await page.getByRole('button', { name: /\d+ upcoming/ }).click()
    await page.getByRole('button', { name: 'Log payment' }).first().click()
    await expect(page.getByRole('heading', { name: 'Log Payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Log Payment' }).click()
    // After log there may be a "Update recurring payment?" alert when fields
    // differ. With defaults accepted, none should differ — but if it appears,
    // dismiss with Keep as is.
    const keepAsIs = page.getByRole('button', { name: 'Keep as is' })
    if (await keepAsIs.isVisible().catch(() => false)) {
      await keepAsIs.click()
    }
    await expect(page.getByRole('heading', { name: 'Log Payment' })).not.toBeVisible({ timeout: 5000 })

    await page.goto('/savings')
    // The Active tab is selected by default. The achieved goal should NOT be
    // here; switch to Achieved to find it.
    await page.getByRole('tab', { name: 'Achieved' }).click()
    const achievedCard = page.locator('[data-slot="card"]').filter({ hasText: 'Concert tickets' })
    await expect(achievedCard).toBeVisible()
    await expect(achievedCard.getByText('Achieved', { exact: true })).toBeVisible()

    // A new active linked goal for the next occurrence should exist.
    await page.getByRole('tab', { name: 'Active' }).click()
    const activeCard = page.locator('[data-slot="card"]').filter({ hasText: 'Concert tickets' })
    await expect(activeCard).toBeVisible()
    await expect(activeCard.locator('svg.lucide-rotate-cw')).toBeVisible()
  })

  test('deletes the linked goal on skip and creates one for the next occurrence', async ({ page }) => {
    await page.goto('/transactions')
    await createExpenseTransaction(page, 50, { note: 'Subscription' })
    await openMakeRecurringFor(page, 'Subscription')
    await enableSaveUp(page, 'Holiday')
    await page.getByRole('button', { name: 'Create Recurring Payment' }).click()
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).not.toBeVisible({ timeout: 5000 })

    // Confirm we start with an active linked goal.
    await page.goto('/savings')
    await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Subscription' })).toBeVisible()

    // Skip the upcoming occurrence (next period; current is auto-logged).
    await page.goto('/transactions')
    await page.getByRole('button', { name: 'Next period' }).click()
    await page.getByRole('button', { name: /\d+ upcoming/ }).click()
    await page.getByRole('button', { name: 'Skip' }).first().click()

    // The previously-active goal should be gone (linker deletes on skip),
    // and a new active goal for the next occurrence should appear instead.
    await page.goto('/savings')
    const activeSubscription = page.locator('[data-slot="card"]').filter({ hasText: 'Subscription' })
    await expect(activeSubscription).toBeVisible()
    await expect(activeSubscription.locator('svg.lucide-rotate-cw')).toBeVisible()

    // No achieved Subscription goal (we skipped, not logged).
    await page.getByRole('tab', { name: 'Achieved' }).click()
    await expect(page.getByText('Subscription')).not.toBeVisible()
  })

  test('detaches the goal when the recurring payment is deleted', async ({ page }) => {
    await page.goto('/transactions')
    await createExpenseTransaction(page, 75, { note: 'Gym' })
    await openMakeRecurringFor(page, 'Gym')
    await enableSaveUp(page, 'Holiday')
    await page.getByRole('button', { name: 'Create Recurring Payment' }).click()
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).not.toBeVisible({ timeout: 5000 })

    // Sanity: linked goal exists with icon.
    await page.goto('/savings')
    const goalCard = page.locator('[data-slot="card"]').filter({ hasText: 'Gym' })
    await expect(goalCard).toBeVisible()
    await expect(goalCard.locator('svg.lucide-rotate-cw')).toBeVisible()

    // Open the Recurring Payments management modal. The section only renders
    // when there's at least one due/upcoming payment in the period; move
    // forward one period to surface it.
    await page.goto('/transactions')
    await page.getByRole('button', { name: 'Next period' }).click()
    // The Recurring Payments collapsible holds the gear icon button next to
    // the "Recurring Payments" label. Scope to the row containing the label.
    const recurringHeader = page.locator('div').filter({
      has: page.getByText('Recurring Payments', { exact: true }),
    }).last()
    // Within that row, the only role=button is the gear (Settings) icon.
    await recurringHeader.getByRole('button').click()
    await expect(page.getByRole('heading', { name: 'Recurring Payments' })).toBeVisible()

    // The modal lists each RecurringPaymentItem with a MoreVertical menu
    // button. Open the menu for the "Gym" item — scope to the dialog and
    // pick the item row containing "Gym".
    const manageDialog = page.getByRole('dialog', { name: 'Recurring Payments' })
    const gymRow = manageDialog.locator('div.flex').filter({
      has: page.getByText('Gym', { exact: true }),
    }).first()
    await gymRow.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Delete/i }).click()
    // Confirmation dialog
    await page.getByRole('button', { name: 'Delete' }).click()

    // Goal still exists, but the recurring icon is gone (detached).
    await page.goto('/savings')
    const detached = page.locator('[data-slot="card"]').filter({ hasText: 'Gym' })
    await expect(detached).toBeVisible()
    await expect(detached.locator('svg.lucide-rotate-cw')).toHaveCount(0)
  })

  test('updates recurring payment details from the edit form', async ({ page }) => {
    await page.goto('/transactions')
    await createExpenseTransaction(page, 40, { note: 'Streaming' })
    await openMakeRecurringFor(page, 'Streaming')
    await page.getByRole('button', { name: 'Create Recurring Payment' }).click()
    await expect(page.getByRole('heading', { name: 'Make Recurring' })).not.toBeVisible({ timeout: 5000 })

    await page.goto('/transactions')
    await page.getByRole('button', { name: 'Next period' }).click()
    const recurringHeader = page.locator('div').filter({
      has: page.getByText('Recurring Payments', { exact: true }),
    }).last()
    await recurringHeader.getByRole('button').click()
    await expect(page.getByRole('heading', { name: 'Recurring Payments' })).toBeVisible()

    const manageDialog = page.getByRole('dialog', { name: 'Recurring Payments' })
    const streamingRow = manageDialog.locator('div.flex').filter({
      has: page.getByText('Streaming', { exact: true }),
    }).first()
    await streamingRow.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Edit/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit Recurring Payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Payment details' }).click()

    await page.getByRole('textbox', { name: /USD|EUR|PLN/ }).fill('125')
    await page.getByRole('textbox', { name: 'Note' }).fill('Updated streaming')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Recurring Payment' })).not.toBeVisible({ timeout: 5000 })

    await expect(manageDialog.getByText('Updated streaming')).toBeVisible()
    await expect(manageDialog.getByText('-125.00 USD')).toBeVisible()
  })

  test('savings wallet dropdown filters by RP currency', async ({ page }) => {
    // Add an EUR savings wallet alongside the USD ones from beforeEach.
    await createWallet(page, 'Euro pot', 0, { isSavings: true, currency: 'EUR' })
    // Add a regular EUR wallet so we can create an EUR-currency transaction.
    await createWallet(page, 'Euro Checking', 0, { isSavings: false, currency: 'EUR' })

    // Build an EUR expense by selecting the EUR wallet inside the new
    // transaction dialog before filling amount.
    await page.goto('/transactions')
    await openNewTransaction(page)
    await page.getByRole('radio', { name: 'Expense' }).click()
    // Switch the from-wallet to the Euro Checking wallet (renders as combobox).
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /Euro Checking/ }).click()
    await page.getByRole('textbox', { name: /USD|EUR|PLN/ }).fill('20')
    await page.getByRole('button', { name: 'Food & Drink' }).click()
    await page.getByRole('textbox', { name: 'Note' }).fill('Croissants')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    await openMakeRecurringFor(page, 'Croissants')
    await page.getByRole('checkbox', { name: /Save up/ }).check()

    // The savings-wallet dropdown should list only EUR savings wallets.
    await page.getByRole('combobox').filter({ hasText: /Select a savings wallet|Euro pot|Holiday/ }).last().click()
    await expect(page.getByRole('option', { name: 'Euro pot' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Holiday' })).toHaveCount(0)
  })
})
