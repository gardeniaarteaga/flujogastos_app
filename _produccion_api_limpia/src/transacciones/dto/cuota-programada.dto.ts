import { ValidateIf } from 'class-validator';
import { IsDateString, IsNumber, Min } from 'class-validator';

export class CuotaProgramadaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto!: number;

  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsDateString()
  fecha_programada?: string | null;
}
