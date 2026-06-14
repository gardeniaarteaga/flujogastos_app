import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nombre_categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
