import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Database } from '@database/database';
import type { User } from '@entities/user.entity';
import type { AvatarLook } from '@mytypes/avatar.types';
import type { ConfigService } from '@mytypes/configuration';
import type { UserRepository } from '@repositories/user.repository';
import { traced } from '@utils/tracing.util';

/** PNG files start with these eight bytes. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Upper bound for a pre-rendered avatar image. */
export const MAX_AVATAR_IMAGE_BYTES = 1024 * 1024;

export class InvalidAvatarImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarImageError';
  }
}

export function isPng(image: Uint8Array): boolean {
  return (
    image.byteLength > PNG_SIGNATURE.byteLength &&
    PNG_SIGNATURE.equals(Buffer.from(image.subarray(0, PNG_SIGNATURE.byteLength)))
  );
}

/**
 * Owns a profile's name, Plushie look and pre-rendered avatar image.
 *
 * The image is rendered by the client that saved the look (from the same live Plushie the editor
 * shows) so devices that cannot render Plushies live, such as TVs, can show a picture instead.
 */
export class ProfileService {
  private readonly userRepository: UserRepository;

  constructor(
    db: Database,
    private readonly config: ConfigService
  ) {
    this.userRepository = db.getUserRepository();
  }

  private get avatarDirectory(): string {
    return resolve(this.config.getOrThrow('DATA_DIR'), 'avatars');
  }

  /** Users are uuids, so this cannot leave the avatar directory. */
  private avatarPath(userId: string): string {
    return resolve(this.avatarDirectory, `${userId}.png`);
  }

  @traced('ProfileService')
  async updateProfile(
    userId: string,
    profile: { avatar?: AvatarLook; displayName?: string }
  ): Promise<User | null> {
    const changes: Partial<User> = {};
    if (profile.displayName !== undefined) changes.displayName = profile.displayName;
    if (profile.avatar !== undefined) {
      changes.avatar = profile.avatar;
      // The saved picture shows the previous look; it counts as missing until one is uploaded.
      changes.avatarRenderedAt = null;
    }
    if (!Object.keys(changes).length) return this.userRepository.findById(userId);
    return this.userRepository.update(userId, changes);
  }

  @traced('ProfileService')
  async saveAvatarImage(userId: string, image: Uint8Array): Promise<User | null> {
    if (image.byteLength > MAX_AVATAR_IMAGE_BYTES) {
      throw new InvalidAvatarImageError('Avatar image is too large');
    }
    if (!isPng(image)) {
      throw new InvalidAvatarImageError('Avatar image must be a PNG');
    }
    await mkdir(this.avatarDirectory, { recursive: true });
    const target = this.avatarPath(userId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, image);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    return this.userRepository.update(userId, { avatarRenderedAt: new Date() });
  }

  /** The pre-rendered avatar image, or null when the profile has none. */
  @traced('ProfileService')
  async getAvatarImage(userId: string): Promise<Buffer | null> {
    try {
      return await readFile(this.avatarPath(userId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
