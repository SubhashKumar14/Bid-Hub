import { useEffect, useState } from "react";
export function useCapabilities() {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/capabilities", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setValue).catch(() => {});
    return () => controller.abort();
  }, []);
  return value;
}
