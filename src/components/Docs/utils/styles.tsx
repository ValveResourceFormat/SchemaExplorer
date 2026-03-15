import { Link } from "react-router-dom";
import styled from "styled-components";

export const CommonGroupWrapper = styled.div`
  display: flex;
  flex-flow: column;
  background-color: ${(props) => props.theme.group};
  border: 1px solid ${(props) => props.theme.groupBorder};
  border-radius: 10px;
  box-shadow: ${(props) => props.theme.groupShadow};
  overflow: hidden;
  word-break: break-all;
`;

export const CommonGroupMembers = styled.div`
  background-color: ${(props) => props.theme.groupMembers};
  padding: 10px 12px;

  > :not(:last-child) {
    margin-bottom: 4px;
  }
`;

export const CommonGroupHeader = styled.div`
  display: flex;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

export const CommonGroupSignature = styled.div`
  flex: 1;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 4px;
`;

export const DeclarationHeader = styled(CommonGroupHeader)`
  padding: 12px 14px;
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
  border-top: 1px solid ${(props) => props.theme.groupSeparator};
`;

export const SectionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${(props) => props.theme.textDim};
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
  color: ${(props) => props.theme.text};
  background: ${(props) => props.theme.groupMembers};
  border: 1px solid ${(props) => props.theme.groupBorder};
  transition: border-color 0.1s;

  &:hover {
    border-color: ${(props) => props.theme.highlight};
  }
`;

export const CollapsedItemsLink = styled(Link)`
  display: block;
  padding: 4px 8px;
  font-size: 14px;
  color: ${(props) => props.theme.textDim};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
