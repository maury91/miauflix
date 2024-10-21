import {
  Column,
  DataType,
  Default,
  Model,
  Table,
  Unique,
} from 'sequelize-typescript';

export interface ImageAttributes {
  id: number;
  url: string;
  colors: string;
  processed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ImageCreationAttributes = Omit<
  ImageAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'processed' | 'colors'
>;

@Table
export class Image extends Model<ImageAttributes, ImageCreationAttributes> {
  @Unique
  @Column
  url!: string;

  @Column(DataType.TEXT)
  colors?: string;

  @Default(false)
  @Column
  processed!: boolean;
}
