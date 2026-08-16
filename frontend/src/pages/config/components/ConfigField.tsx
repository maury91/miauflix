import type { ConfigEntryView } from '@miauflix/backend';
import type { FC } from 'react';
import styled from 'styled-components';

const FieldWrapper = styled.div<{ $hasError?: boolean }>`
  margin-bottom: 20px;
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

const FieldKey = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #cccccc;
  font-family: 'Courier New', monospace;
`;

const RequiredBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: #db202c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const AlreadyConfiguredBadge = styled.span`
  font-size: 10px;
  color: #4caf50;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const FieldDescription = styled.p`
  font-size: 12px;
  color: #888;
  margin: 0 0 6px 0;
  line-height: 1.4;
`;

const FieldLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #db202c;
  text-decoration: none;
  margin-bottom: 6px;

  &:hover {
    text-decoration: underline;
  }
`;

const FieldExample = styled.p`
  font-size: 11px;
  color: #666;
  margin: 0 0 6px 0;
  font-family: 'Courier New', monospace;
`;

const FieldInput = styled.input<{ $missing?: boolean }>`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${props => (props.$missing ? '#db202c' : '#444')};
  border-radius: 4px;
  background-color: #1a1d20;
  color: white;
  font-size: 13px;
  font-family: 'Poppins', sans-serif;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${props => (props.$missing ? '#db202c' : '#db202c')};
  }

  &::placeholder {
    color: #555;
  }
`;

interface ConfigFieldProps {
  entry: ConfigEntryView;
  value: string;
  onChange: (key: string, value: string) => void;
}

export const ConfigField: FC<ConfigFieldProps> = ({ entry, value, onChange }) => {
  const isMissingRequired = entry.required && !entry.hasValue;

  return (
    <FieldWrapper>
      <FieldHeader>
        <FieldKey htmlFor={entry.key}>{entry.key}</FieldKey>
        {entry.required && !entry.hasValue && <RequiredBadge>required</RequiredBadge>}
        {entry.hasValue && <AlreadyConfiguredBadge>✓ configured</AlreadyConfiguredBadge>}
      </FieldHeader>

      <FieldDescription>{entry.description}</FieldDescription>

      {entry.link && (
        <FieldLink href={entry.link} target="_blank" rel="noopener noreferrer">
          ↗ Get this value
        </FieldLink>
      )}

      {entry.example && <FieldExample>Example: {entry.example}</FieldExample>}

      <FieldInput
        id={entry.key}
        type={entry.isSecret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(entry.key, e.target.value)}
        placeholder={
          entry.isSecret && entry.hasValue
            ? 'Leave blank to keep current value'
            : entry.example
              ? `e.g. ${entry.example}`
              : ''
        }
        $missing={isMissingRequired}
        autoComplete={entry.isSecret ? 'new-password' : 'off'}
      />
    </FieldWrapper>
  );
};
