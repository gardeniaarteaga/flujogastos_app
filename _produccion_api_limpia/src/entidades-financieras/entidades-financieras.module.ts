import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EntidadesFinancierasController } from './entidades-financieras.controller';
import { EntidadesFinancierasService } from './entidades-financieras.service';
import { EntidadFinanciera } from './entities/entidad-financiera.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EntidadFinanciera])],
  controllers: [EntidadesFinancierasController],
  providers: [EntidadesFinancierasService],
  exports: [EntidadesFinancierasService],
})
export class EntidadesFinancierasModule {}