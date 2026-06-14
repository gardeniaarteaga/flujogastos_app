import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TipoProductoController } from './tipo-producto.controller';
import { TipoProductoService } from './tipo-producto.service';
import { TipoProducto } from './entities/tipo-producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TipoProducto])],
  controllers: [TipoProductoController],
  providers: [TipoProductoService],
  exports: [TipoProductoService],
})
export class TipoProductoModule {}