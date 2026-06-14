import { Controller, Get } from '@nestjs/common';

import { NotificacionesService } from './notificaciones.service';

@Controller('periodicidad')
export class PeriodicidadController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  findAll() {
    return this.notificacionesService.findPeriodicidades();
  }
}
