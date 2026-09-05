// Grouped thousands, because the figures on the overview run to five digits and
// an ungrouped 12480.30 has to be counted rather than read.
const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function normalizeZero(amount: number): number {
  // Rounding a hair below zero prints "-0.00", which reads as a debt.
  return Math.abs(amount) < 0.005 ? 0 : amount
}

export function formatMoney(amount: number): string {
  return moneyFormat.format(normalizeZero(amount))
}

export function formatSignedMoney(amount: number): string {
  const normalized = normalizeZero(amount)
  return normalized > 0 ? `+${moneyFormat.format(normalized)}` : moneyFormat.format(normalized)
}
