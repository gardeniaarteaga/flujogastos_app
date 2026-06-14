import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { buildVisibleUserIds, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateTipoProductoDto } from './dto/create-tipo-producto.dto';
import { UpdateTipoProductoDto } from './dto/update-tipo-producto.dto';
import { TipoProducto } from './entities/tipo-producto.entity';

type TipoProductoResponse = TipoProducto & {
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
};

@Injectable()
export class TipoProductoService {
  constructor(
    @InjectRepository(TipoProducto)
    private readonly tipoProductoRepository: Repository<TipoProducto>,
  ) {}

  async create(
    createTipoProductoDto: CreateTipoProductoDto,
    idUsuario: number,
  ): Promise<TipoProductoResponse> {
    const tipo = this.tipoProductoRepository.create({
      nombre_tipo: createTipoProductoDto.nombre_tipo.trim(),
      id_usuario: idUsuario,
    });

    const savedTipo = await this.tipoProductoRepository.save(tipo);
    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    return this.toResponse(savedTipo, idUsuario, undefined, adminUserIds);
  }

  async findAll(idUsuario: number): Promise<TipoProductoResponse[]> {
    const usuariosVisibles = await buildVisibleUserIds(
      this.tipoProductoRepository,
      idUsuario,
    );

    const tipos = await this.tipoProductoRepository.find({
      where: this.buildVisibleWhere(usuariosVisibles),
      order: { id_usuario: 'ASC', id_tipo_producto: 'ASC' },
    });

    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    const currentUserIsAdmin = await this.isCurrentUserAdmin(idUsuario);
    return tipos.map((tipo) =>
      this.toResponse(tipo, idUsuario, currentUserIsAdmin, adminUserIds),
    );
  }

  async findOne(id: number, idUsuario: number): Promise<TipoProductoResponse> {
    const usuariosVisibles = await buildVisibleUserIds(
      this.tipoProductoRepository,
      idUsuario,
    );
    const tipo = await this.tipoProductoRepository.findOne({
      where: this.buildVisibleWhere(usuariosVisibles, id),
    });

    if (!tipo) {
      throw new NotFoundException(`El tipo de producto con id ${id} no existe`);
    }

    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    return this.toResponse(tipo, idUsuario, undefined, adminUserIds);
  }

  async update(id: number, updateTipoProductoDto: UpdateTipoProductoDto, idUsuario: number) {
    const currentUserIsAdmin = await this.isCurrentUserAdmin(idUsuario);
    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    const tipo = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findOwned(id, idUsuario);

    Object.assign(tipo, updateTipoProductoDto);
    const updatedTipo = await this.tipoProductoRepository.save(tipo);
    return this.toResponse(updatedTipo, idUsuario, currentUserIsAdmin, adminUserIds);
  }

  async remove(id: number, idUsuario: number) {
    const currentUserIsAdmin = await this.isCurrentUserAdmin(idUsuario);
    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    const tipo = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findOwned(id, idUsuario);

    await this.tipoProductoRepository.remove(tipo);

    return {
      message: `El tipo de producto con id ${id} fue eliminado`,
    };
  }

  private buildVisibleWhere(
    usuariosVisibles: number[],
    idTipoProducto?: number,
  ): FindOptionsWhere<TipoProducto>[] {
    return usuariosVisibles.map((usuarioVisible) => ({
      ...(idTipoProducto !== undefined ? { id_tipo_producto: idTipoProducto } : {}),
      id_usuario: usuarioVisible,
    }));
  }

  private async findVisible(
    id: number,
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<TipoProducto> {
    const tipo = await this.tipoProductoRepository.findOne({
      where: this.buildVisibleWhere(
        Array.from(new Set([...adminUserIds, idUsuario])),
        id,
      ),
    });

    if (!tipo) {
      throw new NotFoundException(`El tipo de producto con id ${id} no existe`);
    }

    return tipo;
  }

  private async findOwned(id: number, idUsuario: number): Promise<TipoProducto> {
    const tipo = await this.tipoProductoRepository.findOne({
      where: { id_tipo_producto: id, id_usuario: idUsuario },
    });

    if (!tipo) {
      throw new ForbiddenException('No tienes permisos para modificar este tipo de producto');
    }

    return tipo;
  }

  private async isCurrentUserAdmin(idUsuario: number): Promise<boolean> {
    const adminUserIds = await listAdminUserIds(this.tipoProductoRepository);
    return adminUserIds.includes(idUsuario);
  }

  private toResponse(
    tipo: TipoProducto,
    currentUserId: number,
    currentUserIsAdmin?: boolean,
    adminUserIds: number[] = [],
  ): TipoProductoResponse {
    const isAdminOwned = adminUserIds.includes(tipo.id_usuario);
    const canManage = currentUserIsAdmin ?? tipo.id_usuario === currentUserId;

    return {
      ...tipo,
      es_predeterminada: isAdminOwned,
      puede_editar: canManage || tipo.id_usuario === currentUserId,
      puede_eliminar: canManage || tipo.id_usuario === currentUserId,
    };
  }
}
