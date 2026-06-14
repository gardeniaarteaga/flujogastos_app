import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { CuotaProgramadaDto } from './cuota-programada.dto';

export class CreateDetalleTransaccionDto {
  @IsInt()
  @Min(1)
  id_participante!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad_cuotas?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CuotaProgramadaDto)
  cuotas?: CuotaProgramadaDto[];
}


