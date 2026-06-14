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

import { FormasPagoService } from './formas-pago.service';
import { CreateFormaPagoDto } from './dto/create-forma-pago.dto';
import { UpdateFormaPagoDto } from './dto/update-forma-pago.dto';

@Controller('formas-pago')
export class FormasPagoController {
  constructor(private readonly formasPagoService: FormasPagoService) {}

  @Post()
  create(
    @Body() createFormaPagoDto: CreateFormaPagoDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.formasPagoService.create(createFormaPagoDto, this.parseIdUsuario(idUsuario));
  }

  @Get()
  findAll(@Query('id_usuario') idUsuario?: string) {
    return this.formasPagoService.findAll(this.parseIdUsuario(idUsuario));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.formasPagoService.findOne(id, this.parseIdUsuario(idUsuario));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFormaPagoDto: UpdateFormaPagoDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.formasPagoService.update(id, updateFormaPagoDto, this.parseIdUsuario(idUsuario));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.formasPagoService.remove(id, this.parseIdUsuario(idUsuario));
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
