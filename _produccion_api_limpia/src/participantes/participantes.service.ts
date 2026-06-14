import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';

import { isAdminOwned, listAdminUserIds } from '../common/admin-visibility.util';
import { CreateParticipanteDto } from './dto/create-participante.dto';
import { UpdateParticipanteDto } from './dto/update-participante.dto';
import { Participante } from './entities/participante.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';

type ParticipanteResponse = {
  id_participante: number;
  id_usuario: number;
  id_usuario_relacionado: number | null;
  id_usuario_titular: number | null;
  nombre_participante: string;
  correo_electronico: string | null;
  celular: string | null;
  porcentaje_participacion: number | null;
  estado: string;
  fecha_creacion: Date;
  es_predeterminada: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
};

@Injectable()
export class ParticipantesService {
  constructor(
    @InjectRepository(Participante)
    private readonly participantesRepository: Repository<Participante>,
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
  ) {}

  async create(
    createParticipanteDto: CreateParticipanteDto,
    idUsuario: number,
  ): Promise<ParticipanteResponse> {
    const adminUserIds = await listAdminUserIds(this.participantesRepository);
    const currentUserRoleId = await this.getCurrentUserRoleId(idUsuario);
    const correoElectronico = this.normalizeEmail(createParticipanteDto.correo_electronico);
    await this.ensureNoDuplicateEmailForOwner(idUsuario, correoElectronico);
    const relatedUserId = await this.resolveRelatedUserId(correoElectronico);
    const participante = this.participantesRepository.create({
      nombre_participante: createParticipanteDto.nombre_participante.trim(),
      correo_electronico: correoElectronico,
      celular: this.normalizePhone(createParticipanteDto.celular),
      porcentaje_participacion:
        createParticipanteDto.porcentaje_participacion === undefined ||
        createParticipanteDto.porcentaje_participacion === null
          ? null
          : String(createParticipanteDto.porcentaje_participacion),
      estado: createParticipanteDto.estado ?? 'ACTIVO',
      id_usuario: idUsuario,
      id_usuario_titular: null,
      id_usuario_relacionado: relatedUserId,
    });

    const savedParticipante = await this.participantesRepository.save(participante);
    return this.toResponse(
      savedParticipante,
      idUsuario,
      adminUserIds,
      currentUserRoleId,
    );
  }

  async findAll(idUsuario: number): Promise<ParticipanteResponse[]> {
    const adminUserIds = await listAdminUserIds(this.participantesRepository);
    const currentUserRoleId = await this.getCurrentUserRoleId(idUsuario);
    const participantes = await this.participantesRepository.find({
      where: this.buildVisibleWhere(idUsuario, adminUserIds),
      order: { id_usuario: 'ASC', id_participante: 'ASC' },
    });
    await this.syncAssociatedUsers(participantes);

    return participantes.map((participante) =>
      this.toResponse(participante, idUsuario, adminUserIds, currentUserRoleId),
    );
  }

  async findOne(id: number, idUsuario: number): Promise<ParticipanteResponse> {
    const adminUserIds = await listAdminUserIds(this.participantesRepository);
    const currentUserRoleId = await this.getCurrentUserRoleId(idUsuario);
    const participante = await this.findVisible(id, idUsuario, adminUserIds);
    await this.syncAssociatedUsers([participante]);
    return this.toResponse(participante, idUsuario, adminUserIds, currentUserRoleId);
  }

  async update(
    id: number,
    updateParticipanteDto: UpdateParticipanteDto,
    idUsuario: number,
  ): Promise<ParticipanteResponse> {
    const adminUserIds = await listAdminUserIds(this.participantesRepository);
    const currentUserRoleId = await this.getCurrentUserRoleId(idUsuario);
    const currentUserIsAdmin =
      currentUserRoleId === 1 || adminUserIds.includes(idUsuario);

    const participante = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findManageable(id, idUsuario);

    if (
      !currentUserIsAdmin &&
      isAdminOwned(adminUserIds, participante.id_usuario) &&
      participante.id_usuario_titular !== idUsuario
    ) {
      throw new ForbiddenException(
        'Los participantes creados por un administrador no se pueden editar',
      );
    }

    const updateBlockedReason = this.getProtectedParticipantReason(
      participante,
      idUsuario,
      adminUserIds,
      'editar',
    );

    if (updateBlockedReason) {
      throw new ForbiddenException(updateBlockedReason);
    }

    if (updateParticipanteDto.nombre_participante !== undefined) {
      participante.nombre_participante = updateParticipanteDto.nombre_participante.trim();
    }

    if (updateParticipanteDto.correo_electronico !== undefined) {
      participante.correo_electronico = this.normalizeEmail(
        updateParticipanteDto.correo_electronico,
      );
    }

    if (updateParticipanteDto.celular !== undefined) {
      participante.celular = this.normalizePhone(updateParticipanteDto.celular);
    }

    if (updateParticipanteDto.porcentaje_participacion !== undefined) {
      participante.porcentaje_participacion =
        updateParticipanteDto.porcentaje_participacion === null
          ? null
          : String(updateParticipanteDto.porcentaje_participacion);
    }

    if (updateParticipanteDto.estado !== undefined) {
      participante.estado = updateParticipanteDto.estado;
    }

    const relatedUserId =
      participante.id_usuario_titular === null
        ? await this.resolveRelatedUserId(participante.correo_electronico)
        : null;
    await this.ensureNoDuplicateEmailForOwner(
      participante.id_usuario,
      participante.correo_electronico,
      participante.id_participante,
    );
    participante.id_usuario_relacionado = relatedUserId;

    const updatedParticipante = await this.participantesRepository.save(participante);
    return this.toResponse(
      updatedParticipante,
      idUsuario,
      adminUserIds,
      currentUserRoleId,
    );
  }

  async remove(id: number, idUsuario: number) {
    const adminUserIds = await listAdminUserIds(this.participantesRepository);
    const currentUserRoleId = await this.getCurrentUserRoleId(idUsuario);
    const currentUserIsAdmin =
      currentUserRoleId === 1 || adminUserIds.includes(idUsuario);

    const participante = currentUserIsAdmin
      ? await this.findVisible(id, idUsuario, adminUserIds)
      : await this.findManageable(id, idUsuario);

    if (
      !currentUserIsAdmin &&
      isAdminOwned(adminUserIds, participante.id_usuario) &&
      participante.id_usuario_titular !== idUsuario
    ) {
      throw new ForbiddenException(
        'Los participantes creados por un administrador no se pueden eliminar',
      );
    }

    const deleteBlockedReason = this.getProtectedParticipantReason(
      participante,
      idUsuario,
      adminUserIds,
      'eliminar',
    );

    if (deleteBlockedReason) {
      throw new ForbiddenException(deleteBlockedReason);
    }

    await this.participantesRepository.remove(participante);

    return {
      message: `El participante con id ${id} fue eliminado`,
    };
  }

  private buildVisibleWhere(
    idUsuario: number,
    _adminUserIds: number[],
    idParticipante?: number,
  ): FindOptionsWhere<Participante>[] {
    const baseWhere =
      idParticipante !== undefined ? { id_participante: idParticipante } : {};

    return [
      {
        ...baseWhere,
        id_usuario: idUsuario,
        id_usuario_titular: IsNull(),
      },
      {
        ...baseWhere,
        id_usuario_titular: idUsuario,
      },
    ];
  }

  private async findVisible(
    id: number,
    idUsuario: number,
    adminUserIds: number[],
  ): Promise<Participante> {
    const participante = await this.participantesRepository.findOne({
      where: this.buildVisibleWhere(idUsuario, adminUserIds, id),
    });

    if (!participante) {
      throw new NotFoundException(`El participante con id ${id} no existe`);
    }

    return participante;
  }

  private async findOwned(
    id: number,
    idUsuario: number,
  ): Promise<Participante> {
    const participante = await this.participantesRepository.findOne({
      where: { id_participante: id, id_usuario: idUsuario },
    });

    if (!participante) {
      throw new ForbiddenException(
        'No tienes permisos para modificar este participante',
      );
    }

    return participante;
  }

  private async findManageable(
    id: number,
    idUsuario: number,
  ): Promise<Participante> {
    const participante = await this.participantesRepository.findOne({
      where: [
        { id_participante: id, id_usuario: idUsuario },
        { id_participante: id, id_usuario_titular: idUsuario },
      ],
    });

    if (!participante) {
      throw new ForbiddenException(
        'No tienes permisos para modificar este participante',
      );
    }

    return participante;
  }

  private toResponse(
    participante: Participante,
    idUsuarioActual: number,
    adminUserIds: number[],
    currentUserRoleId: number | null,
  ): ParticipanteResponse {
    const esPredeterminada =
      isAdminOwned(adminUserIds, participante.id_usuario) &&
      participante.id_usuario_titular === null;
    const currentUserIsAdmin =
      currentUserRoleId === 1 || adminUserIds.includes(idUsuarioActual);
    const currentUserIsLinked = participante.id_usuario_titular === idUsuarioActual;
    const currentUserOwnsParticipante = participante.id_usuario === idUsuarioActual;
    const isTitular = this.isTitularParticipante(participante, idUsuarioActual);
    const isAdminLinkedParticipante = this.isAdminLinkedParticipante(
      participante,
      adminUserIds,
    );
    const isProtectedParticipant = isTitular || isAdminLinkedParticipante;
    const puedeEditar = currentUserIsAdmin
      ? !isProtectedParticipant
      : !isProtectedParticipant &&
        (currentUserIsLinked || (currentUserOwnsParticipante && !esPredeterminada));

    return {
      id_participante: participante.id_participante,
      id_usuario: participante.id_usuario,
      id_usuario_relacionado: participante.id_usuario_relacionado ?? null,
      id_usuario_titular: participante.id_usuario_titular ?? null,
      nombre_participante: participante.nombre_participante,
      correo_electronico: participante.correo_electronico ?? null,
      celular: participante.celular ?? null,
      porcentaje_participacion:
        participante.porcentaje_participacion !== null
          ? Number(participante.porcentaje_participacion)
          : null,
      estado: participante.estado ?? 'ACTIVO',
      fecha_creacion: participante.fecha_creacion,
      es_predeterminada: esPredeterminada,
      puede_editar: puedeEditar,
      puede_eliminar:
        !isProtectedParticipant &&
        (currentUserIsAdmin ? true : currentUserOwnsParticipante && !esPredeterminada),
    };
  }

  private isTitularParticipante(
    participante: Participante,
    idUsuarioActual: number,
  ): boolean {
    return participante.id_usuario_titular === idUsuarioActual;
  }

  private isAdminLinkedParticipante(
    participante: Participante,
    adminUserIds: number[],
  ): boolean {
    return (
      participante.id_usuario_titular !== null &&
      adminUserIds.includes(participante.id_usuario_titular)
    );
  }

  private getProtectedParticipantReason(
    participante: Participante,
    idUsuarioActual: number,
    adminUserIds: number[],
    action: 'editar' | 'eliminar',
  ): string | null {
    if (this.isTitularParticipante(participante, idUsuarioActual)) {
      return `El participante titular del usuario logueado no se puede ${action}`;
    }

    if (this.isAdminLinkedParticipante(participante, adminUserIds)) {
      return `Los participantes asociados a usuarios administradores no se pueden ${action}`;
    }

    return null;
  }

  private async resolveRelatedUserId(email?: string | null): Promise<number | null> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return null;
    }

    const usuario = await this.usuariosRepository
      .createQueryBuilder('usuario')
      .select(['usuario.id_usuario', 'usuario.username'])
      .where('LOWER(usuario.username) = :email', { email: normalizedEmail })
      .andWhere("COALESCE(usuario.estado, 'ACTIVO') = 'ACTIVO'")
      .getOne();

    return usuario?.id_usuario ?? null;
  }

  private async ensureNoDuplicateEmailForOwner(
    ownerUserId: number,
    email?: string | null,
    currentParticipanteId?: number,
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return;
    }

    const duplicateQuery = this.participantesRepository
      .createQueryBuilder('participante')
      .where('participante.id_usuario = :ownerUserId', { ownerUserId })
      .andWhere('LOWER(participante.correo_electronico) = :email', {
        email: normalizedEmail,
      });

    if (currentParticipanteId !== undefined) {
      duplicateQuery.andWhere('participante.id_participante != :currentParticipanteId', {
        currentParticipanteId,
      });
    }

    const participanteExistente = await duplicateQuery.getOne();

    if (
      participanteExistente
    ) {
      throw new ConflictException(
        'Ya existe un participante con ese mismo correo dentro de tu catalogo.',
      );
    }
  }

  private async syncAssociatedUsers(participantes: Participante[]): Promise<void> {
    if (participantes.length === 0) {
      return;
    }

    const normalizedEmails = Array.from(
      new Set(
        participantes
          .map((participante) => this.normalizeEmail(participante.correo_electronico))
          .filter((email): email is string => Boolean(email)),
      ),
    );

    if (normalizedEmails.length === 0) {
      participantes.forEach((participante) => {
        participante.id_usuario_relacionado = null;
      });
      return;
    }

    const usuarios = await this.usuariosRepository
      .createQueryBuilder('usuario')
      .select(['usuario.id_usuario', 'usuario.username'])
      .where('LOWER(usuario.username) IN (:...emails)', { emails: normalizedEmails })
      .andWhere("COALESCE(usuario.estado, 'ACTIVO') = 'ACTIVO'")
      .getMany();
    const usuariosByEmail = new Map(
      usuarios.map((usuario) => [usuario.username.trim().toLowerCase(), usuario.id_usuario]),
    );
    const participantesActualizados = participantes.filter((participante) => {
      const relatedUserId =
        participante.id_usuario_titular === null
          ? usuariosByEmail.get(this.normalizeEmail(participante.correo_electronico) ?? '') ??
            null
          : null;

      if ((participante.id_usuario_relacionado ?? null) === relatedUserId) {
        return false;
      }

      participante.id_usuario_relacionado = relatedUserId;
      return true;
    });

    if (participantesActualizados.length > 0) {
      await this.participantesRepository.save(participantesActualizados);
    }
  }

  private normalizeEmail(value?: string | null): string | null {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue ? normalizedValue : null;
  }

  private normalizePhone(value?: string | null): string | null {
    const normalizedValue = value?.replace(/\D/g, '').trim();
    return normalizedValue ? normalizedValue : null;
  }

  private async getCurrentUserRoleId(idUsuario: number): Promise<number | null> {
    const usuario = await this.participantesRepository.manager.getRepository(Usuario).findOne({
      select: { id_rol: true },
      where: { id_usuario: idUsuario },
    });

    return usuario?.id_rol ?? null;
  }
}
