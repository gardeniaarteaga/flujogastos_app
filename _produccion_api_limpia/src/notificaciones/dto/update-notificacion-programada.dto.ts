import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateNotificacionProgramadaDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @IsIn(['alta', 'media', 'baja'])
  prioridad?: 'alta' | 'media' | 'baja';

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dia_pago_programado?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_periodicidad?: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
