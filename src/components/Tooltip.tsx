import { useState, type ComponentProps } from "react";
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
 */
export function useTooltip(content: string | undefined) {
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

  const hover = useHover(context, { move: false, delay: { open: 300, close: 0 } });
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

  const tooltip = isMounted ? (
    <FloatingPortal>
      <TooltipPanel
        ref={refs.setFloating}
        style={{ ...floatingStyles, ...transitionStyles }}
        {...getFloatingProps()}
      >
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
  border-radius: 8px;
  border: 1px solid var(--group-border);
  background: var(--group);
  box-shadow: var(--group-shadow);
  color: var(--text);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  white-space: pre-line;
  pointer-events: none;
`;
