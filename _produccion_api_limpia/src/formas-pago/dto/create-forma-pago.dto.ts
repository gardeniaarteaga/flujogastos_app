import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateFormaPagoDto {
  @IsString()
  @MaxLength(100)
  nombre_forma!: string;

  @IsOptional()
  @IsNumber()
  id_entidad!: number;

  @ValidateIf((o) => !o.id_entidad)
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

  @ValidateIf((o) => !o.id_tipo)
  @IsString()
  @MaxLength(100)
  new_tipo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tasa_anual?: number;

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
  mes_pago_membresia?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dia_corte?: number;

  @IsOptional()
  @IsInt()
  dia_ultimo_pago?: number;

  @IsOptional()
  @IsInt()
  dias_gracia?: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
