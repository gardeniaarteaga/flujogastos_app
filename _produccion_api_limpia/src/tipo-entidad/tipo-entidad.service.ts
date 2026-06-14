import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { isAdminOwned, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateTipoEntidadDto } from './dto/create-tipo-entidad.dto';
import { UpdateTipoEntidadDto } from './dto/update-tipo-entidad.dto';
import { TipoEntidad } from './entities/tipo-entidad.entity';

type TipoEntidadResponse = TipoEntidad & {
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
};

@Injectable()
export class TipoEntidadService {
  constructor(
    @InjectRepository(TipoEntidad)
    private readonly tipoEntidadRepository: Repository<TipoEntidad>,
  ) {}

  async create(
    createTipoEntidadDto: CreateTipoEntidadDto,
    idUsuario: number,
  ): Promise<TipoEntidadResponse> {
    const tipoEntidad = this.tipoEntidadRepository.create({
      id_usuario: idUsuario,
      descripcion: createTipoEntidadDto.descripcion.trim(),
      estado: createTipoEntidadDto.estado ?? true,
    });

    const savedTipoEntidad = await this.tipoEntidadRepository.save(tipoEntidad);
    const adminUserIds = await listAdminUserIds(this.tipoEntidadRepository);

    return this.toResponse(savedTipoEntidad, idUsuario, adminUserIds);
  }

  async findAll(idUsuario: number): Promise<TipoEntidadResponse[]> {
    const adminUserIds = await listAdminUserIds(this.tipoEntidadRepository);

    const tiposEntidad = await this.tipoEntidadRepository.find({
      where: this.buildVisibleWhere(idUsuario, adminUserIds),
      order: { id_usuario: 'ASC', id_tipo_entidad: 'ASC' },
    });

    return tiposEntidad.map((tipoEntidad) =>
      this.toResponse(tipoEntidad, idUsuario, adminUserIds),
    );
  }

  async findOne(id: number, idUsuario: number): Promise<TipoEntidadResponse> {
    const adminUserIds = await listAdminUserIds(this.tipoEntidadRepository);
    const tipoEntidad = await this.tipoEntidadRepository.findOne({
      where: this.buildVisibleWhere(idUsuario, adminUserIds, id),
    });

    if (!tipoEntidad) {
      throw new NotFoundException(`El tipo de entidad con id ${id} no existe`);
    }

    return this.toResponse(tipoEntidad, idUsuario, adminUserIds);
  }

  async update(
    id: number,
    updateTipoEntidadDto: UpdateTipoEntidadDto,
    idUsuario: number,
  ): Promise<TipoEntidadResponse> {
    const tipoEntidad = await this.findOwned(id, idUsuario);
    const adminUserIds = await listAdminUserIds(this.tipoEntidadRepository);

    if (isAdminOwned(adminUserIds, tipoEntidad.id_usuario)) {
      throw new ForbiddenException(
        'Los tipos de entidad creados por un administrador no se pueden editar',
      );
    }

    Object.assign(tipoEntidad, updateTipoEntidadDto);
    const updatedTipoEntidad = await this.tipoEntidadRepository.save(tipoEntidad);

    return this.toResponse(updatedTipoEntidad, idUsuario, adminUserIds);
  }

  async remove(id: number, idUsuario: number) {
    const tipoEntidad = await this.findOwned(id, idUsuario);
    const adminUserIds = await listAdminUserIds(this.tipoEntidadRepository);

    if (isAdminOwned(adminUserIds, tipoEntidad.id_usuario)) {
      throw new ForbiddenException(
        'Los tipos de entidad creados por un administrador no se pueden eliminar',
      );
    }

    return this.tipoEntidadRepository.remove(tipoEntidad);
  }

  private buildVisibleWhere(
    idUsuario: number,
    adminUserIds: number[],
    idTipoEntidad?: number,
  ): FindOptionsWhere<TipoEntidad>[] {
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));

    return usuariosVisibles.map((usuarioVisible) => ({
      ...(idTipoEntidad !== undefined ? { id_tipo_entidad: idTipoEntidad } : {}),
      id_usuario: usuarioVisible,
    }));
  }

  private async findOwned(id: number, idUsuario: number): Promise<TipoEntidad> {
    const tipoEntidad = await this.tipoEntidadRepository.findOne({
      where: { id_tipo_entidad: id, id_usuario: idUsuario },
    });

    if (!tipoEntidad) {
      throw new ForbiddenException('No tienes permisos para modificar este tipo de entidad');
    }

    return tipoEntidad;
  }

  private toResponse(
    tipoEntidad: TipoEntidad,
    idUsuarioActual: number,
    adminUserIds: number[],
  ): TipoEntidadResponse {
    const esPredeterminada = isAdminOwned(adminUserIds, tipoEntidad.id_usuario);
    const puedeEditar = tipoEntidad.id_usuario === idUsuarioActual && !esPredeterminada;

    return {
      ...tipoEntidad,
      es_predeterminada: esPredeterminada,
      puede_editar: puedeEditar,
      puede_eliminar: puedeEditar && !esPredeterminada,
    };
  }
}
