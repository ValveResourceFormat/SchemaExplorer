import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { styled } from "@linaria/react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useTransitionStyles,
} from "@floating-ui/react";

/**
 * Tooltips are data attributes, one host shows them for the whole page. An element with
 * `data-tip` shows that text, one with `data-tip-kind` gets its content from the renderer
 * registered for the kind. `data-tip-accent` tints the panel with a CSS color, so it reads
 * as belonging to a colored badge
 */
export function tip(text: string, accent?: string) {
  return { "data-tip": text, "data-tip-accent": accent };
}

type Renderer = (el: HTMLElement) => ReactNode;
const renderers = new Map<string, Renderer>();

/** Content for the elements with data-tip-kind={kind}, read from their data attributes */
export function registerTooltip(kind: string, render: Renderer) {
  renderers.set(kind, render);
}

const SELECTOR = "[data-tip], [data-tip-kind]";
const OPEN_DELAY = 600;

function tooltipContent(el: HTMLElement): ReactNode {
  const { tipKind, tip: text } = el.dataset;
  return tipKind ? renderers.get(tipKind)?.(el) : text;
}

/** Shows the tooltip of whatever is hovered or focused with the keyboard, mounted once */
export function TooltipHost() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    // top/left instead of the default translate transform, which would otherwise
    // collide with (and get overwritten by) the transition's own transform below
    transform: false,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 120,
    initial: { opacity: 0, transform: "translateY(2px)" },
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let shown = false;

    const show = (el: HTMLElement, delay: number) => {
      clearTimeout(timer);
      current = el;
      timer = setTimeout(() => {
        if (!tooltipContent(el)) return;
        refs.setReference(el);
        setTarget(el);
        setOpen(true);
        shown = true;
      }, delay);
    };
    const hide = () => {
      clearTimeout(timer);
      current = null;
      shown = false;
      setOpen(false);
    };
    const find = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>(SELECTOR) : null;

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = find(e.target);
      if (el === current) return;
      if (!el) return hide();
      // Moving from one tooltip to the next while one is open switches right away
      show(el, shown ? 0 : OPEN_DELAY);
    };
    const onLeaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && e.target instanceof Element && e.target.matches(":focus-visible")) show(el, 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onLeaveWindow);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onLeaveWindow);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [refs]);

  // Screen readers read the tooltip as the element's description
  useEffect(() => {
    if (!open || !target) return;
    target.setAttribute("aria-describedby", id);
    return () => target.removeAttribute("aria-describedby");
  }, [open, target, id]);

  const content = target && tooltipContent(target);
  if (!isMounted || !content) return null;

  const accent = target.dataset.tipAccent;
  return (
    <FloatingPortal>
      <TooltipPanel
        ref={refs.setFloating}
        id={id}
        role="tooltip"
        style={
          {
            ...floatingStyles,
            ...transitionStyles,
            ...(accent ? { "--accent": accent } : {}),
          } as CSSProperties
        }
      >
        {content}
      </TooltipPanel>
    </FloatingPortal>
  );
}

const TooltipPanel = styled.div`
  z-index: 1000;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent, var(--group-border)) 40%, var(--group-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, var(--group-border)) 8%, var(--group));
  box-shadow: var(--group-shadow);
  color: var(--text);
  font:
    13px/1.45 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
  white-space: pre-line;
  pointer-events: none;
`;
