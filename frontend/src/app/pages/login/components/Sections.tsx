import styled from 'styled-components';

export const LoginSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;

  @media (min-width: 720px) {
    background-color: #0c1214;
    border: 1px solid #191e23;
    border-radius: 16px;
    min-height: 370px;
    padding: 16px;
  }

  @media (max-width: 720px) {
    width: 100%;
  }
`;

export const SectionTitle = styled.h2`
  font-size: 24px;
  font-weight: 400;
  margin: 0 0 20px 0;
  text-align: center;
  color: #ffffff;
`;
