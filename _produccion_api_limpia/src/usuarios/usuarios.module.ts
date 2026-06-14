import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Participante } from '../participantes/entities/participante.entity';
import { Usuario } from './entities/usuario.entity';
import { UsuariosController } from './usuarios.controller';
import { UsuariosSchemaBootstrapService } from './usuarios-schema-bootstrap.service';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Participante])],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosSchemaBootstrapService],
})
export class UsuariosModule {}
