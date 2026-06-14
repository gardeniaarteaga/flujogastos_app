import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterUsuarioDto {
  @IsString()
  @MaxLength(255)
  @MinLength(3)
  nombre_completo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_participante?: string;

  @IsEmail()
  @MaxLength(255)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(/^[0-9-]+$/, {
    message: 'El celular solo puede contener numeros y guion medio',
  })
  celular?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pais?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigo_area?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ciudad?: string | null;

  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password!: string;
}
