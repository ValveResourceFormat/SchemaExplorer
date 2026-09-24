import { useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { styled } from "@linaria/react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";

/**
 * Reference props for a hover/focus tooltip, and the floating panel to render
 * alongside the trigger. Returns `null` content when there's nothing to show,
 * so callers can skip wrapping elements that have no description.
 *
 * `accent`, when given, tints the panel's border and background with that CSS
 * color so the tooltip reads as belonging to whatever it's attached to (e.g. a
 * colored badge), instead of a plain generic box.
 */
export function useTooltip(content: ReactNode | undefined, accent?: string) {
  const [open, setOpen] = useState(false);
  const enabled = content != null;

  const { refs, floatingStyles, context } = useFloating({
    open: enabled && open,
    onOpenChange: setOpen,
    placement: "top",
    // top/left instead of the default translate transform, which would otherwise
    // collide with (and get overwritten by) the transition's own transform below
    transform: false,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { move: false, delay: { open: 600, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 120,
    initial: { opacity: 0, transform: "translateY(2px)" },
  });

  if (!enabled) return { referenceProps: {}, tooltip: null };

  const referenceProps = getReferenceProps({
    ref: refs.setReference,
    tabIndex: 0,
  }) as ComponentProps<"span"> & ComponentProps<"button">;

  const style: CSSProperties = {
    ...floatingStyles,
    ...transitionStyles,
    ...(accent ? ({ "--accent": accent } as CSSProperties) : {}),
  };

  const tooltip = isMounted ? (
    <FloatingPortal>
      <TooltipPanel ref={refs.setFloating} style={style} {...getFloatingProps()}>
        {content}
      </TooltipPanel>
    </FloatingPortal>
  ) : null;

  return { referenceProps, tooltip };
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
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  white-space: pre-line;
  pointer-events: none;
`;
