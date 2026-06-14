import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { isAdminOwned, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';
import { Categoria } from './entities/categoria.entity';

type CategoriaResponse = Categoria & {
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
};

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly categoriasRepository: Repository<Categoria>,
  ) {}

  create(
    createCategoriaDto: CreateCategoriaDto,
    idUsuario: number,
  ): Promise<CategoriaResponse> {
    return listAdminUserIds(this.categoriasRepository).then((adminUserIds) => {
    const categoria = this.categoriasRepository.create({
      ...createCategoriaDto,
      descripcion: createCategoriaDto.descripcion ?? null,
      estado: createCategoriaDto.estado ?? true,
      id_usuario: idUsuario,
    });

    return this.categoriasRepository
      .save(categoria)
        .then((savedCategoria) =>
          this.toResponse(savedCategoria, idUsuario, adminUserIds),
        );
    });
  }

  async findAll(idUsuario: number): Promise<CategoriaResponse[]> {
    const adminUserIds = await listAdminUserIds(this.categoriasRepository);
    const categorias = await this.categoriasRepository.find({
      where: this.buildVisibleWhere(idUsuario, adminUserIds),
      order: { id_usuario: 'ASC', id_categoria: 'ASC' },
    });

    return categorias.map((categoria) =>
      this.toResponse(categoria, idUsuario, adminUserIds),
    );
  }

  async findOne(id: number, idUsuario: number): Promise<CategoriaResponse> {
    const adminUserIds = await listAdminUserIds(this.categoriasRepository);
    const categoria = await this.categoriasRepository.findOne({
      where: this.buildVisibleWhere(idUsuario, adminUserIds, id),
    });

    if (!categoria) {
      throw new NotFoundException(`La categoria con id ${id} no existe`);
    }

    return this.toResponse(categoria, idUsuario, adminUserIds);
  }

  async update(
    id: number,
    updateCategoriaDto: UpdateCategoriaDto,
    idUsuario: number,
  ): Promise<CategoriaResponse> {
    const adminUserIds = await listAdminUserIds(this.categoriasRepository);
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    const categoria = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findOwned(id, idUsuario);

    Object.assign(categoria, updateCategoriaDto);

    const updatedCategoria = await this.categoriasRepository.save(categoria);

    return this.toResponse(updatedCategoria, idUsuario, adminUserIds);
  }

  async remove(id: number, idUsuario: number) {
    const adminUserIds = await listAdminUserIds(this.categoriasRepository);
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    const categoria = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findOwned(id, idUsuario);

    await this.categoriasRepository.remove(categoria);

    return {
      message: `La categoria con id ${id} fue eliminada`,
    };
  }

  private buildVisibleWhere(
    idUsuario: number,
    adminUserIds: number[],
    idCategoria?: number,
  ): FindOptionsWhere<Categoria>[] {
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));

    return usuariosVisibles.map((usuarioVisible) => ({
      ...(idCategoria !== undefined ? { id_categoria: idCategoria } : {}),
      id_usuario: usuarioVisible,
    }));
  }

  private async findOwned(id: number, idUsuario: number): Promise<Categoria> {
    const categoria = await this.categoriasRepository.findOne({
      where: { id_categoria: id, id_usuario: idUsuario },
    });

    if (!categoria) {
      throw new ForbiddenException(
        'No tienes permisos para modificar esta categoria',
      );
    }

    return categoria;
  }

  private async findVisible(
    id: number,
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<Categoria> {
    const categoria = await this.categoriasRepository.findOne({
      where: this.buildVisibleWhere(idUsuario, adminUserIds, id),
    });

    if (!categoria) {
      throw new ForbiddenException(
        'No tienes permisos para modificar esta categoria',
      );
    }

    return categoria;
  }

  private toResponse(
    categoria: Categoria,
    idUsuarioActual: number,
    adminUserIds: number[],
  ): CategoriaResponse {
    const esPredeterminada = isAdminOwned(adminUserIds, categoria.id_usuario);
    const currentUserIsAdmin = adminUserIds.includes(idUsuarioActual);
    const puedeEditar = currentUserIsAdmin || (categoria.id_usuario === idUsuarioActual && !esPredeterminada);

    return {
      ...categoria,
      es_predeterminada: esPredeterminada,
      puede_editar: puedeEditar,
      puede_eliminar: currentUserIsAdmin || (puedeEditar && !esPredeterminada),
    };
  }
}
