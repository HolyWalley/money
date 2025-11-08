import { useEffect, useState } from "react"

export const useInitiallyLoaded = (isLoading: boolean): boolean => {
  const [initiallyLoaded, setInitiallyLoaded] = useState(false)

  useEffect(() => {
    if (initiallyLoaded || isLoading) {
      return
    }

    setInitiallyLoaded(true)
  }, [initiallyLoaded, isLoading])

  return initiallyLoaded
}
