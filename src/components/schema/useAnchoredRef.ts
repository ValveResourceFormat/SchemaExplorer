import { useEffect, useRef } from "react";

export function useAnchoredRef<T extends HTMLElement = HTMLDivElement>(anchored: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (anchored && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [anchored]);

  return ref;
}
