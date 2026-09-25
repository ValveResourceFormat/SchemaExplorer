import { styled } from "@linaria/react";
import { keepInPlace } from "../../utils/keep-in-place";

/** Switch between a declaration's own members and all of them */
const Segmented = styled.fieldset`
  display: inline-flex;
  gap: 2px;
  min-width: 0;
  margin: 0 0 0 auto;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--group-border);
  background: var(--group-members);
`;

const SegmentButton = styled.button`
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
