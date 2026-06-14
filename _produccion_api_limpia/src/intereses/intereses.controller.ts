import { Controller, Post } from '@nestjs/common';

import { InteresesService } from './intereses.service';

@Controller('intereses')
export class InteresesController {
  constructor(private readonly interesesService: InteresesService) {}

  @Post('calcular')
  calculateDailyIntereses() {
    return this.interesesService.calculateDailyIntereses('manual');
  }
}
