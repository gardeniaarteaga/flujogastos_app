import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Categoria } from '../categorias/entities/categoria.entity';
import { EstadoTransaccion } from '../estados-transaccion/entities/estado-transaccion.entity';
import { FormaPago } from '../formas-pago/entities/forma-pago.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { Participante } from '../participantes/entities/participante.entity';
import { Subcategoria } from '../subcategorias/entities/subcategoria.entity';
import { TipoTransaccion } from '../tipo-transaccion/entities/tipo-transaccion.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { DetalleTransaccion } from './entities/detalle-transaccion.entity';
import { Transaccion } from './entities/transaccion.entity';
import { TransaccionesController } from './transacciones.controller';
import { TransaccionesSchemaBootstrapService } from './transacciones-schema-bootstrap.service';
import { TransaccionesService } from './transacciones.service';

@Module({
  imports: [
    NotificacionesModule,
    TypeOrmModule.forFeature([
      Transaccion,
      DetalleTransaccion,
      FormaPago,
      Categoria,
      Subcategoria,
      Participante,
      EstadoTransaccion,
      TipoTransaccion,
      Usuario,
    ]),
  ],
  controllers: [TransaccionesController],
  providers: [TransaccionesService, TransaccionesSchemaBootstrapService],
})
export class TransaccionesModule {}
