import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Participante } from '../participantes/entities/participante.entity';
import { CreateNotificacionProgramadaDto } from './dto/create-notificacion-programada.dto';
import { UpdateNotificacionProgramadaDto } from './dto/update-notificacion-programada.dto';
import { Notificacion } from './entities/notificacion.entity';
import { NotificacionProgramada } from './entities/notificacion-programada.entity';
import { Periodicidad } from './entities/periodicidad.entity';

const NOTIFICACION_TIPO_PAGO_ASIGNADO = 'PAGO_ASIGNADO';
const NOTIFICACION_TIPO_COBRO_INGRESADO = 'COBRO_INGRESADO';
const NOTIFICACION_TIPO_PAGO_RECIBIDO = 'PAGO_RECIBIDO';

type NotificacionResponse = {
  id_notificacion: number;
  id_usuario_destino: number;
  id_usuario_origen: number | null;
  id_transaccion: number | null;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_leida: Date | null;
  fecha_creacion: Date;
};

type MarkAllAsReadResponse = {
  updated: number;
  ids_notificacion: number[];
  fecha_leida: Date | null;
};

type PeriodicidadResponse = {
  id_periodicidad: number;
  nombre_periodicidad: string;
  descripcion: string | null;
  codigo: string;
  estado: boolean;
};

type NotificacionProgramadaResponse = {
  id_notificacion_programada: number;
  id_usuario: number;
  descripcion: string;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_inicio: string;
  fecha_fin: string;
  dia_pago_programado: number;
  id_periodicidad: number;
  periodicidad_nombre: string;
  periodicidad_codigo: string;
  estado: boolean;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
};

type PagoAsignadoNotificationInput = {
  idUsuarioOrigen: number;
  idTransaccion: number;
  descripcion: string | null;
  fecha: string;
  detalles: Array<{
    id_participante: number;
    id_usuario_relacionado: number | null;
    monto: string | number;
  }>;
};

type CobroIngresadoNotificationInput = {
  idUsuarioOrigen: number;
  idTransaccion: number;
  descripcion: string | null;
  fecha: string;
  detalles: Array<{
    id_participante: number;
    id_usuario_relacionado: number | null;
    monto: string | number;
  }>;
};

type PagoRecibidoNotificationInput = {
  idUsuarioOrigen: number;
  idUsuarioDestino: number;
  idTransaccion: number;
  descripcion: string | null;
  fecha: string;
  detalles: Array<{
    id_participante: number;
    monto: string | number;
  }>;
};

type PrioridadNotificacion = 'alta' | 'media' | 'baja';

const PRIORIDADES_NOTIFICACION: PrioridadNotificacion[] = ['alta', 'media', 'baja'];

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private static readonly BUSINESS_TIME_ZONE = 'America/El_Salvador';
  private ensureSchemaPromise: Promise<void> | null = null;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Notificacion)
    private readonly notificacionesRepository: Repository<Notificacion>,
    @InjectRepository(Periodicidad)
    private readonly periodicidadRepository: Repository<Periodicidad>,
    @InjectRepository(NotificacionProgramada)
    private readonly notificacionesProgramadasRepository: Repository<NotificacionProgramada>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchemaReady();
  }

  async findAll(idUsuario: number, limite = 8): Promise<{
    pendientes: number;
    items: NotificacionResponse[];
  }> {
    await this.ensureSchemaReady();

    const normalizedLimit = Math.min(Math.max(1, limite), 20);
    const [pendientes, items] = await Promise.all([
      this.notificacionesRepository.count({
        where: {
          id_usuario_destino: idUsuario,
          leida: false,
        },
      }),
      this.notificacionesRepository.find({
        where: {
          id_usuario_destino: idUsuario,
          leida: false,
        },
        order: { fecha_creacion: 'DESC', id_notificacion: 'DESC' },
        take: normalizedLimit,
      }),
    ]);

    return {
      pendientes,
      items: items.map((item) => this.toResponse(item)),
    };
  }

  async findPeriodicidades(): Promise<PeriodicidadResponse[]> {
    await this.ensureSchemaReady();

    const items = await this.periodicidadRepository.find({
      where: { estado: true },
      order: { id_periodicidad: 'ASC' },
    });

    return items
      .filter(
        (item) =>
          item.nombre_periodicidad?.trim().length > 0 &&
          item.codigo?.trim().length > 0 &&
          ['mensual', 'fecha-especifica', 'anual', 'quincenal'].includes(
            item.codigo.trim().toLowerCase(),
          ),
      )
      .map((item) => ({
        id_periodicidad: item.id_periodicidad,
        nombre_periodicidad: item.nombre_periodicidad,
        descripcion: item.descripcion ?? null,
        codigo: item.codigo,
        estado: item.estado,
      }));
  }

  async findProgramadas(
    idUsuario: number,
  ): Promise<NotificacionProgramadaResponse[]> {
    await this.ensureSchemaReady();
    const visibleUntilCutoffDate = this.getLocalDateKey(-15);

    const items = await this.notificacionesProgramadasRepository.find({
      where: { id_usuario: idUsuario, estado: true },
      relations: { periodicidad: true },
      order: {
        dia_pago_programado: 'ASC',
        id_notificacion_programada: 'DESC',
      },
    });

    const visibleItems = items.filter(
      (item) => item.fecha_fin >= visibleUntilCutoffDate,
    );

    return visibleItems.map((item) => this.toProgramadaResponse(item));
  }

  async createProgramada(
    createDto: CreateNotificacionProgramadaDto,
    idUsuario: number,
  ): Promise<NotificacionProgramadaResponse> {
    await this.ensureSchemaReady();
    const periodicidad = await this.findPeriodicidadOrFail(createDto.id_periodicidad);

    const entity = this.notificacionesProgramadasRepository.create({
      id_usuario: idUsuario,
      descripcion: createDto.descripcion.trim(),
      prioridad: this.normalizePrioridad(createDto.prioridad),
      fecha_inicio: this.normalizeDateOnly(createDto.fecha_inicio, 'fecha_inicio'),
      fecha_fin: this.normalizeDateOnly(createDto.fecha_fin, 'fecha_fin'),
      dia_pago_programado: createDto.dia_pago_programado,
      id_periodicidad: periodicidad.id_periodicidad,
      estado: true,
    });
    this.ensureDateRange(entity.fecha_inicio, entity.fecha_fin);

    const saved = await this.notificacionesProgramadasRepository.save(entity);
    saved.periodicidad = periodicidad;
    return this.toProgramadaResponse(saved);
  }

  async updateProgramada(
    idNotificacionProgramada: number,
    updateDto: UpdateNotificacionProgramadaDto,
    idUsuario: number,
  ): Promise<NotificacionProgramadaResponse> {
    await this.ensureSchemaReady();

    const entity = await this.findProgramadaOwnedOrFail(
      idNotificacionProgramada,
      idUsuario,
    );

    if (updateDto.id_periodicidad !== undefined) {
      const periodicidad = await this.findPeriodicidadOrFail(updateDto.id_periodicidad);
      entity.id_periodicidad = periodicidad.id_periodicidad;
      entity.periodicidad = periodicidad;
    }

    if (updateDto.descripcion !== undefined) {
      entity.descripcion = updateDto.descripcion.trim();
    }

    if (updateDto.prioridad !== undefined) {
      entity.prioridad = this.normalizePrioridad(updateDto.prioridad);
    }

    if (updateDto.fecha_inicio !== undefined) {
      entity.fecha_inicio = this.normalizeDateOnly(
        updateDto.fecha_inicio,
        'fecha_inicio',
      );
    }

    if (updateDto.fecha_fin !== undefined) {
      entity.fecha_fin = this.normalizeDateOnly(updateDto.fecha_fin, 'fecha_fin');
    }

    if (updateDto.dia_pago_programado !== undefined) {
      entity.dia_pago_programado = updateDto.dia_pago_programado;
    }

    if (updateDto.estado !== undefined) {
      entity.estado = updateDto.estado;
    }

    this.ensureDateRange(entity.fecha_inicio, entity.fecha_fin);

    const saved = await this.notificacionesProgramadasRepository.save(entity);

    if (!saved.periodicidad) {
      saved.periodicidad = await this.findPeriodicidadOrFail(saved.id_periodicidad);
    }

    return this.toProgramadaResponse(saved);
  }

  async removeProgramada(
    idNotificacionProgramada: number,
    idUsuario: number,
  ): Promise<{ message: string }> {
    await this.ensureSchemaReady();

    const entity = await this.findProgramadaOwnedOrFail(
      idNotificacionProgramada,
      idUsuario,
    );

    await this.notificacionesProgramadasRepository.remove(entity);

    return {
      message: `La notificacion programada con id ${idNotificacionProgramada} fue eliminada`,
    };
  }

  async markAllAsRead(idUsuario: number): Promise<MarkAllAsReadResponse> {
    await this.ensureSchemaReady();

    const unreadNotifications = await this.notificacionesRepository.find({
      where: {
        id_usuario_destino: idUsuario,
        leida: false,
      },
    });

    if (unreadNotifications.length === 0) {
      return { updated: 0, ids_notificacion: [], fecha_leida: null };
    }

    const readAt = new Date();
    unreadNotifications.forEach((notification) => {
      notification.leida = true;
      notification.fecha_leida = readAt;
    });

    await this.notificacionesRepository.save(unreadNotifications);

    return {
      updated: unreadNotifications.length,
      ids_notificacion: unreadNotifications.map(
        (notification) => notification.id_notificacion,
      ),
      fecha_leida: readAt,
    };
  }

  async markAsRead(
    idNotificacion: number,
    idUsuario: number,
  ): Promise<NotificacionResponse> {
    await this.ensureSchemaReady();

    const notification = await this.notificacionesRepository.findOne({
      where: {
        id_notificacion: idNotificacion,
        id_usuario_destino: idUsuario,
      },
    });

    if (!notification) {
      throw new NotFoundException(
        `La notificacion con id ${idNotificacion} no existe para el usuario logueado`,
      );
    }

    if (!notification.leida) {
      notification.leida = true;
      notification.fecha_leida = new Date();
      await this.notificacionesRepository.save(notification);
    }

    return this.toResponse(notification);
  }

  async syncPagoAsignadoNotificationsSafely(
    input: PagoAsignadoNotificationInput,
  ): Promise<void> {
    try {
      await this.ensureSchemaReady();
      await this.notificacionesRepository.manager.transaction(async (manager) => {
        await this.syncPagoAsignadoNotifications(manager, input);
      });
    } catch (error) {
      console.warn(
        'No se pudieron sincronizar las notificaciones de pago asignado:',
        error,
      );
    }
  }

  async createCobroIngresadoNotificationsSafely(
    input: CobroIngresadoNotificationInput,
  ): Promise<void> {
    try {
      await this.ensureSchemaReady();
      await this.notificacionesRepository.manager.transaction(async (manager) => {
        await this.createCobroIngresadoNotifications(manager, input);
      });
    } catch (error) {
      console.warn(
        'No se pudieron crear las notificaciones de cobro ingresado:',
        error,
      );
    }
  }

  async createPagoRecibidoNotificationsSafely(
    input: PagoRecibidoNotificationInput,
  ): Promise<void> {
    try {
      await this.ensureSchemaReady();
      await this.notificacionesRepository.manager.transaction(async (manager) => {
        await this.createPagoRecibidoNotifications(manager, input);
      });
    } catch (error) {
      console.warn(
        'No se pudieron crear las notificaciones de pago recibido:',
        error,
      );
    }
  }

  async syncPagoAsignadoNotifications(
    manager: EntityManager,
    input: PagoAsignadoNotificationInput,
  ): Promise<void> {
    await manager.delete(Notificacion, {
      id_transaccion: input.idTransaccion,
      tipo: NOTIFICACION_TIPO_PAGO_ASIGNADO,
    });

    const detallesRelacionados = input.detalles.filter(
      (detalle) =>
        detalle.id_usuario_relacionado !== null &&
        detalle.id_usuario_relacionado !== input.idUsuarioOrigen,
    );

    if (detallesRelacionados.length === 0) {
      return;
    }

    const participantes = await manager.find(Participante, {
      where: {
        id_participante: In(
          Array.from(new Set(detallesRelacionados.map((detalle) => detalle.id_participante))),
        ),
      },
    });
    const participantesMap = new Map(
      participantes.map((participante) => [
        participante.id_participante,
        participante.nombre_participante,
      ]),
    );
    const detallesByUser = new Map<
      number,
      {
        montoCentavos: number;
        participantes: Set<string>;
      }
    >();

    for (const detalle of detallesRelacionados) {
      const idUsuarioDestino = detalle.id_usuario_relacionado!;
      const currentEntry = detallesByUser.get(idUsuarioDestino) ?? {
        montoCentavos: 0,
        participantes: new Set<string>(),
      };
      const participanteNombre = participantesMap.get(detalle.id_participante)?.trim();

      currentEntry.montoCentavos += this.toCents(Number(detalle.monto));

      if (participanteNombre) {
        currentEntry.participantes.add(participanteNombre);
      }

      detallesByUser.set(idUsuarioDestino, currentEntry);
    }

    const referenciaTransaccion =
      input.descripcion?.trim() || `transaccion del ${input.fecha}`;
    const notifications = Array.from(detallesByUser.entries()).map(
      ([idUsuarioDestino, detail]) =>
        manager.create(Notificacion, {
          id_usuario_destino: idUsuarioDestino,
          id_usuario_origen: input.idUsuarioOrigen,
          id_transaccion: input.idTransaccion,
          tipo: NOTIFICACION_TIPO_PAGO_ASIGNADO,
          titulo: 'Pago asignado',
          mensaje: this.buildPagoAsignadoMessage(
            referenciaTransaccion,
            detail.participantes,
            detail.montoCentavos,
          ),
          leida: false,
          fecha_leida: null,
        }),
    );

    await manager.save(Notificacion, notifications);
  }

  async createCobroIngresadoNotifications(
    manager: EntityManager,
    input: CobroIngresadoNotificationInput,
  ): Promise<void> {
    const detallesRelacionados = input.detalles.filter(
      (detalle) =>
        detalle.id_usuario_relacionado !== null &&
        detalle.id_usuario_relacionado !== input.idUsuarioOrigen &&
        this.toCents(Number(detalle.monto)) > 0,
    );

    if (detallesRelacionados.length === 0) {
      return;
    }

    const participantes = await manager.find(Participante, {
      where: {
        id_participante: In(
          Array.from(new Set(detallesRelacionados.map((detalle) => detalle.id_participante))),
        ),
      },
    });
    const participantesMap = new Map(
      participantes.map((participante) => [
        participante.id_participante,
        participante.nombre_participante,
      ]),
    );
    const detallesByUser = new Map<
      number,
      {
        montoCentavos: number;
        participantes: Set<string>;
      }
    >();

    for (const detalle of detallesRelacionados) {
      const idUsuarioDestino = detalle.id_usuario_relacionado!;
      const currentEntry = detallesByUser.get(idUsuarioDestino) ?? {
        montoCentavos: 0,
        participantes: new Set<string>(),
      };
      const participanteNombre = participantesMap.get(detalle.id_participante)?.trim();

      currentEntry.montoCentavos += this.toCents(Number(detalle.monto));

      if (participanteNombre) {
        currentEntry.participantes.add(participanteNombre);
      }

      detallesByUser.set(idUsuarioDestino, currentEntry);
    }

    const referenciaTransaccion =
      input.descripcion?.trim() || `transaccion del ${input.fecha}`;
    const notifications = Array.from(detallesByUser.entries()).map(
      ([idUsuarioDestino, detail]) =>
        manager.create(Notificacion, {
          id_usuario_destino: idUsuarioDestino,
          id_usuario_origen: input.idUsuarioOrigen,
          id_transaccion: input.idTransaccion,
          tipo: NOTIFICACION_TIPO_COBRO_INGRESADO,
          titulo: 'Cobro registrado',
          mensaje: this.buildCobroIngresadoMessage(
            referenciaTransaccion,
            detail.participantes,
            detail.montoCentavos,
          ),
          leida: false,
          fecha_leida: null,
        }),
    );

    await manager.save(Notificacion, notifications);
  }

  async createPagoRecibidoNotifications(
    manager: EntityManager,
    input: PagoRecibidoNotificationInput,
  ): Promise<void> {
    if (
      input.idUsuarioDestino === input.idUsuarioOrigen ||
      input.detalles.length === 0
    ) {
      return;
    }

    const detallesValidos = input.detalles.filter(
      (detalle) => this.toCents(Number(detalle.monto)) > 0,
    );

    if (detallesValidos.length === 0) {
      return;
    }

    await manager.delete(Notificacion, {
      id_transaccion: input.idTransaccion,
      id_usuario_destino: input.idUsuarioDestino,
      id_usuario_origen: input.idUsuarioOrigen,
      tipo: NOTIFICACION_TIPO_PAGO_RECIBIDO,
    });

    const participantes = await manager.find(Participante, {
      where: {
        id_participante: In(
          Array.from(new Set(detallesValidos.map((detalle) => detalle.id_participante))),
        ),
      },
    });
    const participantesMap = new Map(
      participantes.map((participante) => [
        participante.id_participante,
        participante.nombre_participante,
      ]),
    );
    const participantesPagadores = new Set<string>();
    let montoCentavos = 0;

    for (const detalle of detallesValidos) {
      montoCentavos += this.toCents(Number(detalle.monto));
      const participanteNombre = participantesMap.get(detalle.id_participante)?.trim();

      if (participanteNombre) {
        participantesPagadores.add(participanteNombre);
      }
    }

    if (montoCentavos <= 0) {
      return;
    }

    const referenciaTransaccion =
      input.descripcion?.trim() || `transaccion del ${input.fecha}`;
    const notification = manager.create(Notificacion, {
      id_usuario_destino: input.idUsuarioDestino,
      id_usuario_origen: input.idUsuarioOrigen,
      id_transaccion: input.idTransaccion,
      tipo: NOTIFICACION_TIPO_PAGO_RECIBIDO,
      titulo: 'Pago recibido',
      mensaje: this.buildPagoRecibidoMessage(
        referenciaTransaccion,
        participantesPagadores,
        montoCentavos,
      ),
      leida: false,
      fecha_leida: null,
    });

    await manager.save(Notificacion, notification);
  }

  private buildPagoAsignadoMessage(
    referenciaTransaccion: string,
    participantes: Set<string>,
    montoCentavos: number,
  ): string {
    const monto = this.centsToAmount(montoCentavos).toFixed(2);
    const participantesTexto =
      participantes.size > 0
        ? ` para ${Array.from(participantes).join(', ')}`
        : '';

    return `Se te asigno un pago de $${monto}${participantesTexto} en ${referenciaTransaccion}.`;
  }

  private buildCobroIngresadoMessage(
    referenciaTransaccion: string,
    participantes: Set<string>,
    montoCentavos: number,
  ): string {
    const monto = this.centsToAmount(montoCentavos).toFixed(2);
    const participantesTexto =
      participantes.size > 0
        ? ` para ${Array.from(participantes).join(', ')}`
        : '';

    return `Se ingreso un cobro de $${monto}${participantesTexto} en ${referenciaTransaccion}.`;
  }

  private buildPagoRecibidoMessage(
    referenciaTransaccion: string,
    participantes: Set<string>,
    montoCentavos: number,
  ): string {
    const monto = this.centsToAmount(montoCentavos).toFixed(2);
    const participantesTexto =
      participantes.size > 0
        ? ` de ${Array.from(participantes).join(', ')}`
        : '';

    return `Se recibio un pago de $${monto}${participantesTexto} en ${referenciaTransaccion}.`;
  }

  private toResponse(notification: Notificacion): NotificacionResponse {
    return {
      id_notificacion: notification.id_notificacion,
      id_usuario_destino: notification.id_usuario_destino,
      id_usuario_origen: notification.id_usuario_origen ?? null,
      id_transaccion: notification.id_transaccion ?? null,
      tipo: notification.tipo,
      titulo: notification.titulo,
      mensaje: notification.mensaje,
      leida: notification.leida,
      fecha_leida: notification.fecha_leida ?? null,
      fecha_creacion: notification.fecha_creacion,
    };
  }

  private toProgramadaResponse(
    notification: NotificacionProgramada,
  ): NotificacionProgramadaResponse {
    return {
      id_notificacion_programada: notification.id_notificacion_programada,
      id_usuario: notification.id_usuario,
      descripcion: notification.descripcion,
      prioridad: notification.prioridad,
      fecha_inicio: notification.fecha_inicio,
      fecha_fin: notification.fecha_fin,
      dia_pago_programado: notification.dia_pago_programado,
      id_periodicidad: notification.id_periodicidad,
      periodicidad_nombre:
        notification.periodicidad?.nombre_periodicidad ?? 'Periodicidad',
      periodicidad_codigo: notification.periodicidad?.codigo ?? 'mensual',
      estado: notification.estado,
      fecha_creacion: notification.fecha_creacion,
      fecha_actualizacion: notification.fecha_actualizacion,
    };
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToAmount(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private async ensureSchemaReady(): Promise<void> {
    if (!this.ensureSchemaPromise) {
      this.ensureSchemaPromise = this.createSchemaIfNeeded().catch((error) => {
        this.ensureSchemaPromise = null;
        throw error;
      });
    }

    await this.ensureSchemaPromise;
  }

  private async createSchemaIfNeeded(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS periodicidad (
        id_periodicidad SERIAL PRIMARY KEY,
        nombre_periodicidad VARCHAR(80) NULL,
        descripcion VARCHAR(180) NULL,
        codigo VARCHAR(40) NULL,
        estado BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ADD COLUMN IF NOT EXISTS nombre_periodicidad VARCHAR(80)
    `);

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'periodicidad'
            AND column_name = 'descripcion_periodicidad'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'periodicidad'
            AND column_name = 'descripcion'
        ) THEN
          ALTER TABLE periodicidad
          RENAME COLUMN descripcion_periodicidad TO descripcion;
        END IF;
      END $$;
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ADD COLUMN IF NOT EXISTS descripcion VARCHAR(180)
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ADD COLUMN IF NOT EXISTS codigo VARCHAR(40)
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ALTER COLUMN descripcion TYPE VARCHAR(180)
    `);

    await this.dataSource.query(`
      ALTER TABLE periodicidad
      ALTER COLUMN descripcion DROP NOT NULL
    `);

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'periodicidad'
            AND column_name = 'descripcion_periodicidad'
        ) THEN
          UPDATE periodicidad
          SET descripcion = COALESCE(descripcion, descripcion_periodicidad)
          WHERE descripcion IS NULL
            AND descripcion_periodicidad IS NOT NULL;

          ALTER TABLE periodicidad
          ALTER COLUMN descripcion_periodicidad DROP NOT NULL;
        END IF;
      END $$;
    `);

    await this.dataSource.query(`
      UPDATE periodicidad
      SET nombre_periodicidad = CASE
        WHEN nombre_periodicidad IS NOT NULL AND BTRIM(nombre_periodicidad) <> '' THEN nombre_periodicidad
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'MENSUAL' THEN 'Cada mes'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'ANUAL' THEN 'Cada ano'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'DIARIA' THEN 'Diaria'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'SEMANAL' THEN 'Semanal'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'QUINCENAL' THEN 'Quincenal'
        ELSE NULL
      END
      WHERE nombre_periodicidad IS NULL OR BTRIM(nombre_periodicidad) = ''
    `);

    await this.dataSource.query(`
      UPDATE periodicidad
      SET codigo = CASE
        WHEN codigo IS NOT NULL AND BTRIM(codigo) <> '' THEN LOWER(BTRIM(codigo))
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'MENSUAL' THEN 'mensual'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'ANUAL' THEN 'anual'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'DIARIA' THEN 'diaria'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'SEMANAL' THEN 'semanal'
        WHEN UPPER(BTRIM(COALESCE(descripcion, ''))) = 'QUINCENAL' THEN 'quincenal'
        ELSE NULL
      END
      WHERE codigo IS NULL OR BTRIM(codigo) = ''
    `);

    await this.dataSource.query(`
      UPDATE periodicidad
      SET estado = FALSE
      WHERE codigo IS NULL OR BTRIM(codigo) = ''
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_periodicidad_codigo
      ON periodicidad (codigo)
      WHERE codigo IS NOT NULL
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS notificaciones_programadas (
        id_notificacion_programada SERIAL PRIMARY KEY,
        id_usuario INTEGER NOT NULL,
        descripcion VARCHAR(160) NOT NULL,
        prioridad VARCHAR(20) NOT NULL DEFAULT 'media',
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        dia_pago_programado INTEGER NOT NULL CHECK (dia_pago_programado BETWEEN 1 AND 31),
        id_periodicidad INTEGER NOT NULL REFERENCES periodicidad (id_periodicidad),
        estado BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
        fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'id_notificacion'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'id_notificacion_programada'
        ) THEN
          ALTER TABLE notificaciones_programadas
          RENAME COLUMN id_notificacion TO id_notificacion_programada;
        END IF;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'dia_mes'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'dia_pago_programado'
        ) THEN
          ALTER TABLE notificaciones_programadas
          RENAME COLUMN dia_mes TO dia_pago_programado;
        END IF;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'activo'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'notificaciones_programadas'
            AND column_name = 'estado'
        ) THEN
          ALTER TABLE notificaciones_programadas
          RENAME COLUMN activo TO estado;
        END IF;
      END $$;
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS id_notificacion_programada SERIAL
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS id_usuario INTEGER
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS descripcion VARCHAR(160)
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS dia_pago_programado INTEGER
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS id_periodicidad INTEGER
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS prioridad VARCHAR(20) NOT NULL DEFAULT 'media'
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS fecha_inicio DATE
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS fecha_fin DATE
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
    `);

    await this.dataSource.query(`
      UPDATE notificaciones_programadas
      SET prioridad = CASE
        WHEN LOWER(BTRIM(COALESCE(prioridad, ''))) IN ('alta', 'media', 'baja')
          THEN LOWER(BTRIM(prioridad))
        ELSE 'media'
      END
    `);

    await this.dataSource.query(`
      UPDATE notificaciones_programadas
      SET fecha_inicio = COALESCE(fecha_inicio, CURRENT_DATE),
          fecha_fin = COALESCE(fecha_fin, fecha_inicio, CURRENT_DATE)
      WHERE fecha_inicio IS NULL OR fecha_fin IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ALTER COLUMN fecha_inicio SET NOT NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE notificaciones_programadas
      ALTER COLUMN fecha_fin SET NOT NULL
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_notificaciones_programadas_usuario
      ON notificaciones_programadas (
        id_usuario,
        estado,
        prioridad,
        fecha_inicio,
        fecha_fin,
        dia_pago_programado,
        id_notificacion_programada DESC
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS notificaciones (
        id_notificacion SERIAL PRIMARY KEY,
        id_usuario_destino INTEGER NOT NULL,
        id_usuario_origen INTEGER NULL,
        id_transaccion INTEGER NULL,
        tipo VARCHAR(50) NOT NULL,
        titulo VARCHAR(160) NOT NULL,
        mensaje VARCHAR(500) NOT NULL,
        leida BOOLEAN NOT NULL DEFAULT FALSE,
        fecha_leida TIMESTAMP NULL,
        fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha
      ON notificaciones (id_usuario_destino, fecha_creacion DESC, id_notificacion DESC)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida
      ON notificaciones (id_usuario_destino, leida)
    `);

    await this.seedPeriodicidades();
  }

  private getLocalDateKey(offsetDays = 0): string {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + offsetDays);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: NotificacionesService.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(currentDate);
  }

  private async seedPeriodicidades(): Promise<void> {
    await this.dataSource.query(`
      UPDATE periodicidad
      SET
        nombre_periodicidad = data.nombre_periodicidad,
        descripcion = data.descripcion,
        estado = TRUE
      FROM (
        VALUES
          ('mensual', 'Cada mes', 'Se repetira todos los meses en el mismo dia de pago.'),
          ('quincenal', 'Quincenal', 'Se repetira los dias 15 y 30 de cada mes.'),
          ('fecha-especifica', 'Dia especifico', 'Se ejecutara una vez en el dia programado del ciclo actual.'),
          ('anual', 'Cada ano', 'Se repetira cada ano en el mismo dia del ciclo actual.')
      ) AS data(codigo, nombre_periodicidad, descripcion)
      WHERE periodicidad.codigo = data.codigo
    `);

    await this.dataSource.query(`
      INSERT INTO periodicidad (codigo, nombre_periodicidad, descripcion, estado, fecha_creacion)
      SELECT data.codigo, data.nombre_periodicidad, data.descripcion, TRUE, NOW()
      FROM (
        VALUES
          ('mensual', 'Cada mes', 'Se repetira todos los meses en el mismo dia de pago.'),
          ('quincenal', 'Quincenal', 'Se repetira los dias 15 y 30 de cada mes.'),
          ('fecha-especifica', 'Dia especifico', 'Se ejecutara una vez en el dia programado del ciclo actual.'),
          ('anual', 'Cada ano', 'Se repetira cada ano en el mismo dia del ciclo actual.')
      ) AS data(codigo, nombre_periodicidad, descripcion)
      WHERE NOT EXISTS (
        SELECT 1
        FROM periodicidad existing
        WHERE existing.codigo = data.codigo
      )
    `);
  }

  private async findPeriodicidadOrFail(idPeriodicidad: number): Promise<Periodicidad> {
    const periodicidad = await this.periodicidadRepository.findOne({
      where: { id_periodicidad: idPeriodicidad, estado: true },
    });

    if (!periodicidad) {
      throw new NotFoundException(
        `La periodicidad con id ${idPeriodicidad} no existe o no esta activa`,
      );
    }

    if (
      !periodicidad.nombre_periodicidad?.trim() ||
      !periodicidad.codigo?.trim()
    ) {
      throw new BadRequestException(
        `La periodicidad con id ${idPeriodicidad} no tiene una configuracion valida`,
      );
    }

    return periodicidad;
  }

  private async findProgramadaOwnedOrFail(
    idNotificacionProgramada: number,
    idUsuario: number,
  ): Promise<NotificacionProgramada> {
    const notification = await this.notificacionesProgramadasRepository.findOne({
      where: {
        id_notificacion_programada: idNotificacionProgramada,
        id_usuario: idUsuario,
        estado: true,
      },
      relations: { periodicidad: true },
    });

    if (!notification) {
      throw new NotFoundException(
        `La notificacion programada con id ${idNotificacionProgramada} no existe para el usuario logueado`,
      );
    }

    return notification;
  }

  private normalizePrioridad(value: string): PrioridadNotificacion {
    const normalized = value.trim().toLowerCase();

    if (!PRIORIDADES_NOTIFICACION.includes(normalized as PrioridadNotificacion)) {
      throw new BadRequestException(
        'La prioridad debe ser alta, media o baja',
      );
    }

    return normalized as PrioridadNotificacion;
  }

  private normalizeDateOnly(value: string, fieldName: string): string {
    const trimmed = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(
        `El campo ${fieldName} debe estar en formato YYYY-MM-DD`,
      );
    }

    const [year, month, day] = trimmed.split('-').map((part) => Number(part));
    const normalized = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(normalized.getTime()) ||
      normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() !== month - 1 ||
      normalized.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `El campo ${fieldName} contiene una fecha invalida`,
      );
    }

    return trimmed;
  }

  private ensureDateRange(fechaInicio: string, fechaFin: string): void {
    if (fechaFin < fechaInicio) {
      throw new BadRequestException(
        'La fecha_fin no puede ser menor que la fecha_inicio',
      );
    }
  }
}
