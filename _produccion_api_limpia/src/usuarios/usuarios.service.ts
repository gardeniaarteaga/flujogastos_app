import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { Participante } from '../participantes/entities/participante.entity';
import { hashPassword, isPasswordHashed, verifyPassword } from './password.util';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { LoginUsuarioDto } from './dto/login-usuario.dto';
import { RegisterUsuarioDto } from './dto/register-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

type UsuarioPublico = {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  celular: string | null;
  pais: string | null;
  codigo_area: string | null;
  ciudad: string | null;
  id_rol: number | null;
  estado: string | null;
  fecha_creacion: Date;
  es_predeterminado: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
  cambiar_password: boolean;
  requiere_cambio_password: boolean;
};

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async resolveByUsername(username: string): Promise<UsuarioPublico> {
    const usuario = await this.findActiveByUsername(username);
    const participanteVinculado = await this.findLinkedParticipanteForUser(usuario.id_usuario);

    return this.toPublicUser(
      usuario,
      usuario.id_usuario,
      usuario.id_rol === 1,
      usuario.celular ?? participanteVinculado?.celular ?? null,
    );
  }

  async login(loginUsuarioDto: LoginUsuarioDto): Promise<UsuarioPublico> {
    let usuario: Usuario;
 Logger.debug(`Intentando iniciar sesión para el usuario: ${loginUsuarioDto.username}`, 'UsuariosService');
    try {
      usuario = await this.findActiveByUsername(loginUsuarioDto.username);
      

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('Usuario o contrasena incorrectos');
      }
      throw error;
    }

    const password = loginUsuarioDto.password.trim();

    if (!verifyPassword(password, usuario.password)) {
      throw new UnauthorizedException('Usuario o contrasena incorrectos');
    }

    if (!isPasswordHashed(usuario.password)) {
      usuario.password = hashPassword(password);
      await this.usuariosRepository.save(usuario);
    }

    const participanteVinculado = await this.findLinkedParticipanteForUser(usuario.id_usuario);

    return this.toPublicUser(
      usuario,
      usuario.id_usuario,
      usuario.id_rol === 1,
      usuario.celular ?? participanteVinculado?.celular ?? null,
    );
  }

  async create(
    createUsuarioDto: CreateUsuarioDto,
    idUsuarioActual: number,
  ): Promise<UsuarioPublico> {
    const adminUserIds = await this.getAdminUserIds();
    this.ensureAdmin(adminUserIds.includes(idUsuarioActual));

    const savedUsuario = await this.createUserWithDefaultParticipant(
      {
        ...createUsuarioDto,
        cambiar_password: createUsuarioDto.cambiar_password ?? true,
      },
      undefined,
      {
        participantOwnerUserId: idUsuarioActual,
      },
    );
    return this.toPublicUser(
      savedUsuario,
      idUsuarioActual,
      true,
      savedUsuario.celular ?? this.normalizePhone(createUsuarioDto.celular),
    );
  }

  async register(registerUsuarioDto: RegisterUsuarioDto): Promise<UsuarioPublico> {
    const savedUsuario = await this.createUserWithDefaultParticipant(
      {
        username: registerUsuarioDto.username,
        password: registerUsuarioDto.password,
        nombre_completo: registerUsuarioDto.nombre_completo,
        celular: registerUsuarioDto.celular,
        pais: registerUsuarioDto.pais,
        codigo_area: registerUsuarioDto.codigo_area,
        ciudad: registerUsuarioDto.ciudad,
        id_rol: 2,
        estado: 'ACTIVO',
        cambiar_password: false,
      },
      registerUsuarioDto.nombre_participante,
    );

    return this.toPublicUser(
      savedUsuario,
      savedUsuario.id_usuario,
      savedUsuario.id_rol === 1,
      savedUsuario.celular ?? this.normalizePhone(registerUsuarioDto.celular),
    );
  }

  async findAll(idUsuarioActual: number): Promise<UsuarioPublico[]> {
    const adminUserIds = await this.getAdminUserIds();
    const currentUserIsAdmin = adminUserIds.includes(idUsuarioActual);
    const visibleUserIds = Array.from(new Set([...adminUserIds, idUsuarioActual]));
    const usuarios = await this.usuariosRepository.find({
      where: currentUserIsAdmin
        ? {}
        : visibleUserIds.map((idUsuario) => ({ id_usuario: idUsuario })),
      order: { id_usuario: 'ASC' },
    });
    const phonesByUserId = await this.resolveLinkedPhones(usuarios);

    return usuarios.map((usuario) =>
      this.toPublicUser(
        usuario,
        idUsuarioActual,
        currentUserIsAdmin,
        usuario.celular ?? phonesByUserId.get(usuario.id_usuario) ?? null,
      ),
    );
  }

  async findOne(id: number, idUsuarioActual: number): Promise<UsuarioPublico> {
    const adminUserIds = await this.getAdminUserIds();
    const currentUserIsAdmin = adminUserIds.includes(idUsuarioActual);
    const usuario = await this.findVisibleById(
      id,
      idUsuarioActual,
      adminUserIds,
      currentUserIsAdmin,
    );
    const participanteVinculado = await this.findLinkedParticipanteForUser(usuario.id_usuario);
    return this.toPublicUser(
      usuario,
      idUsuarioActual,
      currentUserIsAdmin,
      usuario.celular ?? participanteVinculado?.celular ?? null,
    );
  }

  async update(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    idUsuarioActual: number,
  ): Promise<UsuarioPublico> {
    const adminUserIds = await this.getAdminUserIds();
    const currentUserIsAdmin = adminUserIds.includes(idUsuarioActual);
    const usuario = await this.findManageableById(
      id,
      idUsuarioActual,
      adminUserIds,
      currentUserIsAdmin,
    );
    const isAdminTarget = adminUserIds.includes(usuario.id_usuario);
    const isSelfAdminEdit = isAdminTarget && usuario.id_usuario === idUsuarioActual;

    if (isSelfAdminEdit) {
      if (updateUsuarioDto.username !== undefined) {
        throw new ForbiddenException(
          'El correo de un usuario administrador no se puede modificar desde el perfil',
        );
      }

      if (updateUsuarioDto.estado !== undefined) {
        throw new ForbiddenException(
          'El estado de un usuario administrador no se puede modificar desde el perfil',
        );
      }

      if (updateUsuarioDto.id_rol !== undefined) {
        throw new ForbiddenException(
          'El rol de un usuario administrador no se puede modificar desde el perfil',
        );
      }
    }

    if (updateUsuarioDto.username !== undefined) {
      const username = updateUsuarioDto.username.trim().toLowerCase();
      await this.ensureUsernameAvailable(username, id);
      usuario.username = username;
    }

    if (updateUsuarioDto.password !== undefined) {
      usuario.password = hashPassword(updateUsuarioDto.password.trim());
      usuario.fecha_ult_password = new Date();
      if (updateUsuarioDto.cambiar_password === undefined) {
        usuario.cambiar_password =
          currentUserIsAdmin && usuario.id_usuario !== idUsuarioActual;
      }
    }

    if (updateUsuarioDto.nombre_completo !== undefined) {
      usuario.nombre_completo = updateUsuarioDto.nombre_completo?.trim() || null;
    }

    if (updateUsuarioDto.celular !== undefined) {
      usuario.celular = this.normalizePhone(updateUsuarioDto.celular);
    }

    if (updateUsuarioDto.pais !== undefined) {
      usuario.pais = this.normalizeText(updateUsuarioDto.pais);
    }

    if (updateUsuarioDto.codigo_area !== undefined) {
      usuario.codigo_area = this.normalizeAreaCode(updateUsuarioDto.codigo_area);
    }

    if (updateUsuarioDto.ciudad !== undefined) {
      usuario.ciudad = this.normalizeText(updateUsuarioDto.ciudad);
    }

    let participanteVinculado = await this.findLinkedParticipanteForUser(usuario.id_usuario);
    const shouldSyncLinkedParticipante =
      updateUsuarioDto.celular !== undefined ||
      updateUsuarioDto.nombre_completo !== undefined;

    if (updateUsuarioDto.estado !== undefined) {
      usuario.estado = updateUsuarioDto.estado;
    }

    if (updateUsuarioDto.id_rol !== undefined) {
      this.ensureAdmin(currentUserIsAdmin);
      usuario.id_rol = updateUsuarioDto.id_rol;
    }

    if (updateUsuarioDto.cambiar_password !== undefined) {
      this.ensureAdmin(currentUserIsAdmin);
      usuario.cambiar_password = updateUsuarioDto.cambiar_password;
    }

    try {
      const updatedUsuario = await this.usuariosRepository.save(usuario);

      if (shouldSyncLinkedParticipante) {
        if (!participanteVinculado) {
          participanteVinculado = await this.createLinkedParticipanteForUser(
            updatedUsuario,
            currentUserIsAdmin ? idUsuarioActual : updatedUsuario.id_usuario,
          );
        } else {
          if (updateUsuarioDto.nombre_completo !== undefined) {
            participanteVinculado.nombre_participante = this.resolveParticipantName(
              undefined,
              updatedUsuario.nombre_completo?.trim() || null,
              updatedUsuario.username,
            );
          }

          if (updateUsuarioDto.celular !== undefined) {
            participanteVinculado.celular = updatedUsuario.celular ?? null;
          }

          participanteVinculado = await this.dataSource
            .getRepository(Participante)
            .save(participanteVinculado);
        }
      }

      return this.toPublicUser(
        updatedUsuario,
        idUsuarioActual,
        currentUserIsAdmin,
        updatedUsuario.celular ?? participanteVinculado?.celular ?? null,
      );
    } catch (error) {
      this.handleUniqueUsernameError(error);
      throw error;
    }
  }

  async remove(id: number, idUsuarioActual: number) {
    const adminUserIds = await this.getAdminUserIds();
    this.ensureAdmin(adminUserIds.includes(idUsuarioActual));

    const usuario = await this.findVisibleById(id, idUsuarioActual, adminUserIds, true);

    if (usuario.id_rol === 1) {
      throw new ForbiddenException('Los usuarios con rol administrador no se pueden eliminar');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Participante).delete([
        { id_usuario_titular: usuario.id_usuario },
        { id_usuario: usuario.id_usuario },
      ]);
      await manager.getRepository(Usuario).remove(usuario);
    });

    return {
      message: `El usuario con id ${id} fue eliminado`,
    };
  }

  private async createUserWithDefaultParticipant(
    createUsuarioDto: Pick<
      CreateUsuarioDto,
      | 'username'
      | 'password'
      | 'nombre_completo'
      | 'celular'
      | 'pais'
      | 'codigo_area'
      | 'ciudad'
      | 'id_rol'
      | 'estado'
      | 'cambiar_password'
    >,
    nombreParticipante?: string,
    options?: {
      participantOwnerUserId?: number;
    },
  ): Promise<Usuario> {
    const username = createUsuarioDto.username.trim().toLowerCase();
    const nombreCompleto = createUsuarioDto.nombre_completo?.trim() || null;
    const resolvedNombreParticipante = this.resolveParticipantName(
      nombreParticipante,
      nombreCompleto,
      username,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const usuariosRepository = manager.getRepository(Usuario);
        const participantesRepository = manager.getRepository(Participante);

        await this.ensureUsernameAvailable(username, undefined, usuariosRepository);

        const usuario = usuariosRepository.create({
          username,
          password: hashPassword(createUsuarioDto.password.trim()),
          cambiar_password: createUsuarioDto.cambiar_password ?? false,
          nombre_completo: nombreCompleto,
          celular: this.normalizePhone(createUsuarioDto.celular),
          pais: this.normalizeText(createUsuarioDto.pais),
          codigo_area: this.normalizeAreaCode(createUsuarioDto.codigo_area),
          ciudad: this.normalizeText(createUsuarioDto.ciudad),
          id_rol: createUsuarioDto.id_rol ?? 2,
          estado: createUsuarioDto.estado ?? 'ACTIVO',
        });

        const savedUsuario = await usuariosRepository.save(usuario);
        const participantOwnerUserId =
          options?.participantOwnerUserId ?? savedUsuario.id_usuario;

        const participante = participantesRepository.create({
          nombre_participante: resolvedNombreParticipante,
          correo_electronico: username,
          celular: this.normalizePhone(createUsuarioDto.celular),
          porcentaje_participacion: '100',
          estado: 'ACTIVO',
          id_usuario: participantOwnerUserId,
          id_usuario_titular: savedUsuario.id_usuario,
          id_usuario_relacionado: null,
        });

        await participantesRepository.save(participante);

        return savedUsuario;
      });
    } catch (error) {
      this.handleUniqueUsernameError(error);
      throw error;
    }
  }

  private async findActiveByUsername(username: string): Promise<Usuario> {
    const normalizedUsername = username.trim().toLowerCase();
    const usuario = await this.usuariosRepository
      .createQueryBuilder('usuario')
      .where('LOWER(usuario.username) = :username', {
        username: normalizedUsername,
      })
      .getOne();

    if (!usuario) {
      throw new NotFoundException('No existe un usuario con ese correo');
    }

    if ((usuario.estado ?? 'ACTIVO').toUpperCase() !== 'ACTIVO') {
      throw new ForbiddenException('El usuario no se encuentra activo');
    }

    return usuario;
  }

  private async findVisibleById(
    id: number,
    idUsuarioActual: number,
    adminUserIds: number[],
    currentUserIsAdmin: boolean,
  ): Promise<Usuario> {
    if (!currentUserIsAdmin && !adminUserIds.includes(id) && id !== idUsuarioActual) {
      throw new NotFoundException(`El usuario con id ${id} no existe`);
    }

    const usuario = await this.usuariosRepository.findOne({
      where: { id_usuario: id },
    });

    if (!usuario) {
      throw new NotFoundException(`El usuario con id ${id} no existe`);
    }

    return usuario;
  }

  private async findManageableById(
    id: number,
    idUsuarioActual: number,
    adminUserIds: number[],
    currentUserIsAdmin: boolean,
  ): Promise<Usuario> {
    const usuario = await this.usuariosRepository.findOne({
      where: { id_usuario: id },
    });

    if (!usuario) {
      throw new NotFoundException(`El usuario con id ${id} no existe`);
    }

    if (!currentUserIsAdmin && usuario.id_usuario !== idUsuarioActual) {
      throw new ForbiddenException('No tienes permisos para modificar este usuario');
    }

    return usuario;
  }

  private async ensureUsernameAvailable(
    username: string,
    currentUserId?: number,
    repository: Repository<Usuario> = this.usuariosRepository,
  ): Promise<void> {
    const usuarioExistente = await repository
      .createQueryBuilder('usuario')
      .where('LOWER(usuario.username) = :username', { username })
      .getOne();

    if (usuarioExistente && usuarioExistente.id_usuario !== currentUserId) {
      throw new ConflictException('Ya existe un usuario registrado con ese correo');
    }
  }

  private async getAdminUserIds(): Promise<number[]> {
    const adminUsers = await this.usuariosRepository.find({
      select: { id_usuario: true },
      where: { id_rol: 1 },
      order: { id_usuario: 'ASC' },
    });

    return adminUsers.map((usuario) => usuario.id_usuario);
  }

  private ensureAdmin(currentUserIsAdmin: boolean): void {
    if (!currentUserIsAdmin) {
      throw new ForbiddenException(
        'Solo el usuario administrador puede gestionar otros usuarios',
      );
    }
  }

  private handleUniqueUsernameError(error: unknown): void {
    if (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    ) {
      throw new ConflictException('Ya existe un usuario registrado con ese correo');
    }
  }

  private resolveParticipantName(
    nombreParticipante: string | undefined,
    nombreCompleto: string | null,
    username: string,
  ): string {
    const fallbackName =
      nombreParticipante?.trim() ||
      nombreCompleto ||
      username.split('@')[0].replace(/[._-]+/g, ' ').trim() ||
      'Participante';

    return fallbackName.slice(0, 150);
  }

  private normalizePhone(value?: string | null): string | null {
    const normalizedValue = value
      ?.trim()
      .replace(/[^0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalizedValue ? normalizedValue : null;
  }

  private normalizeAreaCode(value?: string | null): string | null {
    const normalizedValue = value
      ?.trim()
      .replace(/[^0-9+]/g, '')
      .replace(/^\++/, '+');

    return normalizedValue ? normalizedValue : null;
  }

  private normalizeText(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private async createLinkedParticipanteForUser(
    usuario: Usuario,
    ownerUserId: number,
  ): Promise<Participante> {
    const participantesRepository = this.dataSource.getRepository(Participante);

    const participante = participantesRepository.create({
      nombre_participante: this.resolveParticipantName(
        undefined,
        usuario.nombre_completo?.trim() || null,
        usuario.username,
      ),
      correo_electronico: usuario.username,
      celular: usuario.celular ?? null,
      porcentaje_participacion: '100',
      estado: 'ACTIVO',
      id_usuario: ownerUserId,
      id_usuario_titular: usuario.id_usuario,
      id_usuario_relacionado: null,
    });

    return participantesRepository.save(participante);
  }

  private async findLinkedParticipanteForUser(idUsuario: number): Promise<Participante | null> {
    return this.dataSource.getRepository(Participante).findOne({
      where: { id_usuario_titular: idUsuario },
      order: { id_participante: 'ASC' },
    });
  }

  private async resolveLinkedPhones(
    usuarios: Usuario[],
  ): Promise<Map<number, string | null>> {
    const userIds = usuarios.map((usuario) => usuario.id_usuario);

    if (userIds.length === 0) {
      return new Map<number, string | null>();
    }

    const participantes = await this.dataSource.getRepository(Participante).find({
      where: userIds.map((idUsuario) => ({ id_usuario_titular: idUsuario })),
      order: { id_participante: 'ASC' },
    });
    const phonesByUserId = new Map<number, string | null>();

    participantes.forEach((participante) => {
      if (
        participante.id_usuario_titular !== null &&
        !phonesByUserId.has(participante.id_usuario_titular)
      ) {
        phonesByUserId.set(
          participante.id_usuario_titular,
          participante.celular ?? null,
        );
      }
    });

    return phonesByUserId;
  }

  private toPublicUser(
    usuario: Usuario,
    idUsuarioActual: number,
    currentUserIsAdmin = usuario.id_rol === 1,
    celular: string | null = usuario.celular ?? null,
  ): UsuarioPublico {
    const esPredeterminado = usuario.id_rol === 1;
    const puedeEditar = currentUserIsAdmin || usuario.id_usuario === idUsuarioActual;

    return {
      id_usuario: usuario.id_usuario,
      username: usuario.username,
      nombre_completo: this.toNullableText(usuario.nombre_completo),
      celular: this.toNullableText(celular),
      pais: this.toNullableText(usuario.pais),
      codigo_area: this.toNullableText(usuario.codigo_area),
      ciudad: this.toNullableText(usuario.ciudad),
      id_rol: usuario.id_rol,
      estado: this.toNullableText(usuario.estado),
      fecha_creacion: usuario.fecha_creacion,
      es_predeterminado: esPredeterminado,
      puede_editar: puedeEditar,
      puede_eliminar: currentUserIsAdmin && !esPredeterminado,
      cambiar_password: usuario.cambiar_password ?? false,
      requiere_cambio_password: usuario.cambiar_password ?? false,
    };
  }

  private toNullableText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = String(value).trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }
}
