import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { isAdminOwned, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateEntidadFinancieraDto } from './dto/create-entidad-financiera.dto';
import { UpdateEntidadFinancieraDto } from './dto/update-entidad-financiera.dto';
import { EntidadFinanciera } from './entities/entidad-financiera.entity';

@Injectable()
export class EntidadesFinancierasService {
  constructor(
    @InjectRepository(EntidadFinanciera)
    private readonly entidadesFinancierasRepository: Repository<EntidadFinanciera>,
  ) {}

  create(createEntidadFinancieraDto: CreateEntidadFinancieraDto, idUsuario: number) {
    const entidad = this.entidadesFinancierasRepository.create({
      nombre_entidad: createEntidadFinancieraDto.nombre_entidad.trim(),
      tipo_entidad: createEntidadFinancieraDto.tipo_entidad ?? null,
      id_usuario: idUsuario,
      pais: createEntidadFinancieraDto.pais?.trim() || null,
      sitio_web: createEntidadFinancieraDto.sitio_web?.trim() || null,
      telefono_contacto: createEntidadFinancieraDto.telefono_contacto?.trim() || null,
      estado: createEntidadFinancieraDto.estado ?? true,
    });

    return this.entidadesFinancierasRepository.save(entidad);
  }

  async findAll(idUsuario: number) {
    const adminUserIds = await listAdminUserIds(this.entidadesFinancierasRepository);

    return this.entidadesFinancierasRepository.find({
      where: this.buildVisibleWhere(idUsuario, adminUserIds),
      order: { id_usuario: 'ASC', id_entidad: 'ASC' },
    });
  }

  async findOne(id: number, idUsuario: number) {
    const adminUserIds = await listAdminUserIds(this.entidadesFinancierasRepository);
    const entidad = await this.entidadesFinancierasRepository.findOne({
      where: this.buildVisibleWhere(idUsuario, adminUserIds, id),
    });

    if (!entidad) {
      throw new NotFoundException(`La entidad financiera con id ${id} no existe`);
    }

    return entidad;
  }

  async update(
    id: number,
    updateEntidadFinancieraDto: UpdateEntidadFinancieraDto,
    idUsuario: number,
  ) {
    const entidad = await this.findOwned(id, idUsuario);
    const adminUserIds = await listAdminUserIds(this.entidadesFinancierasRepository);

    if (isAdminOwned(adminUserIds, entidad.id_usuario)) {
      throw new ForbiddenException(
        'Las entidades financieras creadas por un administrador no se pueden editar',
      );
    }

    if (updateEntidadFinancieraDto.nombre_entidad !== undefined) {
      entidad.nombre_entidad = updateEntidadFinancieraDto.nombre_entidad.trim();
    }

    if (updateEntidadFinancieraDto.tipo_entidad !== undefined) {
      entidad.tipo_entidad = updateEntidadFinancieraDto.tipo_entidad;
    }

    if (updateEntidadFinancieraDto.pais !== undefined) {
      entidad.pais = updateEntidadFinancieraDto.pais?.trim() || null;
    }

    if (updateEntidadFinancieraDto.sitio_web !== undefined) {
      entidad.sitio_web = updateEntidadFinancieraDto.sitio_web?.trim() || null;
    }

    if (updateEntidadFinancieraDto.telefono_contacto !== undefined) {
      entidad.telefono_contacto = updateEntidadFinancieraDto.telefono_contacto?.trim() || null;
    }

    if (updateEntidadFinancieraDto.estado !== undefined) {
      entidad.estado = updateEntidadFinancieraDto.estado;
    }

    return this.entidadesFinancierasRepository.save(entidad);
  }

  async remove(id: number, idUsuario: number) {
    const entidad = await this.findOwned(id, idUsuario);
    const adminUserIds = await listAdminUserIds(this.entidadesFinancierasRepository);

    if (isAdminOwned(adminUserIds, entidad.id_usuario)) {
      throw new ForbiddenException(
        'Las entidades financieras creadas por un administrador no se pueden eliminar',
      );
    }

    return this.entidadesFinancierasRepository.remove(entidad);
  }

  private buildVisibleWhere(
    idUsuario: number,
    adminUserIds: number[],
    idEntidad?: number,
  ): FindOptionsWhere<EntidadFinanciera>[] {
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));

    return usuariosVisibles.map((usuarioVisible) => ({
      ...(idEntidad !== undefined ? { id_entidad: idEntidad } : {}),
      id_usuario: usuarioVisible,
    }));
  }

  private async findOwned(id: number, idUsuario: number): Promise<EntidadFinanciera> {
    const entidad = await this.entidadesFinancierasRepository.findOne({
      where: { id_entidad: id, id_usuario: idUsuario },
    });

    if (!entidad) {
      throw new ForbiddenException('No tienes permisos para modificar esta entidad financiera');
    }

    return entidad;
  }
}
