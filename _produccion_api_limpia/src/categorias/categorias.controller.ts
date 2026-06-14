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

import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  create(
    @Body() createCategoriaDto: CreateCategoriaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.categoriasService.create(
      createCategoriaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.categoriasService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.categoriasService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoriaDto: UpdateCategoriaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.categoriasService.update(
      id,
      updateCategoriaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.categoriasService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario ?? 1);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
