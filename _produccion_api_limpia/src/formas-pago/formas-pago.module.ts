import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FormasPagoController } from './formas-pago.controller';
import { FormasPagoService } from './formas-pago.service';
import { FormaPago } from './entities/forma-pago.entity';
import { EntidadesFinancierasModule } from '../entidades-financieras/entidades-financieras.module';
import { TipoProductoModule } from '../tipo-producto/tipo-producto.module';
import { EntidadFinanciera } from '../entidades-financieras/entities/entidad-financiera.entity';
import { TipoProducto } from '../tipo-producto/entities/tipo-producto.entity';
import { TipoEntidad } from '../tipo-entidad/entities/tipo-entidad.entity';
import { TipoEntidadModule } from '../tipo-entidad/tipo-entidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormaPago, EntidadFinanciera, TipoProducto, TipoEntidad]),
    EntidadesFinancierasModule,
    TipoEntidadModule,
    TipoProductoModule,
  ],
  controllers: [FormasPagoController],
  providers: [FormasPagoService],
  exports: [FormasPagoService],
})
export class FormasPagoModule {}
