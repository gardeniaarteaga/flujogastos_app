import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateSubcategoriaDto } from './dto/create-subcategoria.dto';
import { UpdateSubcategoriaDto } from './dto/update-subcategoria.dto';
import { SubcategoriasService } from './subcategorias.service';

@Controller('subcategorias')
export class SubcategoriasController {
  constructor(private readonly subcategoriasService: SubcategoriasService) {}

  @Post()
  create(
    @Body() createSubcategoriaDto: CreateSubcategoriaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.subcategoriasService.create(
      createSubcategoriaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.subcategoriasService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.subcategoriasService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSubcategoriaDto: UpdateSubcategoriaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.subcategoriasService.update(
      id,
      updateSubcategoriaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.subcategoriasService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario ?? 1);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
