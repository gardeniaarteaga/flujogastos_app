import { IsInt, IsNumber, Min } from 'class-validator';

export class ApplyCuotaActualizadaDto {
  @IsInt()
  @Min(1)
  id_detalle!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;
}
