import { test, expect, type Page } from '@playwright/test'

const TEST_USER = {
  userId: 'e2e-test-user',
  username: 'e2e_tester',
  createdAt: new Date().toISOString(),
  premium: { active: false },
}

async function authenticate(page: Page) {
  // Intercept auth API calls so the app doesn't clear our seeded user
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

  // Seed localStorage before the app loads
  await page.addInitScript((user) => {
    localStorage.setItem('money-app-user', JSON.stringify(user))
  }, TEST_USER)

  await page.goto('/dashboard')
  await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 10000 })
}

async function createSavingsWallet(page: Page, name: string, balance: number) {
  await page.goto('/wallets')
  await page.getByRole('button', { name: /Add Wallet|Create Wallet/ }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('textbox', { name: 'Name' }).fill(name)
  await page.getByRole('spinbutton', { name: 'Initial Balance' }).fill(String(balance))
  await page.getByRole('checkbox', { name: 'Savings wallet' }).check()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

async function createGoal(page: Page, goalName: string, target: number) {
  await page.goto('/savings')
  await page.getByRole('button', { name: 'Add Goal' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('textbox', { name: 'Goal Name' }).fill(goalName)
  await page.getByRole('spinbutton', { name: 'Target Amount' }).fill(String(target))
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(goalName)).toBeVisible()
}

// Picks a date in the currently-open DatePicker popover by navigating the
// react-day-picker calendar from "today" to the target month and clicking the
// day cell whose data-day attribute matches the locale string for the date.
async function pickDateInOpenPicker(page: Page, target: Date) {
  const today = new Date()
  const targetMonthStart = new Date(target.getFullYear(), target.getMonth(), 1)
  const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthDelta = (targetMonthStart.getFullYear() - todayMonthStart.getFullYear()) * 12
    + (targetMonthStart.getMonth() - todayMonthStart.getMonth())

  const navLabel = monthDelta >= 0 ? /next month/i : /previous month/i
  const navButton = page.getByRole('button', { name: navLabel })
  for (let i = 0; i < Math.abs(monthDelta); i++) {
    await navButton.click()
  }

  const dayLabel = target.toLocaleDateString()
  await page.locator(`button[data-day="${dayLabel}"]`).click()
}

// Opens the deadline DatePicker on the currently-open Goal dialog/form and
// selects the given date.
async function setDeadlineInOpenForm(page: Page, target: Date) {
  await page.getByRole('button', { name: /No deadline|^[A-Z][a-z]{2} \d{1,2}, \d{4}$|Today|Yesterday|Tomorrow/ }).click()
  await pickDateInOpenPicker(page, target)
}

async function openNewTransaction(page: Page) {
  // The new transaction button is the small icon-only button in the sidebar
  const plusButton = page.locator('button[class*="size-8"]')
  await plusButton.click()
  await page.getByRole('dialog').waitFor()
}

async function createIncomeTransaction(page: Page, amount: number) {
  await openNewTransaction(page)
  await page.getByRole('radio', { name: 'Income' }).click()
  await page.getByRole('textbox', { name: /USD|EUR|PLN/ }).fill(String(amount))
  await page.getByRole('button', { name: 'Income' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
}

async function createExpenseTransaction(page: Page, amount: number) {
  await openNewTransaction(page)
  await page.getByRole('radio', { name: 'Expense' }).click()
  await page.getByRole('textbox', { name: /USD|EUR|PLN/ }).fill(String(amount))
  await page.getByRole('button', { name: 'Food & Drink' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
}

test.describe('Savings Feature', () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page)
    await createSavingsWallet(page, 'My Savings', 1000)
    await createGoal(page, 'Vacation Fund', 500)
  })

  test('savings page shows wallet with goal and unallocated amount', async ({ page }) => {
    await page.goto('/savings')
    await expect(page.getByRole('heading', { name: 'My Savings' })).toBeVisible()
    await expect(page.getByText('Vacation Fund')).toBeVisible()
    await expect(page.getByText(/Unallocated:.*\$1,000\.00/)).toBeVisible()
    await expect(page.getByText('$0.00')).toBeVisible()
    await expect(page.getByText('$500.00')).toBeVisible()
  })

  test('allocate button on savings page opens adjust drawer', async ({ page }) => {
    await page.goto('/savings')
    await page.getByRole('button', { name: 'Allocate' }).click()
    await expect(page.getByRole('heading', { name: 'Allocate to Goals' })).toBeVisible()
    await expect(page.getByText(/Distribute.*\$1,000\.00/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()
  })

  test('income to savings wallet shows allocation toast', async ({ page }) => {
    await page.goto('/savings')
    await createIncomeTransaction(page, 200)
    await expect(page.getByText('Savings balance increased')).toBeVisible({ timeout: 5000 })
  })

  test('expense from savings wallet shows deallocation toast when over-allocated', async ({ page }) => {
    await page.goto('/savings')

    // First allocate $500 to the goal via the drawer
    await page.getByRole('button', { name: 'Allocate' }).click()
    const slider = page.locator('[role="slider"]')
    await slider.focus()
    await page.keyboard.press('End')
    await page.getByRole('button', { name: 'Allocate', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Allocate to Goals' })).not.toBeVisible({ timeout: 5000 })

    // Now expense $600 — only $500 unallocated, so $100 deficit
    await createExpenseTransaction(page, 600)
    await expect(page.getByText(/Goals exceed balance/)).toBeVisible({ timeout: 5000 })
  })

  test('mark goal as achieved', async ({ page }) => {
    await page.goto('/savings')
    // The menu trigger is a ghost button with MoreHorizontal icon inside the goal card
    await page.locator('[data-slot="card"]').first().getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Achieved/i }).click()

    await page.getByRole('tab', { name: 'Achieved' }).click()
    await expect(page.getByText('Vacation Fund')).toBeVisible()
  })

  test('delete goal removes it from list', async ({ page }) => {
    await page.goto('/savings')
    await page.locator('[data-slot="card"]').first().getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Delete/i }).click()
    // Confirmation dialog
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('Vacation Fund')).not.toBeVisible({ timeout: 5000 })
  })

  test('goal with deadline shows monthly suggestion', async ({ page }) => {
    // Create a goal with a deadline ~4 calendar months in the future. Pick the
    // 15th of that month to avoid month-end / DST drift, and set time to noon
    // so date(toLocaleDateString) is unambiguous in any timezone.
    const now = new Date()
    const deadline = new Date(now.getFullYear(), now.getMonth() + 4, 15, 12, 0, 0)

    await page.goto('/savings')
    await page.getByRole('button', { name: 'Add Goal' }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('textbox', { name: 'Goal Name' }).fill('Camera Fund')
    await page.getByRole('spinbutton', { name: 'Target Amount' }).fill('1200')
    await setDeadlineInOpenForm(page, deadline)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog', { name: /Create New Goal/ })).not.toBeVisible({ timeout: 5000 })

    const cameraCard = page.locator('[data-slot="card"]').filter({ hasText: 'Camera Fund' })
    await expect(cameraCard).toBeVisible()
    await expect(cameraCard).toContainText(/~?\$\d{2,4}(\.\d{2})?\s*\/\s*month/i)
  })

  test('past deadline shows Overdue badge', async ({ page }) => {
    // Edit the goal seeded in beforeEach ("Vacation Fund") and set a past
    // deadline (~30 days ago) using the DatePicker.
    const past = new Date()
    past.setDate(past.getDate() - 30)

    await page.goto('/savings')
    const vacationCard = page.locator('[data-slot="card"]').filter({ hasText: 'Vacation Fund' })
    await vacationCard.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Edit/i }).click()
    await page.getByRole('dialog').waitFor()
    await setDeadlineInOpenForm(page, past)
    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('dialog', { name: /Edit Goal/ })).not.toBeVisible({ timeout: 5000 })

    const refreshedCard = page.locator('[data-slot="card"]').filter({ hasText: 'Vacation Fund' })
    await expect(refreshedCard).toBeVisible()
    await expect(refreshedCard.getByText('Overdue', { exact: true })).toBeVisible()
  })

  test('Suggest button pre-fills slider values without auto-submitting', async ({ page }) => {
    // beforeEach creates "Vacation Fund" (target $500). Bump it to $600 and
    // give it a deadline ~2 calendar months out — that's our "Goal A".
    // Then create "Goal B" (target $1000) with no deadline.
    const now = new Date()
    const goalADeadline = new Date(now.getFullYear(), now.getMonth() + 2, 15, 12, 0, 0)

    await page.goto('/savings')
    const vacationCard = page.locator('[data-slot="card"]').filter({ hasText: 'Vacation Fund' })
    await vacationCard.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /Edit/i }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('spinbutton', { name: 'Target Amount' }).fill('600')
    await setDeadlineInOpenForm(page, goalADeadline)
    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('dialog', { name: /Edit Goal/ })).not.toBeVisible({ timeout: 5000 })

    // Add Goal B (no deadline).
    await createGoal(page, 'Goal B', 1000)

    // Open the allocate drawer (initial wallet balance is $1000, none allocated).
    await page.goto('/savings')
    await page.getByRole('button', { name: 'Allocate' }).click()
    await expect(page.getByRole('heading', { name: 'Allocate to Goals' })).toBeVisible()

    // Click Suggest.
    await page.getByRole('button', { name: 'Suggest', exact: true }).click()

    // Locate per-goal rows inside the drawer. Each goal renders as a
    // div.flex.flex-col.gap-2 containing the goal name span and a slider.
    const drawer = page.locator('[data-slot="drawer-content"]')
    const goalARow = drawer
      .locator('div.flex.flex-col.gap-2')
      .filter({ has: page.getByText('Vacation Fund', { exact: true }) })
    const goalBRow = drawer
      .locator('div.flex.flex-col.gap-2')
      .filter({ has: page.getByText('Goal B', { exact: true }) })

    // Goal A: $600 target, ~2 months remaining → $300/month suggested.
    await expect(goalARow.locator('span.font-mono')).toHaveText(/\$3\d\d\.\d{2}/)
    // Goal B has no deadline → suggestion is $0.
    await expect(goalBRow.locator('span.font-mono')).toHaveText('$0.00')

    // Drawer must remain open (no auto-submit).
    await expect(page.getByRole('heading', { name: 'Allocate to Goals' })).toBeVisible()

    // Confirm allocation.
    await page.getByRole('button', { name: 'Allocate', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Allocate to Goals' })).not.toBeVisible({ timeout: 5000 })

    // After allocation, Goal A's card (Vacation Fund) should show ~$300 allocated.
    const updatedGoalACard = page.locator('[data-slot="card"]').filter({ hasText: 'Vacation Fund' })
    await expect(updatedGoalACard).toContainText(/\$3\d\d\.\d{2}/)
  })
})
