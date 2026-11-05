import type { UserRole } from '@miauflix/backend';
import type { SessionInfo } from '@store/slices/auth';

const profile = (
  session: string,
  id: string,
  displayName: string,
  avatar: Record<string, string | boolean>,
  role: 'admin' | 'user' = 'user'
): SessionInfo => ({
  session,
  user: {
    id,
    email: `${displayName.toLowerCase()}@example.com`,
    displayName,
    role: role as UserRole,
    avatar,
    avatarVersion: null,
  },
});

/** The three profiles from the Who's watching mockup. */
export const profilesFixture: SessionInfo[] = [
  profile(
    'session-maurizio',
    '1f6b5f0e-0000-4000-8000-000000000001',
    'Maurizio',
    {
      kind: 'pill',
      color: '#a65ce8',
      fabric: 'shaggy',
      eyes: 'dot',
      mouth: 'none',
      cheeks: true,
      moustache: 'curly',
      hat: 'cowboy',
      pin: 'flower',
    },
    'admin'
  ),
  profile('session-alex', '1f6b5f0e-0000-4000-8000-000000000002', 'Alex', {
    kind: 'squircle',
    color: '#3fb8ad',
    fabric: 'plush',
    eyes: 'dot',
    mouth: 'smile',
    cheeks: true,
    glasses: 'round',
  }),
  profile('session-sam', '1f6b5f0e-0000-4000-8000-000000000003', 'Sam', {
    kind: 'circle',
    color: '#f47c68',
    fabric: 'plush',
    eyes: 'dot',
    mouth: 'open',
    cheeks: true,
    pin: 'flower',
  }),
];
