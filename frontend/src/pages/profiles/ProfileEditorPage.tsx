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
import * as lookStyles from '@features/profiles/ui/lookControls.css';
import {
  Button,
  Disclosure,
  FormSection,
  Heading,
  Message,
  NavItem,
  NavRail,
  PasswordField,
  ScrollArea,
  SurfaceContextProvider,
  TabPanel,
  Tabs,
  TextField,
} from '@shared/design-system';
import { TIZEN_IME_DONE } from '@shared/hooks/useKeyboard';
import { usePageBack } from '@shared/hooks/usePageBack';
import { FocusGroup, FocusScope, NavigationProvider, useNavigation } from '@shared/navigation';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { useAppSelector } from '@store/hooks';
import { selectAdminSession, type SessionInfo } from '@store/slices/auth';
import { motion } from 'framer-motion';
import { type FC, type KeyboardEvent, useCallback, useRef, useState } from 'react';

import { EDITOR_NAV as NAV } from './profileEditorNav';
import * as styles from './profileEditorPage.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';

type TabId = 'shape' | 'color' | 'face' | 'accessories';
const TABS: { id: TabId; label: string }[] = [
  { id: 'shape', label: 'Shape' },
  { id: 'color', label: 'Color & fabric' },
  { id: 'face', label: 'Face' },
  { id: 'accessories', label: 'Accessories' },
];
const TABS_ID = 'profile-look';

const MIN_PASSWORD_LENGTH = 8;

export interface ProfileEditorPageProps {
  /** The profile to edit; absent to create one. */
  profile?: SessionInfo | null;
  /** Saved or created; `userId` is the profile's. */
  onDone: (userId: string) => void;
  onCancel: () => void;
}

/** Create or edit a profile: its name and Plushie. */
const ProfileEditorPage: FC<ProfileEditorPageProps> = props => {
  const { onCancel } = props;
  // The logo lines up with the content beside the back rail, as on the other inner pages.
  useRailContentLeft();
  // Back ends editing a field first (closing a TV's keyboard), then leaves the page
  const back = usePageBack(onCancel);
  return (
    <motion.main
      {...back}
      className={styles.page}
      aria-labelledby="profile-editor-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <NavigationProvider>
        <ProfileEditor {...props} />
      </NavigationProvider>
    </motion.main>
  );
};

/**
 * One navigation scope: the back rail, the preview (Surprise me) and the form (name, then email
 * and password when creating, the look's tabs and their pictures, Fine-tune, then Save and
 * Cancel). The form column scrolls to keep the focused control in view.
 */
function ProfileEditor({ profile, onDone, onCancel }: ProfileEditorPageProps) {
  const creating = !profile;
  const adminSession = useAppSelector(selectAdminSession);
  const navigation = useNavigation();
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

  const change = useCallback((changes: Partial<PlushieLook>) => {
    setLook(current => ({ ...current, ...changes }));
  }, []);

  const surprise = () => {
    setLook(randomLook());
    setHops(count => count + 1);
  };

  /**
   * The TV keyboard's Done moves on to the next field (if there is one), and only that: never a
   * native submit of the form (Save is pressed on purpose). The shared key handling sees Done
   * first (capture phase).
   */
  const nextOnDone = (next?: string) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.keyCode !== TIZEN_IME_DONE) return;
    event.preventDefault();
    if (next) navigation.focus(next);
  };

  const submit = async () => {
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
    <FocusScope id={NAV.scope} layout="horizontal" initialId={NAV.name}>
      <div className={styles.rail}>
        <NavRail label="Profile" navId={NAV.rail}>
          <NavItem navId={NAV.back} icon={<ArrowLeftIcon />} label="Back" onClick={onCancel} />
        </NavRail>
      </div>
      <SurfaceContextProvider value="solid">
        <div className={styles.body}>
          <FocusGroup id={NAV.preview} layout="vertical">
            <div className={styles.preview}>
              <div className={styles.title}>
                <Heading level={1} id="profile-editor-title">
                  {creating ? 'Add profile' : 'Edit profile'}
                </Heading>
              </div>
              <div className={styles.stage}>
                <div className={styles.stageSquare}>
                  <div className={styles.stageFill}>
                    <PlushieLive look={look} animated hopSignal={hops} />
                  </div>
                </div>
              </div>
              <Button navId={NAV.surprise} size="lg" onClick={surprise}>
                Surprise me
              </Button>
            </div>
          </FocusGroup>
          <div className={styles.form}>
            <ScrollArea>
              <div className={styles.formContent}>
                <FormSection
                  navId={NAV.form}
                  title="Name and Plushie"
                  titleHidden
                  onSubmit={() => void submit()}
                  busy={busy}
                  message={
                    error ? (
                      <Message tone="danger" toneLabel="Error" live="assertive">
                        {error}
                      </Message>
                    ) : undefined
                  }
                  actions={
                    <>
                      <Button navId={NAV.save} type="submit" loading={busy} disabled={busy}>
                        {creating ? 'Create profile' : 'Save changes'}
                      </Button>
                      <Button navId={NAV.cancel} onClick={onCancel}>
                        Cancel
                      </Button>
                    </>
                  }
                >
                  <TextField
                    navId={NAV.name}
                    id="profile-name"
                    label="Profile name"
                    value={name}
                    maxLength={40}
                    autoComplete="off"
                    onChange={event => setName(event.target.value)}
                    onKeyDown={nextOnDone(creating ? NAV.email : undefined)}
                  />
                  {creating && (
                    <>
                      <TextField
                        navId={NAV.email}
                        id="profile-email"
                        label="Email"
                        type="email"
                        value={email}
                        autoComplete="off"
                        onChange={event => setEmail(event.target.value)}
                        onKeyDown={nextOnDone(NAV.password)}
                      />
                      <PasswordField
                        navId={NAV.password}
                        id="profile-password"
                        label="Password"
                        showLabel="Show password"
                        hideLabel="Hide password"
                        value={password}
                        autoComplete="new-password"
                        onChange={event => setPassword(event.target.value)}
                        onKeyDown={nextOnDone()}
                      />
                    </>
                  )}
                  <Tabs
                    id={TABS_ID}
                    navId={NAV.tabs}
                    label="Plushie"
                    items={TABS}
                    selectedId={tab}
                    onSelect={setTab}
                  />
                  {TABS.map(({ id }) => (
                    <TabPanel key={id} tabsId={TABS_ID} tab={id} selected={tab === id}>
                      {/* Only the shown panel registers its controls */}
                      {tab === id && id === 'shape' && (
                        <ShapePicker
                          navId={NAV.look}
                          value={look.kind}
                          color={look.color}
                          fabric={look.fabric}
                          onChange={kind => change({ kind })}
                        />
                      )}
                      {tab === id && id === 'color' && (
                        <div className={lookStyles.controls}>
                          <ColorPicker
                            navId={NAV.look}
                            value={look.color}
                            onChange={color => change({ color })}
                          />
                          <FabricPicker
                            navId={NAV.look}
                            value={look.fabric}
                            color={look.color}
                            onChange={fabric => change({ fabric })}
                          />
                        </div>
                      )}
                      {tab === id && id === 'face' && (
                        <FaceControls navId={NAV.look} look={look} onChange={change} />
                      )}
                      {tab === id && id === 'accessories' && (
                        <AccessoryControls navId={NAV.look} look={look} onChange={change} />
                      )}
                    </TabPanel>
                  ))}
                  <Disclosure
                    navId={NAV.fineTune}
                    title="Fine-tune"
                    expanded={fineTuneOpen}
                    onExpandedChange={setFineTuneOpen}
                  >
                    <FineTuneControls navId={NAV.look} look={look} onChange={change} />
                  </Disclosure>
                </FormSection>
              </div>
            </ScrollArea>
          </div>
        </div>
      </SurfaceContextProvider>
    </FocusScope>
  );
}

export default ProfileEditorPage;
