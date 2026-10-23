import { useRef } from "react";
export function useFocusReturn(onOpenAutoFocus, onCloseAutoFocus) {
  const previous = useRef(null);
  return {
    onOpenAutoFocus(event) { previous.current = document.activeElement; onOpenAutoFocus?.(event); },
    onCloseAutoFocus(event) {
      onCloseAutoFocus?.(event);
      if (!event.defaultPrevented && previous.current?.isConnected) { event.preventDefault(); previous.current.focus(); }
    },
  };
}
