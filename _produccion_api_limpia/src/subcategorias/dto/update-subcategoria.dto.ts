import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSubcategoriaDto {
  @IsOptional()
  @IsInt()
  id_categoria?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nombre_subcategoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
