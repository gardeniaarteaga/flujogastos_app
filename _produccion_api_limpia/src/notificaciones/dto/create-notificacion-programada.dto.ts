import {
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNotificacionProgramadaDto {
  @IsString()
  @MaxLength(160)
  descripcion!: string;

  @IsString()
  @IsIn(['alta', 'media', 'baja'])
  prioridad!: 'alta' | 'media' | 'baja';

  @IsDateString()
  fecha_inicio!: string;

  @IsDateString()
  fecha_fin!: string;

  @IsInt()
  @Min(1)
  @Max(31)
  dia_pago_programado!: number;

  @IsInt()
  @Min(1)
  id_periodicidad!: number;
}
