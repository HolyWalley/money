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
})
