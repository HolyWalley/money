import { useEffect, useRef } from 'react'
import { eventBus, type EventMap } from '@/lib/event-bus'

export function useEventBus<K extends keyof EventMap>(
  event: K,
  handler: EventMap[K],
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapper = ((...args: Parameters<EventMap[K]>) => {
      ;(handlerRef.current as (...args: Parameters<EventMap[K]>) => void)(...args)
    }) as EventMap[K]

    return eventBus.on(event, wrapper)
  }, [event])
}
