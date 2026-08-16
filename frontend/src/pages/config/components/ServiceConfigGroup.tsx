import type { ConfigEntryView } from '@miauflix/backend';
import type { FC } from 'react';
import styled from 'styled-components';

import { ConfigField } from './ConfigField';

const GroupContainer = styled.div`
  background-color: #0c1214;
  border: 1px solid #191e23;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #191e23;
`;

const GroupName = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
`;

const MissingBadge = styled.span`
  font-size: 11px;
  padding: 2px 8px;
  background-color: rgba(219, 32, 44, 0.2);
  color: #db202c;
  border-radius: 4px;
  border: 1px solid rgba(219, 32, 44, 0.4);
`;

interface ServiceConfigGroupProps {
  groupName: string;
  entries: ConfigEntryView[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export const ServiceConfigGroup: FC<ServiceConfigGroupProps> = ({
  groupName,
  entries,
  values,
  onChange,
}) => {
  const missingCount = entries.filter(e => e.required && !e.hasValue).length;

  return (
    <GroupContainer>
      <GroupHeader>
        <GroupName>{groupName}</GroupName>
        {missingCount > 0 && <MissingBadge>{missingCount} missing</MissingBadge>}
      </GroupHeader>

      {entries.map(entry => (
        <ConfigField
          key={entry.key}
          entry={entry}
          value={values[entry.key] ?? ''}
          onChange={onChange}
        />
      ))}
    </GroupContainer>
  );
};
