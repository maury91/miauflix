import {
  useCreateProfileMutation,
  useUpdateProfileMutation,
} from '@features/profiles/api/profiles.api';
import { lookFor, type PlushieLook, randomLook, toAvatar } from '@features/profiles/avatar/look';
import { PlushieLive } from '@features/profiles/avatar/PlushieLive';
import { renderPlushieSnapshot } from '@features/profiles/avatar/snapshot';
import {
  AccessoryControls,
  ColorPicker,
  FabricPicker,
  FaceControls,
  FineTuneControls,
  ShapePicker,
} from '@features/profiles/ui/LookControls';
import {
  type Direction,
  focusFirst,
  moveFocus,
  NAV_ATTRIBUTE,
  NAV_REGION_ATTRIBUTE,
} from '@features/profiles/ui/spatialFocus';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Alert, Button, FieldLabel, Input } from '@shared/ui';
import { BackRail } from '@shared/ui/rail/BackRail';
import { RAIL_COLLAPSED_WIDTH_CSS } from '@shared/ui/rail/rail.styles';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { useAppSelector } from '@store/hooks';
import { selectAdminSession, type SessionInfo } from '@store/slices/auth';
import { motion } from 'framer-motion';
import {
  type FC,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import ChevronIcon from '~icons/mdi/chevron-down';

const Page = styled(motion.main)`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.25fr);
  gap: 4vw;
  /* Clear of the back rail, as the other inner pages are. */
  padding: 11vh 6vw 4vh calc(${RAIL_COLLAPSED_WIDTH_CSS} + 2.4vw);
  background: #0a0d0f;
  color: #f5f5f5;
  font-family: 'Poppins', sans-serif;
  overflow: hidden;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    overflow: auto;
    padding: 90px 1.25rem 2rem calc(${RAIL_COLLAPSED_WIDTH_CSS} + 1.25rem);
  }
`;

const Preview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  min-height: 0;
`;

const Heading = styled.h1`
  display: flex;
  align-items: center;
  gap: 1.25rem;
  align-self: flex-start;
  margin: 0;
  font-size: clamp(1.8rem, 3.2vw, 4rem);
  font-weight: 600;
  text-transform: none;
`;

/* As wide as 52vh or the column, whichever is less; square without aspect-ratio or min()
   (neither exists on the 2020 TVs): the inner padding is a share of this width. */
const Stage = styled.div`
  flex-shrink: 0;
  width: 52vh;
  max-width: 100%;
`;

const StageSquare = styled.div`
  position: relative;
  padding-bottom: 100%;
`;

const StageFill = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem 0.75rem 1rem 0.25rem;
`;

const Fields = styled.div`
  display: grid;
  gap: 1rem;

  label {
    font-size: clamp(0.95rem, 1.2vw, 1.45rem);
    font-weight: 600;
  }

  input {
    font-size: clamp(1rem, 1.5vw, 1.8rem);
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: clamp(0.5rem, 2vw, 2.5rem);
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
`;

const Tab = styled.button<{ $selected: boolean }>`
  padding: 0.6rem 0.4rem 0.8rem;
  border: 0;
  border-bottom: 4px solid ${({ $selected }) => ($selected ? '#e50914' : 'transparent')};
  background: none;
  color: ${({ $selected }) => ($selected ? '#ffffff' : 'rgba(255, 255, 255, 0.65)')};
  font:
    500 clamp(1rem, 1.3vw, 1.6rem) 'Poppins',
    sans-serif;
  cursor: pointer;

  &:focus {
    outline: none;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 8px 8px 0 0;
    /* A ring like the other controls': the tint alone hardly shows on the dark page. */
    box-shadow: inset 0 0 0 3px #ffffff;
  }
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Disclosure = styled.button<{ $open: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  background: none;
  color: inherit;
  font:
    500 clamp(1rem, 1.25vw, 1.5rem) 'Poppins',
    sans-serif;
  cursor: pointer;

  svg {
    transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
    transition: transform 0.2s ease;
  }

  &:focus {
    outline: 3px solid #ffffff;
    border-radius: 6px;
  }
`;

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding-top: 0.5rem;
`;

type TabId = 'shape' | 'color' | 'face' | 'accessories';
const TABS: { id: TabId; label: string }[] = [
  { id: 'shape', label: 'Shape' },
  { id: 'color', label: 'Color & fabric' },
  { id: 'face', label: 'Face' },
  { id: 'accessories', label: 'Accessories' },
];

const MIN_PASSWORD_LENGTH = 8;

export interface ProfileEditorPageProps {
  /** The profile to edit; absent to create one. */
  profile?: SessionInfo | null;
  /** Saved or created; `userId` is the profile's. */
  onDone: (userId: string) => void;
  onCancel: () => void;
}

const isTextField = (element: Element | null) =>
  element instanceof HTMLInputElement && element.type !== 'range';

/** The Samsung on-screen keyboard's Done key. */
const TIZEN_IME_DONE = 65376;

/**
 * Where a key pressed in a field leads, or null to leave it to the field. The app's key routing
 * skips fields, so they move the focus themselves: Up and Down (and Done on the TV keyboard)
 * always leave; Left and Right leave a text field from either end of its text, and move a
 * slider's value.
 */
function fieldExit(event: KeyboardEvent<HTMLElement>): Direction | null {
  const field = event.target;
  if (!(field instanceof HTMLInputElement)) return null;
  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown' || event.keyCode === TIZEN_IME_DONE) return 'down';
  if (field.type === 'range') return null;
  // Email fields do not expose their caret; treat them as at both ends.
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? field.value.length;
  const caretKnown = field.selectionStart !== null;
  if (event.key === 'ArrowLeft' && (!caretKnown || (start === 0 && end === 0))) return 'left';
  if (
    event.key === 'ArrowRight' &&
    (!caretKnown || (start === field.value.length && end === field.value.length))
  )
    return 'right';
  return null;
}

/** Create or edit a profile: its name and Plushie. */
const ProfileEditorPage: FC<ProfileEditorPageProps> = ({ profile, onDone, onCancel }) => {
  const creating = !profile;
  const adminSession = useAppSelector(selectAdminSession);
  const [name, setName] = useState(profile?.user.displayName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [look, setLook] = useState<PlushieLook>(() =>
    profile ? lookFor(profile.user.avatar, profile.user.id) : randomLook()
  );
  const [tab, setTab] = useState<TabId>('color');
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [hops, setHops] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [createProfile, createState] = useCreateProfileMutation();
  const [updateProfile, updateState] = useUpdateProfileMutation();
  // Saving starts by drawing the picture, before either request: a second submit meanwhile
  // would save twice (and create the profile twice).
  const [rendering, setRendering] = useState(false);
  const submitting = useRef(false);
  const busy = rendering || createState.isLoading || updateState.isLoading;
  const pageRef = useRef<HTMLElement | null>(null);
  // The logo lines up with the content beside the back rail, as on the other inner pages.
  useRailContentLeft();

  const change = useCallback((changes: Partial<PlushieLook>) => {
    setLook(current => ({ ...current, ...changes }));
  }, []);

  const surprise = () => {
    setLook(randomLook());
    setHops(count => count + 1);
  };

  useEffect(() => {
    focusFirst(pageRef.current, '#profile-name');
  }, []);

  const keyboardRef = useKeyboardNavigation({
    exclusive: true,
    onRestoreFocus: () => focusFirst(pageRef.current, '#profile-name'),
    // Fields never reach these handlers: the Page's onKeyDown moves out of them (fieldExit).
    onLeft: () => {
      moveFocus(pageRef.current, 'left');
      return true;
    },
    onRight: () => {
      moveFocus(pageRef.current, 'right');
      return true;
    },
    onUp: () => {
      moveFocus(pageRef.current, 'up');
      return true;
    },
    onDown: () => {
      moveFocus(pageRef.current, 'down');
      return true;
    },
    onConfirm: () => {
      const active = document.activeElement;
      // Enter in a field opens the TV keyboard (or submits on a computer).
      if (isTextField(active)) return false;
      if (active instanceof HTMLElement && pageRef.current?.contains(active)) active.click();
      return true;
    },
    onBack: () => {
      onCancel();
      return true;
    },
  });

  const setPageRef = useCallback(
    (element: HTMLElement | null) => {
      pageRef.current = element;
      keyboardRef(element);
    },
    [keyboardRef]
  );

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || submitting.current) return;
    const displayName = name.trim();
    if (!displayName) return setError('Give the profile a name.');
    if (creating) {
      if (!adminSession) return setError('Only an administrator can add profiles.');
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
      if (password.length < MIN_PASSWORD_LENGTH)
        return setError(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    setError(null);
    submitting.current = true;
    setRendering(true);
    try {
      await save(displayName);
    } catch {
      setError('Saving the profile failed.');
    } finally {
      submitting.current = false;
      setRendering(false);
    }
  };

  const save = async (displayName: string) => {
    const image = await renderPlushieSnapshot(look);
    const avatar = toAvatar(look);
    const result = creating
      ? await createProfile({
          adminSession: adminSession!.session,
          email: email.trim(),
          password,
          displayName,
          avatar,
          image,
        })
      : await updateProfile({ session: profile.session, displayName, avatar, image });
    if ('error' in result) {
      const message = (result.error as { data?: unknown }).data;
      setError(typeof message === 'string' ? message : 'Saving the profile failed.');
      return;
    }
    onDone('session' in result.data ? result.data.user.id : result.data.id);
  };

  return (
    <Page
      ref={setPageRef}
      aria-labelledby="profile-editor-title"
      onKeyDown={event => {
        const direction = fieldExit(event);
        if (direction && moveFocus(pageRef.current, direction)) event.preventDefault();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Preview {...{ [NAV_REGION_ATTRIBUTE]: '' }}>
        <Heading id="profile-editor-title">{creating ? 'Add profile' : 'Edit profile'}</Heading>
        <Stage>
          <StageSquare>
            <StageFill>
              <PlushieLive look={look} animated hopSignal={hops} />
            </StageFill>
          </StageSquare>
        </Stage>
        <Button
          data-profile-nav=""
          appearance="settings"
          color="secondary"
          size="large"
          onClick={surprise}
        >
          Surprise me
        </Button>
      </Preview>

      <Form {...{ [NAV_REGION_ATTRIBUTE]: '' }} onSubmit={event => void submit(event)} noValidate>
        <Fields>
          <div>
            <FieldLabel htmlFor="profile-name">Profile name</FieldLabel>
            <Input
              id="profile-name"
              data-profile-nav=""
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={event => setName(event.target.value)}
            />
          </div>
          {creating && (
            <>
              <div>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input
                  id="profile-email"
                  data-profile-nav=""
                  type="email"
                  value={email}
                  autoComplete="off"
                  onChange={event => setEmail(event.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="profile-password">Password</FieldLabel>
                <Input
                  id="profile-password"
                  data-profile-nav=""
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={event => setPassword(event.target.value)}
                />
              </div>
            </>
          )}
        </Fields>

        <Tabs role="tablist" aria-label="Plushie">
          {TABS.map(({ id, label }) => (
            <Tab
              key={id}
              type="button"
              role="tab"
              id={`profile-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="profile-tab-panel"
              data-profile-nav=""
              $selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </Tab>
          ))}
        </Tabs>

        <Panel id="profile-tab-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
          {tab === 'shape' && (
            <ShapePicker
              value={look.kind}
              color={look.color}
              fabric={look.fabric}
              onChange={kind => change({ kind })}
            />
          )}
          {tab === 'color' && (
            <>
              <ColorPicker value={look.color} onChange={color => change({ color })} />
              <FabricPicker
                value={look.fabric}
                color={look.color}
                onChange={fabric => change({ fabric })}
              />
            </>
          )}
          {tab === 'face' && <FaceControls look={look} onChange={change} />}
          {tab === 'accessories' && <AccessoryControls look={look} onChange={change} />}
        </Panel>

        <Disclosure
          type="button"
          data-profile-nav=""
          aria-expanded={fineTuneOpen}
          $open={fineTuneOpen}
          onClick={() => setFineTuneOpen(open => !open)}
        >
          Fine-tune
          <ChevronIcon aria-hidden="true" />
        </Disclosure>
        {fineTuneOpen && <FineTuneControls look={look} onChange={change} />}

        {error && <Alert severity="error">{error}</Alert>}

        <Buttons>
          <Button data-profile-nav="" type="submit" color="primary" size="medium" disabled={busy}>
            {creating ? 'Create profile' : busy ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            data-profile-nav=""
            type="button"
            appearance="settings"
            color="secondary"
            size="medium"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </Buttons>
      </Form>

      <BackRail label="Back" onBack={onCancel} buttonAttributes={{ [NAV_ATTRIBUTE]: '' }} />
    </Page>
  );
};

export default ProfileEditorPage;
