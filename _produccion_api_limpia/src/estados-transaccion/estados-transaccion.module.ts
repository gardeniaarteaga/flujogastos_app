import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EstadoTransaccion } from './entities/estado-transaccion.entity';
import { EstadosTransaccionController } from './estados-transaccion.controller';
import { EstadosTransaccionService } from './estados-transaccion.service';

@Module({
  imports: [TypeOrmModule.forFeature([EstadoTransaccion])],
  controllers: [EstadosTransaccionController],
  providers: [EstadosTransaccionService],
})
export class EstadosTransaccionModule {}
