import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

const SHA256 = /^[0-9a-f]{64}$/;

export class StartUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  /** Размер в байтах */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size: number;

  /** File.lastModified (мс) — для сверки при возобновлении */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastModified: number;

  /** SHA-256 первой части файла (hex) */
  @Matches(SHA256)
  firstPartSha256: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mimeType?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  folderId?: string | null;
}

export class SignPartsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers: number[];
}

export class MatchFileDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @Type(() => Number)
  @IsInt()
  size: number;

  @Type(() => Number)
  @IsInt()
  lastModified: number;

  @Matches(SHA256)
  firstPartSha256: string;
}

export class CompleteUploadDto {
  /** SHA-256 всего файла, посчитанный браузером */
  @Matches(SHA256)
  sha256: string;
}
