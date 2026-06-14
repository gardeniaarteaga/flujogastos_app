import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ApplyPagosMasivosDto } from './dto/apply-pagos-masivos.dto';
import { ApplyPagosTransaccionDto } from './dto/apply-pagos-transaccion.dto';
import { CreateTransaccionDto } from './dto/create-transaccion.dto';
import { TransaccionesService } from './transacciones.service';
import { UpdateTransaccionDto } from './dto/update-transaccion.dto';

@Controller('transacciones')
export class TransaccionesController {
  constructor(private readonly transaccionesService: TransaccionesService) {}

  @Get()
  findAll(
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.findAll(
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Post()
  create(
    @Body() createTransaccionDto: CreateTransaccionDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.create(
      createTransaccionDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch('aplicar-pagos-masivos')
  applyPagosMasivos(
    @Body() applyPagosMasivosDto: ApplyPagosMasivosDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.applyPagosMasivos(
      applyPagosMasivosDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransaccionDto: UpdateTransaccionDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.update(
      id,
      updateTransaccionDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id/completar')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.complete(
      id,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id/aplicar-pagos')
  applyPagos(
    @Param('id', ParseIntPipe) id: number,
    @Body() applyPagosDto: ApplyPagosTransaccionDto,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.applyPagos(
      id,
      applyPagosDto,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id/anular')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.cancel(
      id,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  @Patch(':id/reactivar')
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') authenticatedUserId?: string,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.transaccionesService.reactivate(
      id,
      this.resolveIdUsuario(authenticatedUserId, idUsuario),
    );
  }

  private resolveIdUsuario(
    authenticatedUserId?: string,
    queryUserId?: string,
  ): number {
    if (queryUserId?.trim()) {
      return this.parseIdUsuario(queryUserId);
    }

    if (authenticatedUserId?.trim()) {
      return this.parseIdUsuario(authenticatedUserId);
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
