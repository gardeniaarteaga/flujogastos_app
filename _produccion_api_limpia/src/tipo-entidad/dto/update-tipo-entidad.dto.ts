import { PartialType } from '@nestjs/mapped-types';

import { CreateTipoEntidadDto } from './create-tipo-entidad.dto';

export class UpdateTipoEntidadDto extends PartialType(CreateTipoEntidadDto) {}
