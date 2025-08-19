import React from 'react';

// Mock component for all icons
const IconMock: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg {...props} data-testid="mock-icon">
    Mock Icon
  </svg>
);

export default IconMock;
