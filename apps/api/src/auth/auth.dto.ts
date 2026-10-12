import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SignupDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254)
  email: string;

  /** Не короче 10 символов */
  @IsString()
  @MinLength(10, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(200)
  password: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsIn(['ru', 'kk', 'en'])
  locale?: string;

  /** Согласие на обработку персональных данных (ТЗ §10.2) — обязательно */
  @Equals(true, { message: 'PD_CONSENT_REQUIRED' })
  pdConsent: boolean;
}

export class LoginDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class MfaLoginDto {
  @IsString()
  @MaxLength(200)
  mfaToken: string;

  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;
}

export class TotpCodeDto {
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;
}

export class VerifyEmailDto {
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;
}

export class RequestResetDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email: string;
}

export class ConfirmResetDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email: string;

  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;

  @IsString()
  @MinLength(10, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(200)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(200)
  newPassword: string;
}
