import { Module } from '@nestjs/common';

import { InteresesController } from './intereses.controller';
import { InteresesSchedulerService } from './intereses-scheduler.service';
import { InteresesService } from './intereses.service';

@Module({
  controllers: [InteresesController],
  providers: [InteresesService, InteresesSchedulerService],
  exports: [InteresesService],
})
export class InteresesModule {}
