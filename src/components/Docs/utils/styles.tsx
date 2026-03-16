import { Link } from "react-router-dom";
import { styled } from "@linaria/react";

export const CommonGroupWrapper = styled.div`
  display: flex;
  flex-flow: column;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  box-shadow: var(--group-shadow);
  overflow: hidden;
  word-break: break-all;
`;

export const CommonGroupMembers = styled.div`
  background-color: var(--group-members);
  padding: 10px 12px;

  > :not(:last-child) {
    margin-bottom: 4px;
  }
`;

export const CommonGroupSignature = styled.div`
  flex: 1;
  font-weight: 600;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 4px;
`;

export const DeclarationHeader = styled.div`
  display: flex;
  padding: 12px 14px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

export const DeclarationNameLink = styled(Link)`
  font-size: 24px;
  font-weight: 700;
  text-decoration: none;
  color: inherit;

  &:hover {
    text-decoration: underline;
  }
`;

export const SectionWrapper = styled.div`
  padding: 10px 14px;
  border-top: 1px solid var(--group-separator);
`;

export const SectionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  margin-bottom: 6px;
`;

export const SectionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

export const SectionLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 14px;
  text-decoration: none;
  color: var(--text);
  background: var(--group-members);
  border: 1px solid var(--group-border);
  transition: border-color 0.1s;

  &:hover {
    border-color: var(--highlight);
  }
`;

export const SectionToggle = styled.button`
  background: none;
  border: none;
  font: inherit;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;

  &:hover {
    color: var(--text);
  }
`;

export const GridIcon = styled.div`
  grid-column: 1;
  grid-row: 1 / -1;
`;

export const GridContent = styled.div`
  grid-column: 2;
  min-width: 0;
`;

export const MemberSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
`;

export const AnchorName = styled.span`
  cursor: pointer;

  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--text-dim);
  }
`;

export const CollapsedItemsLink = styled(Link)`
  display: block;
  padding: 4px 8px;
  font-size: 14px;
  color: var(--text-dim);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
