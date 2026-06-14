import { Controller, Get } from '@nestjs/common';

import { EstadosTransaccionService } from './estados-transaccion.service';

@Controller('estados-transaccion')
export class EstadosTransaccionController {
  constructor(
    private readonly estadosTransaccionService: EstadosTransaccionService,
  ) {}

  @Get()
  findAll() {
    return this.estadosTransaccionService.findAll();
  }
}
