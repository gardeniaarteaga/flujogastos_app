import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notificacion } from './entities/notificacion.entity';
import { NotificacionProgramada } from './entities/notificacion-programada.entity';
import { Periodicidad } from './entities/periodicidad.entity';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { PeriodicidadController } from './periodicidad.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notificacion, Periodicidad, NotificacionProgramada])],
  controllers: [NotificacionesController, PeriodicidadController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
