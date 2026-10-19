import { styled } from "@linaria/react";
import { hover } from "../interaction-styles";

const Button = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-dim);
  font: inherit;
  font-size: 14px;
  cursor: pointer;

  ${hover("color: var(--highlight);")}
`;

/** Asks for the rest of a list that was cut short, `count` being all of it */
export function ShowAllButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick}>
      Show all {count.toLocaleString("en-US")}
    </Button>
  );
}
