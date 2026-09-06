import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * What a boundary shows for data that could not be read. The way out is a
 * reload, not a reset: a store keeps its rejection for RETRY_AFTER_ERROR_MS,
 * so rendering the same read again would only show this again.
 */
export function ReadFailure({ title }: { title: string }) {
  return (
    <>
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>Its data did not answer. Reloading asks again.</AlertDescription>
      </Alert>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </>
  )
}
