import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEntidadFinancieraDto {
  @IsString()
  @MaxLength(100)
  nombre_entidad!: string;

  @IsOptional()
  @IsInt()
  tipo_entidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  pais?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sitio_web?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono_contacto?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
