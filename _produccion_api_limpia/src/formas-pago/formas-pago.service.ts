import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import {
  buildVisibleUserIds,
  isAdminOwned,
  listAdminUserIds,
} from '../common/admin-visibility.util';
import { CreateFormaPagoDto } from './dto/create-forma-pago.dto';
import { UpdateFormaPagoDto } from './dto/update-forma-pago.dto';
import { FormaPago } from './entities/forma-pago.entity';
import { EntidadFinanciera } from '../entidades-financieras/entities/entidad-financiera.entity';
import { TipoProducto } from '../tipo-producto/entities/tipo-producto.entity';
import { TipoEntidad } from '../tipo-entidad/entities/tipo-entidad.entity';

type FormaPagoResponse = {
  id_forma: number;
  id_usuario: number | null;
  nombre_forma: string;
  id_entidad: number;
  id_tipo: number;
  tasa_anual: number | null;
  calcula_interes: boolean | null;
  recibe_estado_cuenta: boolean | null;
  aplica_membresia: boolean | null;
  mes_pago_membresia: number | null;
  dia_corte: number | null;
  dia_ultimo_pago: number | null;
  dias_gracia: number | null;
  estado: boolean;
  fecha_creacion: Date;
  entidad_financiera: {
    id_entidad: number;
    nombre_entidad: string;
    tipo_entidad: number | null;
    estado: boolean;
    tipoEntidad: {
      id_tipo_entidad: number;
      descripcion: string;
      estado: boolean;
    } | null;
  };
  tipo_producto: {
    id_tipo: number;
    nombre_tipo: string;
    pago_inmediato: boolean | null;
  };
};

@Injectable()
export class FormasPagoService {
  constructor(
    @InjectRepository(FormaPago)
    private readonly formasPagoRepository: Repository<FormaPago>,
    @InjectRepository(EntidadFinanciera)
    private readonly entidadesFinancierasRepository: Repository<EntidadFinanciera>,
    @InjectRepository(TipoEntidad)
    private readonly tipoEntidadRepository: Repository<TipoEntidad>,
    @InjectRepository(TipoProducto)
    private readonly tipoProductoRepository: Repository<TipoProducto>,
  ) {}

  async create(createFormaPagoDto: CreateFormaPagoDto, idUsuario: number) {
    const entidad = await this.resolveEntidadFinanciera(
      createFormaPagoDto.id_entidad,
      createFormaPagoDto.new_entidad,
      createFormaPagoDto.id_tipo_entidad,
      createFormaPagoDto.new_tipo_entidad,
      idUsuario,
    );

    const tipo = await this.resolveTipoProducto(
      createFormaPagoDto.id_tipo,
      createFormaPagoDto.new_tipo,
      idUsuario,
    );

    const forma = this.formasPagoRepository.create({
      nombre_metodo: createFormaPagoDto.nombre_forma.trim(),
      id_entidad: entidad.id_entidad,
      id_tipo_producto: tipo.id_tipo_producto,
      id_usuario: idUsuario,
      tasa_anual:
        createFormaPagoDto.tasa_anual === undefined || createFormaPagoDto.tasa_anual === null
          ? null
          : String(createFormaPagoDto.tasa_anual),
      calcula_interes: createFormaPagoDto.calcula_interes ?? false,
      recibe_estado_cuenta: createFormaPagoDto.recibe_estado_cuenta ?? false,
      aplica_membresia: createFormaPagoDto.aplica_membresia ?? false,
      mes_pago_membresia: createFormaPagoDto.mes_pago_membresia ?? null,
      dia_corte: createFormaPagoDto.dia_corte ?? null,
      dia_ultimo_pago: createFormaPagoDto.dia_ultimo_pago ?? null,
      dias_gracia: createFormaPagoDto.dias_gracia ?? null,
      estado: createFormaPagoDto.estado ?? true,
    });

    const savedForma = await this.formasPagoRepository.save(forma);
    const formaCompleta = await this.findVisible(savedForma.id_metodo, idUsuario);
    return this.toResponse(formaCompleta);
  }

  async findAll(idUsuario: number): Promise<FormaPagoResponse[]> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const formas = await this.formasPagoRepository.find({
      where: this.buildVisibleWhere(usuariosVisibles),
      relations: ['entidad_financiera', 'entidad_financiera.tipoEntidad', 'tipo_producto'],
      order: { id_usuario: 'ASC', id_metodo: 'ASC' },
    });

    return formas.map((forma) => this.toResponse(forma));
  }

  async findOne(id: number, idUsuario: number): Promise<FormaPagoResponse> {
    const forma = await this.findVisible(id, idUsuario);
    return this.toResponse(forma);
  }

  async update(id: number, updateFormaPagoDto: UpdateFormaPagoDto, idUsuario: number) {
    const adminUserIds = await this.getAdminUserIds();
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    const forma = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario)
      : await this.findOwned(id, idUsuario);

    if (!currentUserIsAdmin && isAdminOwned(adminUserIds, forma.id_usuario)) {
      throw new ForbiddenException(
        'Los metodos de pago creados por un administrador no se pueden editar',
      );
    }

    if (updateFormaPagoDto.nombre_forma !== undefined) {
      forma.nombre_metodo = updateFormaPagoDto.nombre_forma.trim();
    }

    if (
      updateFormaPagoDto.id_entidad !== undefined ||
      updateFormaPagoDto.new_entidad !== undefined
    ) {
      const entidad = await this.resolveEntidadFinanciera(
        updateFormaPagoDto.id_entidad,
        updateFormaPagoDto.new_entidad,
        updateFormaPagoDto.id_tipo_entidad,
        updateFormaPagoDto.new_tipo_entidad,
        idUsuario,
      );
      forma.id_entidad = entidad.id_entidad;
    }

    if (updateFormaPagoDto.id_tipo !== undefined || updateFormaPagoDto.new_tipo !== undefined) {
      const tipo = await this.resolveTipoProducto(
        updateFormaPagoDto.id_tipo,
        updateFormaPagoDto.new_tipo,
        idUsuario,
      );
      forma.id_tipo_producto = tipo.id_tipo_producto;
    }

    if (updateFormaPagoDto.tasa_anual !== undefined) {
      forma.tasa_anual =
        updateFormaPagoDto.tasa_anual === null ? null : String(updateFormaPagoDto.tasa_anual);
    }

    if (updateFormaPagoDto.calcula_interes !== undefined) {
      forma.calcula_interes = updateFormaPagoDto.calcula_interes;
    }

    if (updateFormaPagoDto.recibe_estado_cuenta !== undefined) {
      forma.recibe_estado_cuenta = updateFormaPagoDto.recibe_estado_cuenta;
    }

    if (updateFormaPagoDto.aplica_membresia !== undefined) {
      forma.aplica_membresia = updateFormaPagoDto.aplica_membresia;
    }

    if (updateFormaPagoDto.mes_pago_membresia !== undefined) {
      forma.mes_pago_membresia = updateFormaPagoDto.mes_pago_membresia;
    }

    if (updateFormaPagoDto.dia_corte !== undefined) {
      forma.dia_corte = updateFormaPagoDto.dia_corte;
    }

    if (updateFormaPagoDto.dia_ultimo_pago !== undefined) {
      forma.dia_ultimo_pago = updateFormaPagoDto.dia_ultimo_pago;
    }

    if (updateFormaPagoDto.dias_gracia !== undefined) {
      forma.dias_gracia = updateFormaPagoDto.dias_gracia;
    }

    if (updateFormaPagoDto.estado !== undefined) {
      forma.estado = updateFormaPagoDto.estado;
    }

    const updatedForma = await this.formasPagoRepository.save(forma);
    const formaCompleta = await this.findVisible(updatedForma.id_metodo, idUsuario);
    return this.toResponse(formaCompleta);
  }

  async remove(id: number, idUsuario: number) {
    const adminUserIds = await this.getAdminUserIds();
    const currentUserIsAdmin = adminUserIds.includes(idUsuario);
    const forma = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario)
      : await this.findOwned(id, idUsuario);

    if (!currentUserIsAdmin && isAdminOwned(adminUserIds, forma.id_usuario)) {
      throw new ForbiddenException(
        'Los metodos de pago creados por un administrador no se pueden eliminar',
      );
    }

    return this.formasPagoRepository.remove(forma);
  }

  private async resolveEntidadFinanciera(
    idEntidad?: number,
    newEntidad?: string,
    idTipoEntidad?: number,
    newTipoEntidad?: string,
    idUsuario: number = 1,
  ): Promise<EntidadFinanciera> {
    if (idEntidad !== undefined) {
      const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
      const entidadExistente = await this.entidadesFinancierasRepository.findOne({
        where: this.buildVisibleEntityWhere(usuariosVisibles, idEntidad),
      });

      if (!entidadExistente) {
        throw new NotFoundException(`Entidad financiera con id ${idEntidad} no existe`);
      }

      return entidadExistente;
    }

    const nombreNuevaEntidad = newEntidad?.trim();
    if (!nombreNuevaEntidad) {
      throw new BadRequestException(
        'Debe proporcionar una entidad financiera existente o escribir una nueva',
      );
    }

    const tipoEntidad = await this.resolveTipoEntidad(idTipoEntidad, newTipoEntidad, idUsuario);
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);

    const entidadExistentePorNombre = await this.entidadesFinancierasRepository
      .createQueryBuilder('entidad')
      .where('LOWER(entidad.nombre_entidad) = LOWER(:nombre)', { nombre: nombreNuevaEntidad })
      .andWhere('entidad.id_usuario IN (:...usuariosVisibles)', { usuariosVisibles })
      .getOne();

    if (entidadExistentePorNombre) {
      return entidadExistentePorNombre;
    }

    const nuevaEntidad = this.entidadesFinancierasRepository.create({
      nombre_entidad: nombreNuevaEntidad,
      tipo_entidad: tipoEntidad.id_tipo_entidad,
      id_usuario: idUsuario ?? null,
      estado: true,
    });

    return this.entidadesFinancierasRepository.save(nuevaEntidad);
  }

  private async resolveTipoEntidad(
    idTipoEntidad?: number,
    newTipoEntidad?: string,
    idUsuario: number = 1,
  ): Promise<TipoEntidad> {
    if (idTipoEntidad !== undefined) {
      const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
      const tipoEntidadExistente = await this.tipoEntidadRepository.findOne({
        where: this.buildVisibleTipoEntidadWhere(usuariosVisibles, idTipoEntidad),
      });

      if (!tipoEntidadExistente) {
        throw new NotFoundException(`Tipo de entidad con id ${idTipoEntidad} no existe`);
      }

      return tipoEntidadExistente;
    }

    const descripcionNuevoTipo = newTipoEntidad?.trim();
    if (!descripcionNuevoTipo) {
      throw new BadRequestException(
        'Debe proporcionar un tipo de entidad existente o escribir uno nuevo',
      );
    }
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);

    const tipoEntidadExistentePorDescripcion = await this.tipoEntidadRepository
      .createQueryBuilder('tipoEntidad')
      .where('LOWER(tipoEntidad.descripcion) = LOWER(:descripcion)', {
        descripcion: descripcionNuevoTipo,
      })
      .andWhere('tipoEntidad.id_usuario IN (:...usuariosVisibles)', { usuariosVisibles })
      .getOne();

    if (tipoEntidadExistentePorDescripcion) {
      return tipoEntidadExistentePorDescripcion;
    }

    const nuevoTipoEntidad = this.tipoEntidadRepository.create({
      descripcion: descripcionNuevoTipo,
      id_usuario: idUsuario ?? null,
      estado: true,
    });

    return this.tipoEntidadRepository.save(nuevoTipoEntidad);
  }

  private async resolveTipoProducto(
    idTipo?: number,
    newTipo?: string,
    idUsuario: number = 1,
  ): Promise<TipoProducto> {
    if (idTipo !== undefined) {
      const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
      const tipoExistente = await this.tipoProductoRepository.findOne({
        where: this.buildVisibleTipoProductoWhere(usuariosVisibles, idTipo),
      });

      if (!tipoExistente) {
        throw new NotFoundException(`Tipo de producto con id ${idTipo} no existe`);
      }

      return tipoExistente;
    }

    const nombreNuevoTipo = newTipo?.trim();
    if (!nombreNuevoTipo) {
      throw new BadRequestException('Debe proporcionar un tipo de producto existente o escribir uno nuevo');
    }

    const tipoExistentePorNombre = await this.tipoProductoRepository
      .createQueryBuilder('tipo')
      .where('LOWER(tipo.nombre_tipo) = LOWER(:nombre)', { nombre: nombreNuevoTipo })
      .andWhere('tipo.id_usuario IN (:...usuariosVisibles)', {
        usuariosVisibles: await this.getVisibleUserIds(idUsuario),
      })
      .getOne();

    if (tipoExistentePorNombre) {
      return tipoExistentePorNombre;
    }

    const nuevoTipo = this.tipoProductoRepository.create({
      nombre_tipo: nombreNuevoTipo,
      id_usuario: idUsuario,
    });

    return this.tipoProductoRepository.save(nuevoTipo);
  }

  private buildVisibleWhere(
    usuariosVisibles: number[],
    idForma?: number,
  ): FindOptionsWhere<FormaPago>[] {
    return usuariosVisibles.map((usuarioVisible) => ({
      ...(idForma !== undefined ? { id_metodo: idForma } : {}),
      id_usuario: usuarioVisible,
    }));
  }

  private buildVisibleEntityWhere(
    usuariosVisibles: number[],
    idEntidad: number,
  ): FindOptionsWhere<EntidadFinanciera>[] {
    return usuariosVisibles.map((usuarioVisible) => ({
      id_entidad: idEntidad,
      id_usuario: usuarioVisible,
    }));
  }

  private buildVisibleTipoEntidadWhere(
    usuariosVisibles: number[],
    idTipoEntidad: number,
  ): FindOptionsWhere<TipoEntidad>[] {
    return usuariosVisibles.map((usuarioVisible) => ({
      id_tipo_entidad: idTipoEntidad,
      id_usuario: usuarioVisible,
    }));
  }

  private buildVisibleTipoProductoWhere(
    usuariosVisibles: number[],
    idTipoProducto: number,
  ): FindOptionsWhere<TipoProducto>[] {
    return usuariosVisibles.map((usuarioVisible) => ({
      id_tipo_producto: idTipoProducto,
      id_usuario: usuarioVisible,
    }));
  }

  private async findVisible(id: number, idUsuario: number): Promise<FormaPago> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const forma = await this.formasPagoRepository.findOne({
      where: this.buildVisibleWhere(usuariosVisibles, id),
      relations: ['entidad_financiera', 'entidad_financiera.tipoEntidad', 'tipo_producto'],
    });

    if (!forma) {
      throw new NotFoundException(`La forma de pago con id ${id} no existe`);
    }

    return forma;
  }

  private getVisibleUserIds(idUsuario: number): Promise<number[]> {
    return buildVisibleUserIds(this.formasPagoRepository, idUsuario);
  }

  private getAdminUserIds(): Promise<number[]> {
    return listAdminUserIds(this.formasPagoRepository);
  }

  private async findOwned(id: number, idUsuario: number): Promise<FormaPago> {
    const forma = await this.formasPagoRepository.findOne({
      where: { id_metodo: id, id_usuario: idUsuario },
      relations: ['entidad_financiera', 'entidad_financiera.tipoEntidad', 'tipo_producto'],
    });

    if (!forma) {
      throw new ForbiddenException('No tienes permisos para modificar esta forma de pago');
    }

    return forma;
  }

  private toResponse(forma: FormaPago): FormaPagoResponse {
    return {
      id_forma: forma.id_metodo,
      id_usuario: forma.id_usuario,
      nombre_forma: forma.nombre_metodo,
      id_entidad: forma.id_entidad,
      id_tipo: forma.id_tipo_producto,
      tasa_anual: forma.tasa_anual !== null ? Number(forma.tasa_anual) : null,
      calcula_interes: forma.calcula_interes,
      recibe_estado_cuenta: forma.recibe_estado_cuenta,
      aplica_membresia: forma.aplica_membresia,
      mes_pago_membresia: forma.mes_pago_membresia,
      dia_corte: forma.dia_corte,
      dia_ultimo_pago: forma.dia_ultimo_pago,
      dias_gracia: forma.dias_gracia,
      estado: forma.estado,
      fecha_creacion: forma.fecha_creacion,
      entidad_financiera: {
        id_entidad: forma.entidad_financiera.id_entidad,
        nombre_entidad: forma.entidad_financiera.nombre_entidad,
        tipo_entidad: forma.entidad_financiera.tipo_entidad,
        estado: forma.entidad_financiera.estado,
        tipoEntidad: forma.entidad_financiera.tipoEntidad
          ? {
              id_tipo_entidad: forma.entidad_financiera.tipoEntidad.id_tipo_entidad,
              descripcion: forma.entidad_financiera.tipoEntidad.descripcion,
              estado: forma.entidad_financiera.tipoEntidad.estado,
            }
          : null,
      },
      tipo_producto: {
        id_tipo: forma.tipo_producto.id_tipo_producto,
        nombre_tipo: forma.tipo_producto.nombre_tipo,
        pago_inmediato: forma.tipo_producto.pago_inmediato ?? null,
      },
    };
  }
}

