import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTipoEntidadDto {
  @IsString()
  @MaxLength(100)
  descripcion!: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
