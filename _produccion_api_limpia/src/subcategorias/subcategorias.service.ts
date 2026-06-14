import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { isAdminOwned, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateSubcategoriaDto } from './dto/create-subcategoria.dto';
import { UpdateSubcategoriaDto } from './dto/update-subcategoria.dto';
import { Subcategoria } from './entities/subcategoria.entity';
import { Categoria } from '../categorias/entities/categoria.entity';

type SubcategoriaResponse = Subcategoria & {
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
};

@Injectable()
export class SubcategoriasService {
  constructor(
    @InjectRepository(Subcategoria)
    private readonly subcategoriasRepository: Repository<Subcategoria>,
    @InjectRepository(Categoria)
    private readonly categoriasRepository: Repository<Categoria>,
  ) {}

  async create(
    createSubcategoriaDto: CreateSubcategoriaDto,
    idUsuario: number,
  ): Promise<SubcategoriaResponse> {
    const adminUserIds = await listAdminUserIds(this.subcategoriasRepository);
    await this.findVisibleCategoria(
      createSubcategoriaDto.id_categoria,
      idUsuario,
      adminUserIds,
    );

    const subcategoria = this.subcategoriasRepository.create({
      ...createSubcategoriaDto,
      descripcion: createSubcategoriaDto.descripcion ?? null,
      estado: createSubcategoriaDto.estado ?? true,
      id_usuario: idUsuario,
    });

    return this.subcategoriasRepository
      .save(subcategoria)
      .then((savedSubcategoria) =>
        this.toResponse(savedSubcategoria, idUsuario, adminUserIds),
      )
      .catch((error: Error) => {
        throw new BadRequestException(
          `No se pudo guardar la subcategoria: ${error.message}`,
        );
      });
  }

  async findAll(idUsuario: number): Promise<SubcategoriaResponse[]> {
    const adminUserIds = await listAdminUserIds(this.subcategoriasRepository);
    const categoriasVisibles = await this.findCategoriasVisibles(idUsuario, adminUserIds);
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));

    if (categoriasVisibles.length === 0) {
      return [];
    }

    const subcategorias = await this.subcategoriasRepository.find({
      where: {
        id_categoria: In(categoriasVisibles.map((categoria) => categoria.id_categoria)),
        id_usuario: In(usuariosVisibles),
      },
      order: { id_subcategoria: 'ASC' },
    });

    return subcategorias.map((subcategoria) =>
      this.toResponse(subcategoria, idUsuario, adminUserIds),
    );
  }

  async findOne(id: number, idUsuario: number): Promise<SubcategoriaResponse> {
    const adminUserIds = await listAdminUserIds(this.subcategoriasRepository);
    const subcategoria = await this.findVisibleSubcategoria(
      id,
      idUsuario,
      adminUserIds,
    );

    return this.toResponse(subcategoria, idUsuario, adminUserIds);
  }

  async update(
    id: number,
    updateSubcategoriaDto: UpdateSubcategoriaDto,
    idUsuario: number,
  ): Promise<SubcategoriaResponse> {
    const adminUserIds = await listAdminUserIds(this.subcategoriasRepository);
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    const subcategoria = currentUserIsAdmin
      ? await this.findVisibleSubcategoria(id, idUsuario, adminUserIds)
      : await this.findOwnedSubcategoria(id, idUsuario);

    const categoria = await this.findVisibleCategoria(
      updateSubcategoriaDto.id_categoria ?? subcategoria.id_categoria,
      idUsuario,
      adminUserIds,
    );

    Object.assign(subcategoria, updateSubcategoriaDto);
    subcategoria.id_categoria = categoria.id_categoria;

    const updatedSubcategoria = await this.subcategoriasRepository.save(subcategoria);
    return this.toResponse(updatedSubcategoria, idUsuario, adminUserIds);
  }

  async remove(id: number, idUsuario: number) {
    const adminUserIds = await listAdminUserIds(this.subcategoriasRepository);
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    if (!currentUserIsAdmin) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar subcategorias',
      );
    }

    const subcategoria = await this.findVisibleSubcategoria(
      id,
      idUsuario,
      adminUserIds,
    );

    await this.subcategoriasRepository.remove(subcategoria);

    return {
      message: `La subcategoria con id ${id} fue eliminada`,
    };
  }

  private async findVisibleSubcategoria(
    id: number,
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<Subcategoria> {
    const subcategoria = await this.subcategoriasRepository.findOne({
      where: { id_subcategoria: id },
    });

    if (!subcategoria) {
      throw new NotFoundException(`La subcategoria con id ${id} no existe`);
    }

    await this.findVisibleCategoria(
      subcategoria.id_categoria,
      idUsuario,
      adminUserIds,
    );

    return subcategoria;
  }

  private async findOwnedSubcategoria(
    id: number,
    idUsuario: number,
  ): Promise<Subcategoria> {
    const subcategoria = await this.subcategoriasRepository.findOne({
      where: { id_subcategoria: id, id_usuario: idUsuario },
    });

    if (!subcategoria) {
      throw new ForbiddenException(
        'No tienes permisos para modificar esta subcategoria',
      );
    }

    return subcategoria;
  }

  private async findCategoriasVisibles(
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<Categoria[]> {
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));

    return this.categoriasRepository.find({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_usuario: usuarioVisible,
      })),
      order: { id_usuario: 'ASC', id_categoria: 'ASC' },
    });
  }

  private async findVisibleCategoria(
    idCategoria: number,
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<Categoria> {
    const usuariosVisibles = Array.from(new Set([...adminUserIds, idUsuario]));
    const categoria = await this.categoriasRepository.findOne({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_categoria: idCategoria,
        id_usuario: usuarioVisible,
      })),
    });

    if (!categoria) {
      throw new NotFoundException(
        `La categoria asociada a la subcategoria con id ${idCategoria} no existe`,
      );
    }

    return categoria;
  }

  private toResponse(
    subcategoria: Subcategoria,
    idUsuarioActual: number,
    adminUserIds: number[],
  ): SubcategoriaResponse {
    const esPredeterminada = isAdminOwned(adminUserIds, subcategoria.id_usuario);
    const currentUserIsAdmin = adminUserIds.includes(idUsuarioActual);
    const puedeEditar =
      currentUserIsAdmin || (subcategoria.id_usuario === idUsuarioActual && !esPredeterminada);

    return {
      ...subcategoria,
      es_predeterminada: esPredeterminada,
      puede_editar: puedeEditar,
      puede_eliminar: currentUserIsAdmin,
    };
  }
}
