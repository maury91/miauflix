import { forwardRef, type ReactNode, useId } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { Avatar } from '../../avatar/Avatar';
import { CollectionTile, type CollectionTileProps } from '../../collection-tile/CollectionTile';
import { joinIds } from '../../ids';
import * as styles from './profileTile.css';

import EditIcon from '~icons/mdi/pencil';

export type ProfileTileProps = Omit<
  CollectionTileProps,
  'label' | 'visual' | 'ratio' | 'labelPlacement' | 'progress' | 'progressText'
> & {
  /** The profile's name, which names the tile. */
  name: string;
  /** The profile picture; absent while it is fetched (the colour and placeholder show). */
  avatar?: string | null;
  /**
   * A picture the feature draws itself in place of `avatar`: the live, animated Plushie. The
   * profiles feature decides when to animate it (a hop as focus arrives).
   */
  picture?: ReactNode;
  /** Whether `picture` has drawn itself (default true); until then the avatar's loading look shows. */
  pictureLoaded?: boolean;
  /** `contain` for pictures with their own shape (a Plushie); `cover` by default. */
  fit?: 'cover' | 'contain';
  /** The profile's colour, shown while the picture loads and if it fails. */
  color?: string;
  /** Shown while the picture loads and if it fails (a decorative icon). */
  placeholder?: ReactNode;
  /**
   * Edit mode (the profile manager): a pencil over the dimmed picture, and `editLabel` describes
   * what pressing it does.
   */
  editing?: boolean;
  /** "Edit profile", read as the description in edit mode. From the feature (i18n). */
  editLabel?: string;
};

/**
 * A profile to choose or edit: a square CollectionTile led by the Avatar, the name below. The
 * profiles feature owns what choosing or editing does, and the collection owns movement.
 */
export const ProfileTile = forwardRef<HTMLButtonElement, ProfileTileProps>(function ProfileTile(
  {
    name,
    avatar,
    picture,
    pictureLoaded,
    fit,
    color,
    placeholder,
    editing = false,
    editLabel,
    'aria-describedby': describedBy,
    ...props
  },
  forwardedRef
) {
  const editId = `${useId()}-edit`;
  const showEdit = editing && editLabel !== undefined;
  return (
    <CollectionTile
      {...props}
      ref={forwardedRef}
      label={name}
      ratio="square"
      labelPlacement="below"
      aria-describedby={joinIds(describedBy, showEdit && editId)}
      visual={
        <>
          <Avatar
            name={name}
            src={avatar}
            picture={picture}
            pictureLoaded={pictureLoaded}
            fit={fit}
            color={color}
            placeholder={placeholder}
            size="fill"
            decorative
          />
          {editing && (
            <span className={styles.edit} aria-hidden="true">
              <EditIcon />
            </span>
          )}
          {showEdit && (
            <span id={editId} className={visuallyHidden}>
              {editLabel}
            </span>
          )}
        </>
      }
    />
  );
});
