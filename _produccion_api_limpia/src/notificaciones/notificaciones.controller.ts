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

import { CreateNotificacionProgramadaDto } from './dto/create-notificacion-programada.dto';
import { UpdateNotificacionProgramadaDto } from './dto/update-notificacion-programada.dto';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  findAll(
    @Query('id_usuario') idUsuario?: string,
    @Query('limite') limite?: string,
  ) {
    return this.notificacionesService.findAll(
      this.parseIdUsuario(idUsuario),
      this.parseLimite(limite),
    );
  }

  @Patch('marcar-todas')
  markAllAsRead(@Query('id_usuario') idUsuario?: string) {
    return this.notificacionesService.markAllAsRead(this.parseIdUsuario(idUsuario));
  }

  @Patch(':id/marcar-leida')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.notificacionesService.markAsRead(
      id,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Get('programadas')
  findProgramadas(@Query('id_usuario') idUsuario?: string) {
    return this.notificacionesService.findProgramadas(
      this.parseIdUsuario(idUsuario),
    );
  }

  @Post('programadas')
  createProgramada(
    @Body() createNotificacionProgramadaDto: CreateNotificacionProgramadaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.notificacionesService.createProgramada(
      createNotificacionProgramadaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Patch('programadas/:id')
  updateProgramada(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateNotificacionProgramadaDto: UpdateNotificacionProgramadaDto,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.notificacionesService.updateProgramada(
      id,
      updateNotificacionProgramadaDto,
      this.parseIdUsuario(idUsuario),
    );
  }

  @Delete('programadas/:id')
  removeProgramada(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.notificacionesService.removeProgramada(
      id,
      this.parseIdUsuario(idUsuario),
    );
  }

  private parseIdUsuario(idUsuario?: string): number {
    const parsedValue = Number(idUsuario ?? 1);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }

  private parseLimite(limite?: string): number {
    if (limite === undefined || limite.trim() === '') {
      return 8;
    }

    const parsedValue = Number(limite);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException('El limite debe ser un entero positivo');
    }

    return parsedValue;
  }
}
