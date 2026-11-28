import { z } from 'zod';

const MAX_AVATAR_OPTIONS = 40;

/**
 * A Plushie look. Only the shape is checked (short option names and values), so new `plushies`
 * options keep working without a backend change.
 */
export const avatarLookSchema = z
  .record(
    z.string().regex(/^[a-zA-Z]{1,32}$/),
    z.union([
      z.boolean(),
      z.number().finite().min(-1000).max(1000),
      z
        .string()
        .max(32)
        .regex(/^[#a-zA-Z0-9]*$/),
    ])
  )
  .refine(look => Object.keys(look).length <= MAX_AVATAR_OPTIONS, {
    message: `At most ${MAX_AVATAR_OPTIONS} avatar options`,
  });

export const displayNameSchema = z.string().trim().min(1).max(40);

export const watchOnceSchema = z.object({ watchOnce: z.boolean() }).strict();

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  // Not null: every profile keeps a look (generated when it had none).
  avatar: avatarLookSchema.optional(),
});

const languageCode = z.string().regex(/^[a-z]{2,3}$/);
const audioLanguage = z.union([languageCode, z.literal('original')]);

/** A profile's languages; null follows the device (anime: the movies and TV shows choice). */
export const languagePreferencesSchema = z
  .object({
    interface: languageCode.nullable(),
    audio: z
      .object({ default: audioLanguage.nullable(), anime: audioLanguage.nullable() })
      .strict(),
    subtitles: z
      .object({ default: languageCode.nullable(), anime: languageCode.nullable() })
      .strict(),
    // Optional: clients from before the setting leave it out, keeping the stored choice
    autoSubtitles: z.boolean().optional(),
  })
  .strict();
