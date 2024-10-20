import { FC } from 'react';

export const UserIcon: FC<{ color?: string; size?: number }> = ({
  color = 'inherit',
  size = 48,
}) => {
  return (
    <svg
      height={`${size}px`}
      viewBox="0 -960 960 960"
      width={`${size}px`}
      fill={color}
    >
      <path d="M480-492.92q-57.92 0-95.31-37.39-37.38-37.38-37.38-95.3 0-58.31 37.38-95.5 37.39-37.2 95.31-37.2t95.31 37.2q37.38 37.19 37.38 95.5 0 57.92-37.38 95.3-37.39 37.39-95.31 37.39ZM180-233.85v-29.77q0-32.23 17.08-56.15t44.38-36.77q63.16-28.07 121.77-42.31 58.62-14.23 116.77-14.23t116.46 14.54q58.31 14.54 121.46 42 27.92 12.85 45 36.77T780-263.62v29.77q0 19.23-13.46 32.69-13.46 13.47-32.69 13.47h-507.7q-19.23 0-32.69-13.47Q180-214.62 180-233.85Z" />
    </svg>
  );
};
