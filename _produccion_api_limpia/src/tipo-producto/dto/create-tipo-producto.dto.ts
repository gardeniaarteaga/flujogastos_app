import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTipoProductoDto {
  @IsString()
  @MaxLength(100)
  nombre_tipo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}