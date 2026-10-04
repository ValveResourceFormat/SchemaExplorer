import type { ReactNode } from "react";
import { styled } from "@linaria/react";
import { keepInPlace } from "../../utils/keep-in-place";
import { KindIcon, type IconKind } from "../kind-icon/KindIcon";

/** Frames the buttons of a card's switch or filter */
const Segmented = styled.fieldset`
  display: inline-flex;
  gap: 2px;
  min-width: 0;
  margin: 0;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--group-border);
  background: var(--group-members);
`;

const SegmentButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--text-dim);
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  &[aria-pressed="true"] {
    background: var(--group);
    color: var(--text);
    box-shadow:
      0 0 0 1px var(--group-border),
      0 1px 2px #0000001a;
  }
`;

/** A filter that's on or off, like only the networked fields */
export function FilterToggle({
  pressed,
  onChange,
  icon,
  children,
}: {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  icon: IconKind;
  children: ReactNode;
}) {
  return (
    <Segmented>
      <SegmentButton
        aria-pressed={pressed}
        onClick={(e) => keepInPlace(e.currentTarget, () => onChange(!pressed))}
      >
        <KindIcon kind={icon} size={14} />
        {children}
      </SegmentButton>
    </Segmented>
  );
}

export function InheritedSwitch({
  showInherited,
  onChange,
  label,
}: {
  showInherited: boolean;
  onChange: (showInherited: boolean) => void;
  /** What the switch is for, like "Fields" */
  label: string;
}) {
  return (
    <Segmented aria-label={`${label} to show`}>
      <SegmentButton
        aria-pressed={!showInherited}
        onClick={(e) => keepInPlace(e.currentTarget, () => onChange(false))}
      >
        Declared here
      </SegmentButton>
      <SegmentButton
        aria-pressed={showInherited}
        onClick={(e) => keepInPlace(e.currentTarget, () => onChange(true))}
      >
        With inherited
      </SegmentButton>
    </Segmented>
  );
}
