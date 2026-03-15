import styled from "styled-components";

export const ContentWrapper = styled.main`
  flex: 1;
  padding: 0 0 0 24px;
  min-width: 0;
  overflow-y: auto;

  @media (max-width: 768px) {
    grid-column: 1;
    padding: 0;
  }
`;

export const TextMessage = styled.div`
  margin-top: 50px;
  align-self: center;
  font-size: 36px;
  font-weight: 300;
  color: ${(props) => props.theme.textDim};
  text-align: center;

  @media (max-width: 768px) {
    margin-top: 20px;
    font-size: 20px;
  }
`;

export const ListItem = styled.div`
  padding: 5px 14px 5px 0;
`;
