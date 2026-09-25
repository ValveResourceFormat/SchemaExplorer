import { styled } from "@linaria/react";
import { KindIcon } from "../kind-icon/KindIcon";

/** The kind of a row, in front of its name */
export const RowIcon = styled(KindIcon)`
  flex-shrink: 0;
  margin-right: 8px;
  vertical-align: -3px;
`;
