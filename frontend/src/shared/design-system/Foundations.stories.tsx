import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import {
  color,
  controlSize,
  controlSizes,
  duration,
  easing,
  fontFamily,
  layer,
  radius,
  space,
  typeScale,
} from './tokens';

const meta = {
  title: 'Design System/Foundations',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Foundation tokens from docs/plans/style-guide.md. Every size is in rem, so the density toolbar (web 16px, TV 1080p 24px root) scales the whole set.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const text: CSSProperties = {
  fontFamily,
  color: color.text,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
};
const caption: CSSProperties = {
  ...text,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  color: color.textSecondary,
};
const heading: CSSProperties = {
  ...text,
  ...typeScale.heading,
  margin: `${space.xl} 0 ${space.md}`,
};
const cell: CSSProperties = {
  display: 'inline-block',
  verticalAlign: 'top',
  margin: `0 ${space.md} ${space.md} 0`,
};

export const Palette: Story = {
  render: () => (
    <div>
      {Object.entries(color).map(([name, value]) => (
        <div key={name} style={{ ...cell, width: '9rem' }}>
          <div
            style={{
              height: '4rem',
              borderRadius: radius.md,
              border: `1px solid ${color.borderSubtle}`,
              background: value,
            }}
          />
          <div style={{ ...text, marginTop: space.xs }}>{name}</div>
          <div style={caption}>{value}</div>
        </div>
      ))}
    </div>
  ),
};

export const TypeScale: Story = {
  render: () => (
    <div>
      {Object.entries(typeScale).map(([role, values]) => (
        <div key={role} style={{ marginBottom: space.md }}>
          <div style={caption}>
            {role} · {values.fontSize} / {values.lineHeight} / {values.fontWeight}
          </div>
          <div style={{ ...text, ...values }}>Sentence case, never uppercase</div>
        </div>
      ))}
    </div>
  ),
};

export const SpacingAndShape: Story = {
  render: () => (
    <div>
      <h3 style={heading}>Spacing</h3>
      {Object.entries(space).map(([name, value]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', marginBottom: space.xs }}>
          <span style={{ ...caption, width: '6rem' }}>
            {name} · {value}
          </span>
          <span style={{ width: value, height: space.md, background: color.textSecondary }} />
        </div>
      ))}
      <h3 style={heading}>Shape</h3>
      {Object.entries(radius).map(([name, value]) => (
        <div key={name} style={cell}>
          <div
            style={{
              width: '6rem',
              height: '4rem',
              borderRadius: value,
              background: color.surfaceRaised,
            }}
          />
          <div style={caption}>
            {name} · {value}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const ControlSizes: Story = {
  render: () => (
    <div>
      {controlSizes.map(size => {
        const values = controlSize[size];
        return (
          <div key={size} style={cell}>
            <div
              style={{
                height: values.height,
                width: '10rem',
                borderRadius: radius.full,
                background: color.actionTranslucent,
              }}
            />
            <div style={caption}>
              {size} · height {values.height} · icon {values.icon} · {values.text}
            </div>
          </div>
        );
      })}
    </div>
  ),
};

export const MotionAndLayers: Story = {
  render: () => (
    <div style={text}>
      <h3 style={heading}>Motion</h3>
      {Object.entries(duration).map(([name, value]) => (
        <div key={name} style={caption}>
          {name}: {value}
        </div>
      ))}
      {Object.entries(easing).map(([name, value]) => (
        <div key={name} style={caption}>
          easing {name}: {value}
        </div>
      ))}
      <h3 style={heading}>Layers</h3>
      {Object.entries(layer).map(([name, value]) => (
        <div key={name} style={caption}>
          {name}: {value}
        </div>
      ))}
    </div>
  ),
};
