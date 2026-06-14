import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateParticipanteDto {
  @IsString()
  @MaxLength(150)
  nombre_participante!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  correo_electronico?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  celular?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  porcentaje_participacion?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: string;
}
