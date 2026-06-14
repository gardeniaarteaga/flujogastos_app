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

import { TipoProductoService } from './tipo-producto.service';
import { CreateTipoProductoDto } from './dto/create-tipo-producto.dto';
import { UpdateTipoProductoDto } from './dto/update-tipo-producto.dto';

@Controller('tipo-producto')
export class TipoProductoController {
  constructor(private readonly tipoProductoService: TipoProductoService) {}

  @Post()
  create(
    @Body() createTipoProductoDto: CreateTipoProductoDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoProductoService.create(createTipoProductoDto, this.parseIdUsuario(idUsuario));
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.tipoProductoService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoProductoService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTipoProductoDto: UpdateTipoProductoDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoProductoService.update(id, updateTipoProductoDto, this.parseIdUsuario(idUsuario));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoProductoService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
