import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Loader2, Search, TriangleAlert } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSymbolCandidates } from '@/hooks/useSymbolCandidates'
import { investmentService } from '@/services/investmentService'
import { formatPrice } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { RankedCandidate } from '../../../shared/market-data'
import type { Instrument } from '../../../shared/schemas/instrument.schema'

export interface SymbolPickerProps {
  /** The instrument whose price feed is unresolved. */
  instrument: Instrument
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The symbol the user confirmed, e.g. 'FWIA.DE', AFTER it has been saved.
   *
   * This is a notification, not a request: the picker writes the symbol itself,
   * because a save that fails has to be reported inside the drawer rather than
   * behind it. A parent that saves again on this callback writes the same value
   * to the CRDT twice.
   */
  onResolve: (symbol: string) => void
  /**
   * A price the instrument actually traded at, for ranking the candidates -
   * see rankCandidatesByTradePrice, which is the only thing that separates a
   * London USD listing from the Xetra EUR one behind the same ISIN.
   *
   * It must be a per-share executed price paired with THAT trade's own date -
   * `trade.price` and `trade.date`. An average cost dated today is neither: the
   * closes fetched would be today's, the comparison would be meaningless, and
   * the drawer would tell the user they paid that price on a day they did not
   * trade.
   */
  reference?: {
    price: number
    /** ISO 8601 date of the trade the price came from. */
    date: string
  }
}

/**
 * Formatted from the calendar parts rather than the instant, so a trade dated
 * 2026-03-12 does not read as the 11th west of Greenwich.
 */
function formatTradeDate(iso: string): string {
  const [year, month, day] = iso.split('T')[0].split('-').map(Number)
  if (!year || !month || !day) return iso
  return format(new Date(year, month - 1, day), 'MMM d, yyyy')
}

function formatDeviation(deviation: number): string {
  return `${(deviation * 100).toFixed(1)}%`
}

function describeListing(candidate: RankedCandidate): string {
  return [candidate.exchange, candidate.currency].filter(Boolean).join(' · ')
}

/**
 * Confirms which listing an instrument actually is, before anything is priced
 * from it.
 *
 * Searching by ISIN answers with SOME listing of the security: the same ISIN
 * returns a London USD line where the holding is the Xetra EUR one, and the two
 * differ by a whole FX rate. Picking the wrong one misprices the holding for as
 * long as it is held, and nothing later in the app can tell. So the price the
 * user actually paid orders the candidates, the deviation from it is shown on
 * every row, and a person still confirms - the ranking is advice, and the
 * listing it recommends can always be overruled.
 */
export function SymbolPicker({ instrument, open, onOpenChange, onResolve, reference }: SymbolPickerProps) {
  const { query, setQuery, candidates, isRanked, isLoading, error, retry } = useSymbolCandidates({
    instrument,
    reference,
    enabled: open,
  })

  const [chosen, setChosen] = useState<string | null>(null)
  const [manualSymbol, setManualSymbol] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Cleared on each opening, not only when the instrument changes: reopening
  // after a cancelled attempt otherwise brings back the half-typed symbol and
  // the error from last time, neither of which describes anything current.
  // Keyed on the id rather than the record, which the parent rebuilds on every
  // render.
  useEffect(() => {
    if (!open) return
    setChosen(null)
    setManualSymbol('')
    setSaveError(null)
  }, [instrument._id, open])

  // A confident match is one tap from done - it stands as the selection, and
  // the footer button names it. Derived rather than pushed into state on
  // arrival, so a late-arriving close cannot silently move a selection the user
  // has already made, and a choice that a new search dropped cannot be saved.
  const recommended = candidates[0]?.matches ? candidates[0].symbol : null
  const stillListed = chosen !== null && candidates.some(candidate => candidate.symbol === chosen)
  const selected = stillListed ? chosen : recommended

  const identity = [instrument.isin, instrument.ticker].filter(Boolean).join(' · ')

  const resolve = async (symbol: string) => {
    const confirmed = symbol.trim()
    if (!confirmed || isSaving) return

    setIsSaving(true)
    setSaveError(null)

    try {
      await investmentService.updateInstrument(instrument._id, { symbol: confirmed })
      onResolve(confirmed)
      onOpenChange(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the symbol')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="[--drawer-inset:0.5rem] [--bleed:0px] rounded-xl">
        <div className="mx-auto w-full">
          <DrawerHeader>
            <DrawerTitle>Find the price feed</DrawerTitle>
            <DrawerDescription>
              {instrument.name}
              {identity && <span className="text-muted-foreground/80"> · {identity}</span>}
            </DrawerDescription>
          </DrawerHeader>

          {/* One scroll region for everything between header and footer, the
              way GoalDrawer does it. A list that scrolls inside a body that
              cannot still adds its height to the popup, and the popup is capped
              at 100dvh-6rem with overflow hidden - four listings on a phone was
              enough to push the Use button off the bottom with no way to reach
              it. */}
          <div className="max-h-[45vh] space-y-3 overflow-y-auto px-4 pb-1 group-data-[swipe-direction=right]/drawer-popup:max-h-[calc(100dvh-16rem)]">
            {reference ? (
              <p className="text-muted-foreground text-xs">
                You paid{' '}
                <span className="text-foreground font-medium">
                  {formatPrice(reference.price)} {instrument.currency}
                </span>{' '}
                per share on {formatTradeDate(reference.date)}. The listing whose close that day agrees with
                it is the one you hold.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                No trade to compare a price against, so these are search results in the provider&apos;s own
                order. Check the exchange and currency match what you hold.
              </p>
            )}

            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                aria-label="Search listings"
                placeholder="Search by ISIN, ticker or name"
                className="h-9 pl-8"
              />
            </div>

            <div className="space-y-2">
              {error ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>{error}</AlertTitle>
                  <AlertDescription>
                    Nothing was saved. You can try the search again, or enter the symbol yourself below.
                  </AlertDescription>
                  <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={retry}>
                    Try again
                  </Button>
                </Alert>
              ) : candidates.length === 0 && isLoading ? (
                <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Looking up listings...
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-muted-foreground py-6 text-sm">
                  No listing matched that search. Try the ticker instead, or enter the symbol yourself below.
                </p>
              ) : (
                candidates.map(candidate => {
                  const isSelected = selected === candidate.symbol

                  return (
                    <button
                      key={candidate.symbol}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setChosen(candidate.symbol)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{candidate.symbol}</span>
                          {candidate.matches && (
                            <Badge variant="secondary">
                              <Check aria-hidden="true" />
                              Matches what you paid
                            </Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">{candidate.name}</span>
                        <span className="text-muted-foreground block text-xs">{describeListing(candidate)}</span>
                      </span>

                      <span className="shrink-0 text-right text-xs">
                        {candidate.close === null ? (
                          <span className="text-muted-foreground">No close that day</span>
                        ) : (
                          <>
                            <span className="block font-medium">
                              {formatPrice(candidate.close)} {candidate.currency}
                            </span>
                            {candidate.deviation !== null && (
                              <span className={cn('block', candidate.matches ? 'text-primary' : 'text-muted-foreground')}>
                                {formatDeviation(candidate.deviation)} off
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Beside the list rather than instead of it: replacing the rows on
                every keystroke leaves the picker blank more often than not. */}
            {!error && isLoading && candidates.length > 0 && (
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Checking prices...
              </p>
            )}

            {!error && !isLoading && candidates.length > 0 && !isRanked && reference && (
              <p className="text-muted-foreground text-xs">
                No closes came back for that day, so this is the provider&apos;s own order rather than a
                comparison with what you paid.
              </p>
            )}

            <div className="border-border space-y-1.5 border-t pt-3">
              <Label htmlFor="manual-symbol" className="text-xs font-normal">
                Not listed? Enter the feed symbol
              </Label>
              <div className="flex gap-2">
                <Input
                  id="manual-symbol"
                  value={manualSymbol}
                  onChange={event => setManualSymbol(event.target.value)}
                  placeholder="e.g. FWIA.DE"
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={!manualSymbol.trim() || isSaving}
                  // Feeds quote symbols in upper case, and a typed 'fwia.de'
                  // would simply never price.
                  onClick={() => resolve(manualSymbol.toUpperCase())}
                >
                  Use
                </Button>
              </div>
            </div>
          </div>

          <DrawerFooter>
            {/* Beside the buttons rather than in the scrolling body: a failure
                reported where the user is not looking reads as nothing having
                happened at all. */}
            {saveError && <p className="text-destructive text-sm">{saveError}</p>}
            <Button
              type="button"
              size="lg"
              disabled={!selected || isSaving}
              onClick={() => selected && resolve(selected)}
            >
              {isSaving ? 'Saving...' : selected ? `Use ${selected}` : 'Select a listing'}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
