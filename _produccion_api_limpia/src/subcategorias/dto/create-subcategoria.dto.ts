import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubcategoriaDto {
  @IsInt()
  id_categoria!: number;

  @IsString()
  @MaxLength(50)
  nombre_subcategoria!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
