import { useEffect, useRef } from "react";

export function useAnchoredRef(anchored: boolean) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (anchored && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [anchored]);

  return ref;
}
