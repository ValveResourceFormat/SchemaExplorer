import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export function useAnchoredRow(fieldUrlBase: string, name: string, anchored: boolean) {
  const rowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (anchored && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [anchored]);

  const copyAnchorLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const fieldUrl = `${fieldUrlBase}?field=${encodeURIComponent(name)}`;
    const fullUrl = `${window.location.origin}${window.location.pathname}#${fieldUrl}`;
    navigator.clipboard.writeText(fullUrl);
    navigate(fieldUrl, { replace: true });
  };

  return { rowRef, copyAnchorLink };
}
