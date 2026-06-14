import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateFormaPagoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre_forma?: string;

  @IsOptional()
  @IsNumber()
  id_entidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  new_entidad?: string;

  @IsOptional()
  @IsNumber()
  id_tipo_entidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  new_tipo_entidad?: string;

  @IsOptional()
  @IsNumber()
  id_tipo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  new_tipo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasa_anual?: number | null;

  @IsOptional()
  @IsBoolean()
  calcula_interes?: boolean;

  @IsOptional()
  @IsBoolean()
  recibe_estado_cuenta?: boolean;

  @IsOptional()
  @IsBoolean()
  aplica_membresia?: boolean;

  @IsOptional()
  @IsInt()
  mes_pago_membresia?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dia_corte?: number | null;

  @IsOptional()
  @IsInt()
  dia_ultimo_pago?: number | null;

  @IsOptional()
  @IsInt()
  dias_gracia?: number | null;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
