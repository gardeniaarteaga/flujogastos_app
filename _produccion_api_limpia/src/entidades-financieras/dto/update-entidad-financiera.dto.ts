import { PartialType } from '@nestjs/mapped-types';
import { CreateEntidadFinancieraDto } from './create-entidad-financiera.dto';

export class UpdateEntidadFinancieraDto extends PartialType(CreateEntidadFinancieraDto) {}