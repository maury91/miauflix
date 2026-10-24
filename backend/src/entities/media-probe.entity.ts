import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A file's ffprobe result. Torrent content never changes, so one probe serves forever. */
@Entity()
@Index(['sourceId', 'filePath'], { unique: true })
export class MediaProbe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceId: number;

  @Column({ type: 'text' })
  filePath: string;

  /** Raw ffprobe JSON, so delivery decisions can change without probing again. */
  @Column({ type: 'text' })
  result: string;

  @CreateDateColumn()
  createdAt: Date;
}
