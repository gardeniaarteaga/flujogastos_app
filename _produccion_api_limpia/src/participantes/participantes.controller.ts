import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ParticipantesService } from './participantes.service';
import { CreateParticipanteDto } from './dto/create-participante.dto';
import { UpdateParticipanteDto } from './dto/update-participante.dto';

@Controller('participantes')
export class ParticipantesController {
  constructor(private readonly participantesService: ParticipantesService) {}

  @Post()
  create(
    @Body() createParticipanteDto: CreateParticipanteDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.participantesService.create(
      createParticipanteDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Get()
  findAll(
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.participantesService.findAll(
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.participantesService.findOne(
      id,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateParticipanteDto: UpdateParticipanteDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.participantesService.update(
      id,
      updateParticipanteDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.participantesService.remove(
      id,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  private resolveIdUsuario(
    authenticatedUserId?: string,
    queryUserId?: string,
  ): number {
    if (authenticatedUserId?.trim()) {
      return this.parseIdUsuario(authenticatedUserId);
    }

    if (queryUserId?.trim()) {
      return this.parseIdUsuario(queryUserId);
    }

    return 1;
  }

  private parseIdUsuario(idUsuario: string): number {
    if (!idUsuario.trim()) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    const parsedValue = Number(idUsuario);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException('El id_usuario debe ser un entero positivo');
    }

    return parsedValue;
  }
}
