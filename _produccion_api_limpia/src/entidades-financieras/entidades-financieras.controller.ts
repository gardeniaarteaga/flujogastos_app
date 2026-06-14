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

import { EntidadesFinancierasService } from './entidades-financieras.service';
import { CreateEntidadFinancieraDto } from './dto/create-entidad-financiera.dto';
import { UpdateEntidadFinancieraDto } from './dto/update-entidad-financiera.dto';

@Controller('entidades-financieras')
export class EntidadesFinancierasController {
  constructor(private readonly entidadesFinancierasService: EntidadesFinancierasService) {}

  @Post()
  create(
    @Body() createEntidadFinancieraDto: CreateEntidadFinancieraDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.entidadesFinancierasService.create(
      createEntidadFinancieraDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.entidadesFinancierasService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.entidadesFinancierasService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEntidadFinancieraDto: UpdateEntidadFinancieraDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.entidadesFinancierasService.update(
      id,
      updateEntidadFinancieraDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.entidadesFinancierasService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
