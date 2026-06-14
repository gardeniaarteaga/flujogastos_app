import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { ApplyCuotaActualizadaDto } from './apply-cuota-actualizada.dto';
import { ApplyPagoDetalleDto } from './apply-pago-detalle.dto';

export class ApplyPagosTransaccionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApplyPagoDetalleDto)
  pagos!: ApplyPagoDetalleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApplyCuotaActualizadaDto)
  cuotas_actualizadas?: ApplyCuotaActualizadaDto[];
}
