import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginUsuarioDto {
  @IsString()
  @MaxLength(255)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password!: string;
}
