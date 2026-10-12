import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class ListQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsIn(['name', 'size', 'createdAt', 'kind', 'takenAt'])
  sort?: 'name' | 'size' | 'createdAt' | 'kind' | 'takenAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class CreateFolderDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;
}

export class EnsurePathDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  segments: string[];
}

const COLOR = /^(red|orange|yellow|green|blue|purple|gray)$/;

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(COLOR)
  color?: string | null;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(COLOR)
  color?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class BulkDto {
  @IsIn(['move', 'trash', 'star', 'unstar'])
  action: 'move' | 'trash' | 'star' | 'unstar';

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  assetIds: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  folderIds: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  targetFolderId?: string | null;
}

export class TrashItemsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  assetIds: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  folderIds: string[];
}

export class DownloadDto {
  /** Владелец подтверждает скачивание файла, не прошедшего полную проверку */
  @IsOptional()
  @IsBoolean()
  acknowledgeUnverified?: boolean;
}

export class SearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['VIDEO', 'PHOTO', 'RAW', 'AUDIO', 'DOCUMENT', 'ARCHIVE', 'OTHER'])
  kind?: any;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['RECEIVED', 'CORRUPTED', 'SCANNING', 'VERIFIED', 'RESTRICTED', 'BLOCKED'])
  state?: any;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['NONE', 'PENDING', 'RUNNING', 'READY', 'FAILED', 'UNSUPPORTED'])
  processing?: any;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  uploadedFrom?: Date;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  uploadedTo?: Date;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  takenFrom?: Date;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  takenTo?: Date;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSize?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSize?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minHeight?: number;
}
