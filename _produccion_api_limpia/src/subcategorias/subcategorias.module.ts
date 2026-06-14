import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Categoria } from '../categorias/entities/categoria.entity';
import { Subcategoria } from './entities/subcategoria.entity';
import { SubcategoriasController } from './subcategorias.controller';
import { SubcategoriasService } from './subcategorias.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subcategoria, Categoria])],
  controllers: [SubcategoriasController],
  providers: [SubcategoriasService],
})
export class SubcategoriasModule {}
