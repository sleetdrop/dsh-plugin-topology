import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Close a popover when the pointer presses outside its root element.
 * Local implementation: the plugin keeps its own dismiss hook.
 * @param ref - root element the interaction belongs to.
 * @param open - whether the popover is currently open.
 * @param setOpen - close state setter.
 */
export function useDismissOnOutsidePointer(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      const root = ref.current
      if (root === null) return
      if (event.target instanceof Node && !root.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('pointerdown', onDown) }
  }, [ref, open, setOpen])
}
