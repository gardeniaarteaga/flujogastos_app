import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TipoEntidadController } from './tipo-entidad.controller';
import { TipoEntidadService } from './tipo-entidad.service';
import { TipoEntidad } from './entities/tipo-entidad.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TipoEntidad])],
  controllers: [TipoEntidadController],
  providers: [TipoEntidadService],
  exports: [TipoEntidadService],
})
export class TipoEntidadModule {}
