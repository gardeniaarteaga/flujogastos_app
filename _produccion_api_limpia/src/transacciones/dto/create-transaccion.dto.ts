import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateDetalleTransaccionDto } from './create-detalle-transaccion.dto';
import { CuotaProgramadaDto } from './cuota-programada.dto';

export class CreateTransaccionDto {
  @IsDateString()
  fecha!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto!: number;

  @IsInt()
  @Min(1)
  id_tipo_transaccion!: number;

  @IsInt()
  @Min(1)
  id_metodo_pago!: number;

  @IsInt()
  @Min(1)
  id_categoria!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_subcategoria?: number | null;

  @IsInt()
  @Min(1)
  id_estado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  descripcion?: string | null;

  @IsOptional()
  @IsBoolean()
  pago_variable?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  intereses?: number;

  @IsOptional()
  @IsBoolean()
  cuotas_sin_intereses?: boolean;

  @IsBoolean()
  pagocompartido!: boolean;

  @IsOptional()
  @IsBoolean()
  titular_cuota_unica_pagada?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad_cuotas_titular?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CuotaProgramadaDto)
  cuotas_titular?: CuotaProgramadaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleTransaccionDto)
  participantes_detalle?: CreateDetalleTransaccionDto[];
}




