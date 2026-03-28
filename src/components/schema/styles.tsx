import { Link } from "../Link";
import { styled } from "@linaria/react";

export const CardBlock = styled.div`
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1.6;
`;

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

export const CommonGroupMembers = styled.ul`
  background-color: var(--group-members);
  padding: 10px 12px;
  margin: 0;
  list-style: none;

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

export const DeclarationHeading = styled.h1`
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
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

const sectionBadgeStyles = `
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--text);
  background: var(--group-members);
  border: 1px solid var(--group-border);
  vertical-align: middle;

  > svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 3px;
  }
`;

export const SectionLink = styled(Link)`
  ${sectionBadgeStyles}
  text-decoration: none;
  transition: border-color 0.1s;

  &:hover {
    border-color: var(--highlight);
  }
`;

export const SectionBadge = styled.span`
  ${sectionBadgeStyles}
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

export const AnchorName = styled(Link)`
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--text-dim);
  }
`;
