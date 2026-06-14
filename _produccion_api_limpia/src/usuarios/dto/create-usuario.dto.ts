import {
  IsEmail,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsEmail()
  @MaxLength(255)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombre_completo?: string | null;

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

  @IsOptional()
  @IsInt()
  @Min(1)
  id_rol?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  cambiar_password?: boolean;
}
