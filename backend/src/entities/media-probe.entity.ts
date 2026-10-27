import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { encryptedText } from '@utils/encrypted-column.util';

/** A file's ffprobe result. Torrent content never changes, so one probe serves forever. */
@Entity()
@Index(['sourceId', 'filePath'], { unique: true })
export class MediaProbe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceId: number;

  @Column({ type: 'text', name: 'k', transformer: encryptedText({ deterministic: true }) })
  filePath: string;

  /** Raw ffprobe JSON, so delivery decisions can change without probing again. */
  @Column({ type: 'text', name: 'v', transformer: encryptedText({ deterministic: false }) })
  result: string;

  @CreateDateColumn()
  createdAt: Date;
}
