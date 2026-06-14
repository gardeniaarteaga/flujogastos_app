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

import { TipoEntidadService } from './tipo-entidad.service';
import { CreateTipoEntidadDto } from './dto/create-tipo-entidad.dto';
import { UpdateTipoEntidadDto } from './dto/update-tipo-entidad.dto';

@Controller('tipo-entidad')
export class TipoEntidadController {
  constructor(private readonly tipoEntidadService: TipoEntidadService) {}

  @Post()
  create(
    @Body() createTipoEntidadDto: CreateTipoEntidadDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoEntidadService.create(createTipoEntidadDto, this.parseIdUsuario(idUsuario));
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.tipoEntidadService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoEntidadService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTipoEntidadDto: UpdateTipoEntidadDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoEntidadService.update(id, updateTipoEntidadDto, this.parseIdUsuario(idUsuario));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.tipoEntidadService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
