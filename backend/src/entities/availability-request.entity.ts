import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

import { User } from './user.entity';

/**
 * A user asked to be told when a movie or episode without a playable source gets one
 * ("Notify me"). Deleted once the notification is sent.
 */
@Entity()
@Unique(['userId', 'playableKey'])
@Index(['playableKey'])
export class AvailabilityRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  /**
   * `m:<mediaId>` or `e:<showMediaId>:<season>:<episode>`, as produced by playableKey().
   * Encrypted (deterministically, so it can be looked up): it names what the user wants to watch.
   */
  @Column({ name: 'k', transformer: encryptedText({ deterministic: true }) })
  playableKey: string;

  @CreateDateColumn()
  createdAt: Date;
}
