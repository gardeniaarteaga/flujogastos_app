import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, EntityManager, In, Repository } from "typeorm";

import { buildVisibleUserIds } from "../common/admin-visibility.util";
import { Categoria } from "../categorias/entities/categoria.entity";
import { EstadoTransaccion } from "../estados-transaccion/entities/estado-transaccion.entity";
import { FormaPago } from "../formas-pago/entities/forma-pago.entity";
import { NotificacionesService } from "../notificaciones/notificaciones.service";
import { Participante } from "../participantes/entities/participante.entity";
import { Subcategoria } from "../subcategorias/entities/subcategoria.entity";
import { TipoTransaccion } from "../tipo-transaccion/entities/tipo-transaccion.entity";
import { Usuario } from "../usuarios/entities/usuario.entity";
import { ApplyPagosMasivosDto } from "./dto/apply-pagos-masivos.dto";
import { ApplyPagosTransaccionDto } from "./dto/apply-pagos-transaccion.dto";
import { ApplyCuotaActualizadaDto } from "./dto/apply-cuota-actualizada.dto";
import { CuotaProgramadaDto } from "./dto/cuota-programada.dto";
import { CreateTransaccionDto } from "./dto/create-transaccion.dto";
import { UpdateTransaccionDto } from "./dto/update-transaccion.dto";
import { DetalleTransaccion } from "./entities/detalle-transaccion.entity";
import { Transaccion } from "./entities/transaccion.entity";

const DETALLE_TIPO_TRANSACCION_TITULAR_ID = 1;
const DETALLE_TIPO_TRANSACCION_PARTICIPANTE_ID = 2;
const ESTADO_TRANSACCION_ANULADA_ID = 2;
const ESTADO_TRANSACCION_PENDIENTE_ID = 3;
const ESTADO_TRANSACCION_PAGO_PARCIAL_ID = 4;
const ESTADO_REGISTRO_ANULADO_ID = 7;

type TransaccionDetalleResponse = {
  id: number;
  id_participante: number;
  id_usuario_relacionado: number | null;
  nombre_participante: string | null;
  monto: number;
  monto_pagado: number;
  interes_pagado: number;
  interes_pendiente: number;
  saldo_pendiente: number;
  porcentaje: number;
  fecha_pago: string | null;
  fecha_programada: string | null;
  fecha_inicio_interes: string | null;
  numero_cuota: number;
  total_cuotas: number;
  id_metodo_pago: number;
  nombre_forma_pago: string | null;
  id_estado: number;
  nombre_estado: string | null;
  fecha_creacion: Date;
  es_titular: boolean;
};

type ResolvedCuotaInput = {
  monto: number;
  fecha_programada: string | null;
};

type ResolvedDetalleInput = {
  id_participante: number;
  monto: number;
  cantidad_cuotas: number;
  cuotas: ResolvedCuotaInput[];
};

type TransaccionResponse = {
  id_transaccion: number;
  es_propietario: boolean;
  fecha: string;
  monto: number;
  intereses: number;
  cuotas_sin_intereses: boolean;
  tasa_interes_anual: number | null;
  saldo_pendiente: number;
  id_tipo_transaccion: number;
  nombre_tipo_transaccion: string | null;
  id_metodo_pago: number;
  nombre_forma_pago: string | null;
  id_categoria: number;
  nombre_categoria: string | null;
  id_subcategoria: number | null;
  nombre_subcategoria: string | null;
  id_estado: number;
  nombre_estado: string | null;
  id_estado_registro: number | null;
  nombre_estado_registro: string | null;
  descripcion: string | null;
  pagocompartido: boolean;
  fecha_ultimo_pago: Date | null;
  fecha_creacion: Date;
  titular: string | null;
  cantidad_participantes: number;
  participantes_detalle: TransaccionDetalleResponse[];
};

type ResolvedTransaccionInput = {
  fecha: string;
  calcula_interes: boolean;
  cuotas_sin_intereses: boolean;
  titular_cuota_unica_pagada: boolean;
  pago_variable: boolean;
  fecha_inicio_interes: string | null;
  monto: number;
  intereses: number;
  id_tipo_transaccion: number;
  id_metodo_pago: number;
  id_categoria: number;
  id_subcategoria: number | null;
  id_estado: number;
  descripcion: string | null;
  pagocompartido: boolean;
  cantidad_cuotas_titular: number;
  cuotas_titular: ResolvedCuotaInput[];
  participantes_detalle: ResolvedDetalleInput[];
};

type DetalleUpdatePlan = {
  activeExistingDetalles: DetalleTransaccion[];
  removedPendingDetalles: DetalleTransaccion[];
  newCuotas: ResolvedCuotaInput[];
};

type ApplyPagosMasivosResponse = {
  transacciones_actualizadas: number[];
  detalles_pagados: number;
};

@Injectable()
export class TransaccionesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Transaccion)
    private readonly transaccionesRepository: Repository<Transaccion>,
    @InjectRepository(DetalleTransaccion)
    private readonly detalleTransaccionesRepository: Repository<DetalleTransaccion>,
    @InjectRepository(FormaPago)
    private readonly formasPagoRepository: Repository<FormaPago>,
    @InjectRepository(Categoria)
    private readonly categoriasRepository: Repository<Categoria>,
    @InjectRepository(Subcategoria)
    private readonly subcategoriasRepository: Repository<Subcategoria>,
    @InjectRepository(Participante)
    private readonly participantesRepository: Repository<Participante>,
    @InjectRepository(EstadoTransaccion)
    private readonly estadosTransaccionRepository: Repository<EstadoTransaccion>,
    @InjectRepository(TipoTransaccion)
    private readonly tiposTransaccionRepository: Repository<TipoTransaccion>,
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  async create(
    createTransaccionDto: CreateTransaccionDto,
    idUsuario: number,
  ): Promise<TransaccionResponse> {
    const resolvedInput = await this.resolveTransaccionInput(
      createTransaccionDto,
      idUsuario,
    );
    const estadoPendiente = await this.findEstadoByFlagAndName(
      "T",
      "PENDIENTE",
    );
    const estadoPagoParcial = await this.findEstadoByFlagAndName(
      "T",
      "PAGO PARCIAL",
    );
    const estadoPagado = await this.findEstadoByFlagAndName("T", "PAGADO");
    const titularParticipante = await this.ensureTitularParticipante(idUsuario);
    const estadoRegistroPendiente = await this.findEstadoByFlagAndName(
      "R",
      "PENDIENTE",
    );
    const estadoRegistroCompletado = await this.findEstadoByFlagAndName(
      "R",
      "COMPLETADO",
    );

    this.validateTitularNotRepeated(
      resolvedInput.participantes_detalle,
      titularParticipante.id_participante,
    );
    let detallesGuardados: DetalleTransaccion[] = [];

    const idTransaccion = await this.dataSource.transaction(async (manager) => {
      const transaccion = manager.create(Transaccion, {
        id_usuario: idUsuario,
        fecha: resolvedInput.fecha,
        monto: this.toNumericString(resolvedInput.monto),
        id_tipo_transaccion: resolvedInput.id_tipo_transaccion,
        id_metodo_pago: resolvedInput.id_metodo_pago,
        id_categoria: resolvedInput.id_categoria,
        id_subcategoria: resolvedInput.id_subcategoria,
        id_estado: resolvedInput.id_estado,
        id_estado_registro: this.resolveEstadoRegistroDesdeIngreso(
          resolvedInput,
          estadoRegistroPendiente.id_estado,
          estadoRegistroCompletado.id_estado,
        ),
        descripcion: resolvedInput.descripcion,
        intereses: this.toNumericString(resolvedInput.intereses),
        saldo_pendiente: this.toNumericString(resolvedInput.monto),
        cuotas_sin_intereses: resolvedInput.cuotas_sin_intereses,
        fecha_ultimo_pago: null,
        pagocompartido: resolvedInput.pagocompartido,
      });

      const savedTransaccion = await manager.save(Transaccion, transaccion);

      detallesGuardados = await this.saveDetallesTransaccion(
        manager,
        savedTransaccion.id_transaccion,
        idUsuario,
        titularParticipante.id_participante,
        resolvedInput,
        estadoPendiente.id_estado,
        estadoPagado.id_estado,
      );
      savedTransaccion.id_estado = this.resolveEstadoTransaccionDesdeDetalles(
        resolvedInput.id_tipo_transaccion,
        detallesGuardados,
        estadoPendiente.id_estado,
        estadoPagoParcial.id_estado,
        estadoPagado.id_estado,
      );
      savedTransaccion.saldo_pendiente = this.toNumericString(
        this.calculateTransaccionSaldoPendiente(detallesGuardados),
      );
      savedTransaccion.fecha_ultimo_pago = detallesGuardados.some(
        (detalle) => detalle.fecha_pago !== null,
      )
        ? new Date(resolvedInput.fecha)
        : null;
      await manager.save(Transaccion, savedTransaccion);

      return savedTransaccion.id_transaccion;
    });
    await this.notificacionesService.syncPagoAsignadoNotificationsSafely({
      idUsuarioOrigen: idUsuario,
      idTransaccion,
      descripcion: resolvedInput.descripcion,
      fecha: resolvedInput.fecha,
      detalles: detallesGuardados,
    });

    return this.findOneDetailed(idTransaccion, idUsuario);
  }

  async findAll(idUsuario: number): Promise<TransaccionResponse[]> {
    const transaccionesPropias = await this.transaccionesRepository.find({
      where: { id_usuario: idUsuario },
      order: { fecha: "DESC", id_transaccion: "DESC" },
    });
    const detallesRelacionados = await this.detalleTransaccionesRepository.find(
      {
        where: { id_usuario_relacionado: idUsuario },
        order: { id: "ASC" },
      },
    );
    const transaccionesPropiasIds = new Set(
      transaccionesPropias.map((transaccion) => transaccion.id_transaccion),
    );
    const transaccionesRelacionadasIds = this.uniqueNumbers(
      detallesRelacionados
        .map((detalle) => detalle.id_transaccion)
        .filter((idTransaccion) => !transaccionesPropiasIds.has(idTransaccion)),
    );
    const transaccionesRelacionadas =
      transaccionesRelacionadasIds.length > 0
        ? await this.transaccionesRepository.find({
            where: { id_transaccion: In(transaccionesRelacionadasIds) },
          })
        : [];
    const transacciones = [
      ...transaccionesPropias,
      ...transaccionesRelacionadas,
    ].sort((left, right) => {
      const leftDate = new Date(left.fecha).getTime();
      const rightDate = new Date(right.fecha).getTime();

      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }

      return right.id_transaccion - left.id_transaccion;
    });

    return this.buildDetailedResponses(transacciones, idUsuario);
  }

  async update(
    id: number,
    updateTransaccionDto: UpdateTransaccionDto,
    idUsuario: number,
  ): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findOwnedTransaccion(id, idUsuario);
    const hasAppliedPayments = this.hasAppliedPayments(
      visibleTransaccion.detalles,
    );
    const estadoPendiente = await this.findEstadoByFlagAndName(
      "T",
      "PENDIENTE",
    );
    const estadoPagoParcial = await this.findEstadoByFlagAndName(
      "T",
      "PAGO PARCIAL",
    );
    const estadoPagado = await this.findEstadoByFlagAndName("T", "PAGADO");
    const shouldApplyManagedEstadoChange = this.shouldApplyManagedEstadoChange(
      visibleTransaccion.transaccion.id_estado,
      updateTransaccionDto.id_estado ?? null,
      estadoPendiente.id_estado,
      estadoPagado.id_estado,
    );
    const resolvedInput = await this.resolveTransaccionInput(
      updateTransaccionDto,
      idUsuario,
      visibleTransaccion.transaccion,
      visibleTransaccion.detalles,
      visibleTransaccion.titularParticipante.id_participante,
    );
    resolvedInput.intereses = Number(
      visibleTransaccion.transaccion.intereses ?? 0,
    );

    this.validateTitularNotRepeated(
      resolvedInput.participantes_detalle,
      visibleTransaccion.titularParticipante.id_participante,
    );
    if (hasAppliedPayments) {
      this.validateUpdateWithAppliedPayments(
        visibleTransaccion.transaccion,
        visibleTransaccion.detalles,
        visibleTransaccion.titularParticipante.id_participante,
        resolvedInput,
        shouldApplyManagedEstadoChange,
      );
    }
    const estadoRegistroPendiente = await this.findEstadoByFlagAndName(
      "R",
      "PENDIENTE",
    );
    const estadoRegistroCompletado = await this.findEstadoByFlagAndName(
      "R",
      "COMPLETADO",
    );
    const estadoRegistroAnulado =
      shouldApplyManagedEstadoChange &&
      resolvedInput.id_estado === ESTADO_TRANSACCION_ANULADA_ID
        ? await this.findEstadoByIdAndFlag(ESTADO_REGISTRO_ANULADO_ID, "R")
        : null;
    let detallesGuardados: DetalleTransaccion[] = [];

    await this.dataSource.transaction(async (manager) => {
      visibleTransaccion.transaccion.fecha = resolvedInput.fecha;
      visibleTransaccion.transaccion.monto = this.toNumericString(
        resolvedInput.monto,
      );
      visibleTransaccion.transaccion.id_tipo_transaccion =
        resolvedInput.id_tipo_transaccion;
      visibleTransaccion.transaccion.id_metodo_pago =
        resolvedInput.id_metodo_pago;
      visibleTransaccion.transaccion.id_categoria = resolvedInput.id_categoria;
      visibleTransaccion.transaccion.id_subcategoria =
        resolvedInput.id_subcategoria;
      visibleTransaccion.transaccion.id_estado = resolvedInput.id_estado;
      visibleTransaccion.transaccion.intereses = this.toNumericString(
        resolvedInput.intereses,
      );
      visibleTransaccion.transaccion.cuotas_sin_intereses =
        resolvedInput.cuotas_sin_intereses;
      visibleTransaccion.transaccion.id_estado_registro =
        this.resolveEstadoRegistroDesdeIngreso(
          resolvedInput,
          estadoRegistroPendiente.id_estado,
          estadoRegistroCompletado.id_estado,
        );
      visibleTransaccion.transaccion.descripcion = resolvedInput.descripcion;
      visibleTransaccion.transaccion.pagocompartido =
        resolvedInput.pagocompartido;

      await manager.save(Transaccion, visibleTransaccion.transaccion);
      if (hasAppliedPayments) {
        detallesGuardados = await this.updateDetallesPreservingAppliedPayments(
          manager,
          visibleTransaccion.detalles,
          visibleTransaccion.titularParticipante.id_participante,
          resolvedInput,
          estadoPendiente.id_estado,
          estadoPagado.id_estado,
        );
      } else {
        await manager.delete(DetalleTransaccion, {
          id_transaccion: id,
          id_usuario: idUsuario,
        });

        detallesGuardados = await this.saveDetallesTransaccion(
          manager,
          id,
          idUsuario,
          visibleTransaccion.titularParticipante.id_participante,
          resolvedInput,
          estadoPendiente.id_estado,
          estadoPagado.id_estado,
        );
      }

      if (shouldApplyManagedEstadoChange) {
        detallesGuardados = await this.applyManagedEstadoChangeToDetalles(
          manager,
          detallesGuardados,
          resolvedInput.id_estado,
          estadoPendiente.id_estado,
          estadoPagado.id_estado,
        );
      }

      visibleTransaccion.transaccion.id_estado = resolvedInput.id_estado;
      visibleTransaccion.transaccion.id_estado_registro =
        resolvedInput.id_estado === ESTADO_TRANSACCION_ANULADA_ID
          ? (estadoRegistroAnulado?.id_estado ??
            visibleTransaccion.transaccion.id_estado_registro)
          : this.resolveEstadoRegistroDesdeDetalles(
              Number(visibleTransaccion.transaccion.monto),
              detallesGuardados,
              estadoRegistroPendiente.id_estado,
              estadoRegistroCompletado.id_estado,
              visibleTransaccion.transaccion.id_estado_registro,
            );
      visibleTransaccion.transaccion.saldo_pendiente = this.toNumericString(
        this.calculateTransaccionSaldoPendiente(detallesGuardados),
      );
      visibleTransaccion.transaccion.fecha_ultimo_pago =
        resolvedInput.id_estado === estadoPagado.id_estado ? new Date() : null;
      await manager.save(Transaccion, visibleTransaccion.transaccion);
    });
    await this.notificacionesService.syncPagoAsignadoNotificationsSafely({
      idUsuarioOrigen: idUsuario,
      idTransaccion: id,
      descripcion: resolvedInput.descripcion,
      fecha: resolvedInput.fecha,
      detalles: detallesGuardados,
    });

    return this.findOneDetailed(id, idUsuario);
  }

  async complete(id: number, idUsuario: number): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findOwnedTransaccion(id, idUsuario);
    const estadoRegistroCompletado = await this.findEstadoByFlagAndName(
      "R",
      "COMPLETADO",
    );

    await this.dataSource.transaction(async (manager) => {
      visibleTransaccion.transaccion.id_estado_registro =
        estadoRegistroCompletado.id_estado;
      await manager.save(Transaccion, visibleTransaccion.transaccion);
    });

    return this.findOneDetailed(id, idUsuario);
  }

  async applyPagos(
    id: number,
    applyPagosDto: ApplyPagosTransaccionDto,
    idUsuario: number,
  ): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findAccessibleTransaccion(
      id,
      idUsuario,
    );
    const estadoPendiente = await this.findEstadoByFlagAndName(
      "T",
      "PENDIENTE",
    );
    const estadoPagoParcial = await this.findEstadoByFlagAndName(
      "T",
      "PAGO PARCIAL",
    );
    const estadoPagado = await this.findEstadoByFlagAndName("T", "PAGADO");
    const fechaPagoActual = this.todayAsLocalIsoDate();
    const fechaUltimoPagoActual = new Date();
    const notificacionesCobro: Array<{
      id_participante: number;
      id_usuario_relacionado: number | null;
      monto: number;
    }> = [];

    this.validateApplyPagosRequest(applyPagosDto);

    await this.dataSource.transaction(async (manager) => {
      const detalleIdsAccesibles = new Set(
        visibleTransaccion.detalles.map((detalle) => detalle.id),
      );
      const detallesMap = new Map(
        visibleTransaccion.detallesCompletos.map((detalle) => [
          detalle.id,
          detalle,
        ]),
      );

      if ((applyPagosDto.cuotas_actualizadas?.length ?? 0) > 0) {
        await this.applyCuotasActualizadas(
          manager,
          detallesMap,
          detalleIdsAccesibles,
          applyPagosDto.cuotas_actualizadas ?? [],
          estadoPendiente.id_estado,
          estadoPagoParcial.id_estado,
          estadoPagado.id_estado,
        );
      }

      for (const pago of applyPagosDto.pagos) {
        if (!detalleIdsAccesibles.has(pago.id_detalle)) {
          throw new ForbiddenException(
            `No tienes permiso para aplicar pagos sobre la cuota ${pago.id_detalle}`,
          );
        }

        const detalle = detallesMap.get(pago.id_detalle);

        if (!detalle) {
          throw new NotFoundException(
            `El detalle con id ${pago.id_detalle} no existe dentro de la transaccion seleccionada`,
          );
        }

        const montoCuotaCentavos = this.toCents(Number(detalle.monto));
        const montoPagadoActualCentavos = this.toCents(
          Number(detalle.monto_pagado ?? 0),
        );
        const interesPagadoActualCentavos = this.toCents(
          Number(detalle.interes_pagado ?? 0),
        );
        const interesPendienteCentavos =
          this.getInteresPendienteCentavos(detalle);
        const montoPendienteCentavos = this.getSaldoPendienteCentavos(detalle);

        if (montoPendienteCentavos <= 0) {
          throw new BadRequestException(
            `La cuota con id ${pago.id_detalle} ya se encuentra totalmente pagada`,
          );
        }

        const montoPagoCentavos = this.toCents(pago.monto);

        if (montoPagoCentavos > montoPendienteCentavos) {
          throw new BadRequestException(
            `El monto a pagar no puede ser mayor al saldo pendiente de la cuota ${pago.id_detalle}`,
          );
        }

        notificacionesCobro.push({
          id_participante: detalle.id_participante,
          id_usuario_relacionado: detalle.id_usuario_relacionado,
          monto: this.centsToAmount(montoPagoCentavos),
        });

        const pagoInteresCentavos = Math.min(
          montoPagoCentavos,
          interesPendienteCentavos,
        );
        const pagoPrincipalCentavos = montoPagoCentavos - pagoInteresCentavos;
        const interesPagadoActualizadoCentavos =
          interesPagadoActualCentavos + pagoInteresCentavos;
        const interesPendienteActualizadoCentavos = Math.max(
          0,
          interesPendienteCentavos - pagoInteresCentavos,
        );
        const montoPagadoActualizadoCentavos =
          montoPagadoActualCentavos + pagoPrincipalCentavos;
        const saldoPrincipalRestanteCentavos = Math.max(
          0,
          montoCuotaCentavos - montoPagadoActualizadoCentavos,
        );
        const saldoRestanteCentavos =
          saldoPrincipalRestanteCentavos + interesPendienteActualizadoCentavos;
        if (
          montoPagoCentavos < montoPendienteCentavos &&
          saldoPrincipalRestanteCentavos > 0 &&
          pagoPrincipalCentavos > 0 &&
          interesPendienteActualizadoCentavos === 0
        ) {
          await this.splitDetalleAfterPartialPayment(
            manager,
            detalle,
            montoPagadoActualizadoCentavos,
            saldoPrincipalRestanteCentavos,
            interesPagadoActualizadoCentavos,
            fechaPagoActual,
            estadoPendiente.id_estado,
            estadoPagado.id_estado,
            detallesMap,
          );
          continue;
        }

        detalle.monto_pagado = this.toNumericString(
          this.centsToAmount(montoPagadoActualizadoCentavos),
        );
        detalle.interes_pagado = this.toNumericString(
          this.centsToAmount(interesPagadoActualizadoCentavos),
        );
        detalle.interes_pendiente = this.toNumericString(
          this.centsToAmount(interesPendienteActualizadoCentavos),
        );
        detalle.fecha_pago = fechaPagoActual;
        detalle.id_estado =
          saldoRestanteCentavos === 0
            ? estadoPagado.id_estado
            : estadoPagoParcial.id_estado;
        const savedDetalle = await manager.save(DetalleTransaccion, detalle);
        detallesMap.set(savedDetalle.id, savedDetalle);
      }

      const detallesActualizados = Array.from(detallesMap.values()).sort(
        (left, right) => left.id - right.id,
      );

      visibleTransaccion.transaccion.id_estado =
        this.resolveEstadoTransaccionDesdeDetalles(
          visibleTransaccion.transaccion.id_tipo_transaccion,
          detallesActualizados,
          estadoPendiente.id_estado,
          estadoPagoParcial.id_estado,
          estadoPagado.id_estado,
        );
      visibleTransaccion.transaccion.saldo_pendiente = this.toNumericString(
        this.calculateTransaccionSaldoPendiente(detallesActualizados),
      );
      visibleTransaccion.transaccion.fecha_ultimo_pago = fechaUltimoPagoActual;

      await manager.save(Transaccion, visibleTransaccion.transaccion);
    });

    await this.notificacionesService.createCobroIngresadoNotificationsSafely({
      idUsuarioOrigen: idUsuario,
      idTransaccion: id,
      descripcion: visibleTransaccion.transaccion.descripcion,
      fecha: visibleTransaccion.transaccion.fecha,
      detalles: notificacionesCobro,
    });

    if (
      visibleTransaccion.transaccion.pagocompartido &&
      visibleTransaccion.transaccion.id_usuario !== idUsuario
    ) {
      await this.notificacionesService.createPagoRecibidoNotificationsSafely({
        idUsuarioOrigen: idUsuario,
        idUsuarioDestino: visibleTransaccion.transaccion.id_usuario,
        idTransaccion: id,
        descripcion: visibleTransaccion.transaccion.descripcion,
        fecha: visibleTransaccion.transaccion.fecha,
        detalles: notificacionesCobro.map((detalle) => ({
          id_participante: detalle.id_participante,
          monto: detalle.monto,
        })),
      });
    }

    return this.findOneDetailed(id, idUsuario);
  }

  async applyPagosMasivos(
    applyPagosMasivosDto: ApplyPagosMasivosDto,
    idUsuario: number,
  ): Promise<ApplyPagosMasivosResponse> {
    this.validateApplyPagosMasivosRequest(applyPagosMasivosDto);

    const idsDetalle = applyPagosMasivosDto.ids_detalle ?? [];
    const detallesSeleccionados = await this.detalleTransaccionesRepository.find({
      where: { id: In(idsDetalle) },
      order: { id: "ASC" },
    });
    const detallesMap = new Map(
      detallesSeleccionados.map((detalle) => [detalle.id, detalle]),
    );

    if (detallesSeleccionados.length !== idsDetalle.length) {
      const detalleFaltante = idsDetalle.find((idDetalle) => !detallesMap.has(idDetalle));
      throw new NotFoundException(
        `La cuota con id ${detalleFaltante} no existe o ya no esta disponible`,
      );
    }

    const detalleIdsPorTransaccion = new Map<number, number[]>();

    idsDetalle.forEach((idDetalle) => {
      const detalle = detallesMap.get(idDetalle)!;
      const detalleIds = detalleIdsPorTransaccion.get(detalle.id_transaccion) ?? [];
      detalleIds.push(idDetalle);
      detalleIdsPorTransaccion.set(detalle.id_transaccion, detalleIds);
    });

    for (const [idTransaccion, detalleIds] of detalleIdsPorTransaccion.entries()) {
      const visibleTransaccion = await this.findAccessibleTransaccion(
        idTransaccion,
        idUsuario,
      );
      const detallesAccesiblesMap = new Map(
        visibleTransaccion.detalles.map((detalle) => [detalle.id, detalle]),
      );
      const pagos = detalleIds.map((idDetalle) => {
        const detalle = detallesAccesiblesMap.get(idDetalle);
        const canApplyMassivePago =
          detalle &&
          (detalle.id_usuario_relacionado === idUsuario ||
            (visibleTransaccion.isOwner &&
              detalle.id_tipo_transaccion ===
                DETALLE_TIPO_TRANSACCION_TITULAR_ID));

        if (!canApplyMassivePago) {
          throw new ForbiddenException(
            `No tienes permiso para aplicar pagos sobre la cuota ${idDetalle}`,
          );
        }

        const saldoPendiente = this.centsToAmount(
          this.getSaldoPendienteCentavos(detalle),
        );

        if (this.toCents(saldoPendiente) <= 0) {
          throw new BadRequestException(
            `La cuota con id ${idDetalle} ya se encuentra totalmente pagada`,
          );
        }

        return {
          id_detalle: idDetalle,
          monto: saldoPendiente,
        };
      });

      await this.applyPagos(
        idTransaccion,
        {
          pagos,
        },
        idUsuario,
      );
    }

    return {
      transacciones_actualizadas: Array.from(detalleIdsPorTransaccion.keys()),
      detalles_pagados: idsDetalle.length,
    };
  }

  private async splitDetalleAfterPartialPayment(
    manager: EntityManager,
    detalle: DetalleTransaccion,
    montoPagadoActualizadoCentavos: number,
    saldoRestanteCentavos: number,
    interesPagadoActualizadoCentavos: number,
    fechaPagoActual: string,
    estadoPendienteId: number,
    estadoPagadoId: number,
    detallesMap: Map<number, DetalleTransaccion>,
  ): Promise<void> {
    const cuotasParticipante = Array.from(detallesMap.values())
      .filter(
        (item) =>
          item.id_transaccion === detalle.id_transaccion &&
          item.id_participante === detalle.id_participante,
      )
      .sort(
        (left, right) =>
          left.numero_cuota - right.numero_cuota || left.id - right.id,
      );

    const saldoRestante = this.centsToAmount(saldoRestanteCentavos);
    const currentCuotaNumber = detalle.numero_cuota;
    const nuevoTotalCuotas = cuotasParticipante.length + 1;

    detalle.monto_pagado = this.toNumericString(
      this.centsToAmount(montoPagadoActualizadoCentavos),
    );
    detalle.interes_pagado = this.toNumericString(
      this.centsToAmount(interesPagadoActualizadoCentavos),
    );
    detalle.interes_pendiente = this.toNumericString(0);
    detalle.fecha_pago = fechaPagoActual;
    detalle.id_estado = estadoPagadoId;
    detalle.total_cuotas = nuevoTotalCuotas;

    const detalleSaldoComplementario = manager.create(DetalleTransaccion, {
      id_usuario: detalle.id_usuario,
      id_transaccion: detalle.id_transaccion,
      fecha_pago: null,
      fecha_programada: detalle.fecha_programada,
      fecha_inicio_interes: this.resolveFechaInicioInteresRestante(
        detalle.fecha_ultimo_calculo,
        detalle.fecha_inicio_interes,
        detalle.fecha_programada,
        this.usaFechaProgramadaComoInicioInteres(detalle),
      ),
      interes_acumulado: this.toNumericString(0),
      interes_pagado: this.toNumericString(0),
      interes_pendiente: this.toNumericString(0),
      fecha_ultimo_calculo: null,
      dias_interes: 0,
      id_participante: detalle.id_participante,
      id_usuario_relacionado: detalle.id_usuario_relacionado,
      monto: this.toNumericString(saldoRestante),
      monto_pagado: this.toNumericString(0),
      numero_cuota: currentCuotaNumber + 1,
      total_cuotas: nuevoTotalCuotas,
      id_tipo_transaccion: detalle.id_tipo_transaccion,
      id_metodo_pago: detalle.id_metodo_pago,
      id_estado: estadoPendienteId,
    });

    await manager.save(DetalleTransaccion, detalle);
    const nuevoDetalle = await manager.save(
      DetalleTransaccion,
      detalleSaldoComplementario,
    );
    detallesMap.set(detalle.id, detalle);
    detallesMap.set(nuevoDetalle.id, nuevoDetalle);

    const cuotasExistentes = cuotasParticipante.filter(
      (item) => item.id !== detalle.id,
    );

    for (const cuota of cuotasExistentes) {
      if (cuota.numero_cuota > currentCuotaNumber) {
        cuota.numero_cuota += 1;
      }
      cuota.total_cuotas = nuevoTotalCuotas;
      const cuotaActualizada = await manager.save(DetalleTransaccion, cuota);
      detallesMap.set(cuotaActualizada.id, cuotaActualizada);
    }
  }

  async cancel(id: number, idUsuario: number): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findOwnedTransaccion(id, idUsuario);
    const estadoAnulada = await this.findEstado(ESTADO_TRANSACCION_ANULADA_ID);
    const estadoRegistroAnulado = await this.findEstadoByIdAndFlag(
      ESTADO_REGISTRO_ANULADO_ID,
      "R",
    );

    await this.dataSource.transaction(async (manager) => {
      visibleTransaccion.detalles = await this.applyManagedEstadoChangeToDetalles(
        manager,
        visibleTransaccion.detalles,
        estadoAnulada.id_estado,
        ESTADO_TRANSACCION_PENDIENTE_ID,
        ESTADO_TRANSACCION_PENDIENTE_ID,
      );
      visibleTransaccion.transaccion.id_estado = estadoAnulada.id_estado;
      visibleTransaccion.transaccion.id_estado_registro = estadoRegistroAnulado.id_estado;
      visibleTransaccion.transaccion.saldo_pendiente = this.toNumericString(0);
      visibleTransaccion.transaccion.fecha_ultimo_pago = null;
      await manager.save(Transaccion, visibleTransaccion.transaccion);
    });

    return this.findOneDetailed(id, idUsuario);
  }

  async reactivate(
    id: number,
    idUsuario: number,
  ): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findOwnedTransaccion(id, idUsuario);

    if (
      visibleTransaccion.transaccion.id_estado !== ESTADO_TRANSACCION_ANULADA_ID
    ) {
      throw new BadRequestException(
        "Solo se pueden reactivar transacciones anuladas",
      );
    }

    const estadoPendiente = await this.findEstadoByFlagAndName(
      "T",
      "PENDIENTE",
    );
    const estadoPagoParcial = await this.findEstadoByFlagAndName(
      "T",
      "PAGO PARCIAL",
    );
    const estadoPagado = await this.findEstadoByFlagAndName("T", "PAGADO");
    const estadoRegistroPendiente = await this.findEstadoByFlagAndName(
      "R",
      "PENDIENTE",
    );
    const estadoRegistroCompletado = await this.findEstadoByFlagAndName(
      "R",
      "COMPLETADO",
    );

    await this.dataSource.transaction(async (manager) => {
      visibleTransaccion.detalles = await this.applyManagedEstadoChangeToDetalles(
        manager,
        visibleTransaccion.detalles,
        estadoPendiente.id_estado,
        estadoPendiente.id_estado,
        estadoPagado.id_estado,
      );

      visibleTransaccion.transaccion.id_estado = estadoPendiente.id_estado;
      visibleTransaccion.transaccion.id_estado_registro =
        this.resolveEstadoRegistroDesdeDetalles(
          Number(visibleTransaccion.transaccion.monto),
          visibleTransaccion.detalles,
          estadoRegistroPendiente.id_estado,
          estadoRegistroCompletado.id_estado,
          visibleTransaccion.transaccion.id_estado_registro,
        );
      visibleTransaccion.transaccion.saldo_pendiente = this.toNumericString(
        this.calculateTransaccionSaldoPendiente(visibleTransaccion.detalles),
      );
      visibleTransaccion.transaccion.fecha_ultimo_pago = null;

      await manager.save(Transaccion, visibleTransaccion.transaccion);
    });

    return this.findOneDetailed(id, idUsuario);
  }

  private async resolveTransaccionInput(
    dto: CreateTransaccionDto | UpdateTransaccionDto,
    idUsuario: number,
    existingTransaccion?: Transaccion,
    existingDetalles: DetalleTransaccion[] = [],
    titularParticipanteId?: number,
  ): Promise<ResolvedTransaccionInput> {
    const participantesExistentes =
      titularParticipanteId !== undefined
        ? this.summarizeDetallesByParticipante(
            existingDetalles.filter(
              (detalle) => detalle.id_participante !== titularParticipanteId,
            ),
          )
        : [];
    const titularExistente =
      titularParticipanteId !== undefined
        ? this.summarizeTitularDetalles(existingDetalles, titularParticipanteId)
        : null;
    const participantesExistentesMap = new Map(
      participantesExistentes.map((detalle) => [
        detalle.id_participante,
        detalle,
      ]),
    );
    const participantesDetalle =
      dto.pagocompartido === false
        ? []
        : (dto.participantes_detalle ?? participantesExistentes).map(
            (detalle) => ({
              id_participante: detalle.id_participante,
              monto: detalle.monto,
              cuotas: this.resolveCuotasInput(
                detalle.monto,
                detalle.cuotas,
                detalle.cantidad_cuotas,
                participantesExistentesMap.get(detalle.id_participante)?.cuotas,
              ),
              cantidad_cuotas:
                detalle.cuotas?.length ?? detalle.cantidad_cuotas ?? 1,
            }),
          );
    const montoTitular =
      dto.monto ??
      (existingTransaccion ? Number(existingTransaccion.monto) : 0);
    const cuotasTitularBase = this.calculateTitularMonto(
      montoTitular,
      participantesDetalle,
    );

    const resolvedInput: ResolvedTransaccionInput = {
      fecha: dto.fecha ?? existingTransaccion?.fecha ?? this.todayAsIsoDate(),
      calcula_interes: false,
      cuotas_sin_intereses:
        dto.cuotas_sin_intereses ??
        existingTransaccion?.cuotas_sin_intereses ??
        false,
      titular_cuota_unica_pagada: dto.titular_cuota_unica_pagada ?? false,
      pago_variable: dto.pago_variable ?? false,
      fecha_inicio_interes: null,
      monto: montoTitular,
      intereses:
        dto.intereses ??
        (existingTransaccion ? Number(existingTransaccion.intereses ?? 0) : 0),
      id_tipo_transaccion:
        dto.id_tipo_transaccion ??
        existingTransaccion?.id_tipo_transaccion ??
        1,
      id_metodo_pago:
        dto.id_metodo_pago ?? existingTransaccion?.id_metodo_pago ?? 0,
      id_categoria: dto.id_categoria ?? existingTransaccion?.id_categoria ?? 0,
      id_subcategoria:
        dto.id_subcategoria !== undefined
          ? (dto.id_subcategoria ?? null)
          : (existingTransaccion?.id_subcategoria ?? null),
      id_estado: dto.id_estado ?? existingTransaccion?.id_estado ?? 0,
      descripcion:
        dto.descripcion !== undefined
          ? this.normalizeDescripcion(dto.descripcion)
          : this.normalizeDescripcion(existingTransaccion?.descripcion),
      pagocompartido:
        participantesDetalle.length > 0
          ? (dto.pagocompartido ?? existingTransaccion?.pagocompartido ?? true)
          : false,
      cantidad_cuotas_titular:
        dto.cuotas_titular?.length ??
        dto.cantidad_cuotas_titular ??
        titularExistente?.cantidad_cuotas ??
        1,
      cuotas_titular: this.resolveCuotasInput(
        cuotasTitularBase,
        dto.cuotas_titular,
        dto.cantidad_cuotas_titular ?? titularExistente?.cantidad_cuotas,
        titularExistente?.cuotas,
      ),
      participantes_detalle: participantesDetalle,
    };

    await this.findVisibleTipoTransaccion(
      resolvedInput.id_tipo_transaccion,
      idUsuario,
    );
    const formaPago = await this.findVisibleFormaPago(
      resolvedInput.id_metodo_pago,
      idUsuario,
    );
    resolvedInput.calcula_interes = formaPago.calcula_interes === true;
    resolvedInput.cuotas_sin_intereses = resolvedInput.calcula_interes
      ? resolvedInput.cuotas_sin_intereses
      : false;
    await this.findVisibleCategoria(resolvedInput.id_categoria, idUsuario);
    await this.validateRequiredSubcategoria(
      resolvedInput.id_categoria,
      resolvedInput.id_subcategoria,
      idUsuario,
    );

    resolvedInput.fecha_inicio_interes =
      resolvedInput.calcula_interes && !resolvedInput.cuotas_sin_intereses
        ? this.calculateFechaInicioInteres(
            resolvedInput.fecha,
            formaPago.dias_gracia,
          )
        : null;

    if (resolvedInput.id_subcategoria !== null) {
      await this.findVisibleSubcategoria(
        resolvedInput.id_subcategoria,
        resolvedInput.id_categoria,
        idUsuario,
      );
    }

    if (dto.id_estado === undefined) {
      resolvedInput.id_estado =
        await this.resolveEstadoTransaccionDesdeFormaPago(
          resolvedInput.id_tipo_transaccion,
          resolvedInput.id_estado,
          formaPago,
        );
    }
    await this.findEstado(resolvedInput.id_estado);

    if (resolvedInput.cantidad_cuotas_titular < 1) {
      throw new BadRequestException(
        "El titular debe tener al menos una cuota configurada",
      );
    }

    this.validateParticipacion(
      resolvedInput.pagocompartido,
      resolvedInput.monto,
      resolvedInput.participantes_detalle,
    );

    this.validateMontoMinimoPermitido(resolvedInput);

    if (resolvedInput.pagocompartido) {
      await this.findVisibleParticipantes(
        resolvedInput.participantes_detalle,
        idUsuario,
      );
    }

    const montoTitularCalculado = this.calculateTitularMonto(
      resolvedInput.monto,
      resolvedInput.participantes_detalle,
    );

    this.validateMontoCubiertoPorParticipantes(
      resolvedInput.monto,
      resolvedInput.participantes_detalle,
      montoTitularCalculado,
    );

    const allowZeroAmountCuotas =
      existingTransaccion !== undefined &&
      this.hasAppliedPayments(existingDetalles);

    this.validateCuotasCubrenMonto(
      resolvedInput.cuotas_titular,
      montoTitularCalculado,
      "titular",
      allowZeroAmountCuotas,
    );

    resolvedInput.participantes_detalle.forEach((detalle) => {
      this.validateCuotasCubrenMonto(
        detalle.cuotas,
        detalle.monto,
        `participante ${detalle.id_participante}`,
        allowZeroAmountCuotas,
      );
    });

    this.validateTitularCuotaUnicaPagadaInput(
      resolvedInput,
      montoTitularCalculado,
    );

    return resolvedInput;
  }

  private async resolveEstadoTransaccionDesdeFormaPago(
    idTipoTransaccion: number,
    idEstadoActual: number,
    formaPago: FormaPago,
  ): Promise<number> {
    if (idTipoTransaccion === 2) {
      const estadoPendiente = await this.findEstadoByFlagAndName(
        "T",
        "PENDIENTE",
      );
      return estadoPendiente.id_estado;
    }

    if (idTipoTransaccion !== 1) {
      return idEstadoActual;
    }

    if (formaPago.tipo_producto?.pago_inmediato === true) {
      const estadoPagado = await this.findEstadoByFlagAndName("T", "PAGADO");
      return estadoPagado.id_estado;
    }

    if (formaPago.tipo_producto?.pago_inmediato === false) {
      const estadoPendiente = await this.findEstadoByFlagAndName(
        "T",
        "PENDIENTE",
      );
      return estadoPendiente.id_estado;
    }

    return idEstadoActual;
  }

  private async saveDetallesTransaccion(
    manager: EntityManager,
    idTransaccion: number,
    idUsuario: number,
    titularParticipanteId: number,
    resolvedInput: ResolvedTransaccionInput,
    estadoPendienteId: number,
    estadoPagadoId: number,
  ): Promise<DetalleTransaccion[]> {
    const montoTitular = this.calculateTitularMonto(
      resolvedInput.monto,
      resolvedInput.participantes_detalle,
    );
    const titularTieneParticipacion =
      resolvedInput.pago_variable || this.toCents(montoTitular) > 0;
    const participantesRelacionados =
      resolvedInput.participantes_detalle.length > 0
        ? await manager.find(Participante, {
            where: {
              id_participante: In(
                resolvedInput.participantes_detalle.map(
                  (detalle) => detalle.id_participante,
                ),
              ),
            },
          })
        : [];
    const participantesRelacionadosMap = new Map(
      participantesRelacionados.map((participante) => [
        participante.id_participante,
        participante.id_usuario_relacionado ?? null,
      ]),
    );
    const fechaInicioInteres =
      resolvedInput.fecha_inicio_interes ?? resolvedInput.fecha;
    const estadoInicialDetalleId = this.resolveInitialDetalleEstadoId(
      resolvedInput.id_estado,
      estadoPendienteId,
      estadoPagadoId,
    );

    const detalleEntities = [
      ...(titularTieneParticipacion
        ? this.buildDetalleEntitiesForCuotas(
            manager,
            idUsuario,
            idTransaccion,
            titularParticipanteId,
            resolvedInput.cuotas_titular,
            DETALLE_TIPO_TRANSACCION_TITULAR_ID,
            resolvedInput.id_metodo_pago,
            estadoInicialDetalleId,
            null,
            fechaInicioInteres,
            resolvedInput.cuotas_sin_intereses,
          )
        : []),
      ...resolvedInput.participantes_detalle.flatMap((detalle) =>
        this.buildDetalleEntitiesForCuotas(
          manager,
          idUsuario,
          idTransaccion,
          detalle.id_participante,
          detalle.cuotas,
          DETALLE_TIPO_TRANSACCION_PARTICIPANTE_ID,
          resolvedInput.id_metodo_pago,
          estadoInicialDetalleId,
          participantesRelacionadosMap.get(detalle.id_participante) ?? null,
          fechaInicioInteres,
          resolvedInput.cuotas_sin_intereses,
        ),
      ),
    ];

    if (resolvedInput.calcula_interes) {
      this.distributeInteresesAcrossPendingDetalles(
        detalleEntities,
        resolvedInput.intereses,
      );
    }

    this.applyTitularSinglePaymentIfNeeded(
      detalleEntities,
      titularParticipanteId,
      resolvedInput,
      estadoPagadoId,
    );
    this.applyIngresoPagadoDefaultsIfNeeded(
      detalleEntities,
      resolvedInput,
      estadoPagadoId,
    );

    return manager.save(DetalleTransaccion, detalleEntities);
  }

  private resolveInitialDetalleEstadoId(
    idEstadoTransaccion: number,
    estadoPendienteId: number,
    estadoPagadoId: number,
  ): number {
    return idEstadoTransaccion === estadoPagadoId
      ? estadoPagadoId
      : estadoPendienteId;
  }

  private async findOneDetailed(
    id: number,
    idUsuario: number,
  ): Promise<TransaccionResponse> {
    const visibleTransaccion = await this.findAccessibleTransaccion(
      id,
      idUsuario,
    );
    const responses = await this.buildDetailedResponses(
      [visibleTransaccion.transaccion],
      idUsuario,
    );

    const response = responses[0];

    if (!response) {
      throw new NotFoundException(`La transaccion con id ${id} no existe`);
    }

    return response;
  }

  private async findOwnedTransaccion(
    id: number,
    idUsuario: number,
  ): Promise<{
    transaccion: Transaccion;
    detalles: DetalleTransaccion[];
    titularParticipante: Participante;
  }> {
    const titularParticipante = await this.ensureTitularParticipante(idUsuario);
    const transaccion = await this.transaccionesRepository.findOne({
      where: { id_transaccion: id, id_usuario: idUsuario },
    });

    if (!transaccion) {
      throw new NotFoundException(
        `La transaccion con id ${id} no existe o no pertenece al usuario logueado`,
      );
    }

    const detalles = await this.detalleTransaccionesRepository.find({
      where: { id_transaccion: id, id_usuario: idUsuario },
      order: { id: "ASC" },
    });

    return {
      transaccion,
      detalles,
      titularParticipante,
    };
  }

  private async findAccessibleTransaccion(
    id: number,
    idUsuario: number,
  ): Promise<{
    transaccion: Transaccion;
    detalles: DetalleTransaccion[];
    detallesCompletos: DetalleTransaccion[];
    isOwner: boolean;
  }> {
    const transaccionPropia = await this.transaccionesRepository.findOne({
      where: { id_transaccion: id, id_usuario: idUsuario },
    });

    if (transaccionPropia) {
      const detallesCompletos = await this.detalleTransaccionesRepository.find({
        where: { id_transaccion: id },
        order: { id: "ASC" },
      });

      return {
        transaccion: transaccionPropia,
        detalles: detallesCompletos,
        detallesCompletos,
        isOwner: true,
      };
    }

    const transaccion = await this.transaccionesRepository.findOne({
      where: { id_transaccion: id },
    });

    if (!transaccion) {
      throw new NotFoundException(
        `La transaccion con id ${id} no existe o no pertenece al usuario logueado`,
      );
    }

    const detallesRelacionados = await this.detalleTransaccionesRepository.find(
      {
        where: { id_transaccion: id, id_usuario_relacionado: idUsuario },
        order: { id: "ASC" },
      },
    );

    if (detallesRelacionados.length === 0) {
      throw new NotFoundException(
        `La transaccion con id ${id} no existe o no pertenece al usuario logueado`,
      );
    }

    const detallesCompletos = await this.detalleTransaccionesRepository.find({
      where: { id_transaccion: id },
      order: { id: "ASC" },
    });

    return {
      transaccion,
      detalles: detallesRelacionados,
      detallesCompletos,
      isOwner: false,
    };
  }

  private async buildDetailedResponses(
    transacciones: Transaccion[],
    idUsuario: number,
    detallesPrecargados?: DetalleTransaccion[],
  ): Promise<TransaccionResponse[]> {
    if (transacciones.length === 0) {
      return [];
    }

    const transaccionIds = this.uniqueNumbers(
      transacciones.map((transaccion) => transaccion.id_transaccion),
    );
    const detalles =
      detallesPrecargados ??
      (await this.detalleTransaccionesRepository.find({
        where: { id_transaccion: In(transaccionIds) },
        order: { id: "ASC" },
      }));

    const metodoIds = this.uniqueNumbers([
      ...transacciones.map((transaccion) => transaccion.id_metodo_pago),
      ...detalles.map((detalle) => detalle.id_metodo_pago),
    ]);
    const tipoIds = this.uniqueNumbers(
      transacciones.map((transaccion) => transaccion.id_tipo_transaccion),
    );
    const categoriaIds = this.uniqueNumbers(
      transacciones.map((transaccion) => transaccion.id_categoria),
    );
    const subcategoriaIds = this.uniqueNumbers(
      transacciones
        .map((transaccion) => transaccion.id_subcategoria)
        .filter((value): value is number => value !== null),
    );
    const participanteIds = this.uniqueNumbers([
      ...detalles.map((detalle) => detalle.id_participante),
    ]);

    const [
      formasPago,
      tiposTransaccion,
      categorias,
      subcategorias,
      estados,
      participantes,
    ] = await Promise.all([
      metodoIds.length > 0
        ? this.formasPagoRepository.find({
            where: { id_metodo: In(metodoIds) },
          })
        : Promise.resolve([]),
      tipoIds.length > 0
        ? this.tiposTransaccionRepository.find({
            where: { id_tipo: In(tipoIds) },
          })
        : Promise.resolve([]),
      categoriaIds.length > 0
        ? this.categoriasRepository.find({
            where: { id_categoria: In(categoriaIds) },
          })
        : Promise.resolve([]),
      subcategoriaIds.length > 0
        ? this.subcategoriasRepository.find({
            where: { id_subcategoria: In(subcategoriaIds) },
          })
        : Promise.resolve([]),
      this.estadosTransaccionRepository.find({
        where: [
          { flag: "T", estado: "ACTIVO" },
          { flag: "R", estado: "ACTIVO" },
        ],
      }),
      participanteIds.length > 0
        ? this.participantesRepository.find({
            where: { id_participante: In(participanteIds) },
          })
        : Promise.resolve([]),
    ]);

    const formasPagoMap = new Map(
      formasPago.map((forma) => [forma.id_metodo, forma]),
    );
    const tiposTransaccionMap = new Map(
      tiposTransaccion.map((tipo) => [tipo.id_tipo, tipo]),
    );
    const categoriasMap = new Map(
      categorias.map((categoria) => [categoria.id_categoria, categoria]),
    );
    const subcategoriasMap = new Map(
      subcategorias.map((subcategoria) => [
        subcategoria.id_subcategoria,
        subcategoria,
      ]),
    );
    const estadosMap = new Map(
      estados.map((estado) => [estado.id_estado, estado]),
    );
    const participantesMap = new Map(
      participantes.map((participante) => [
        participante.id_participante,
        participante,
      ]),
    );
    const estadoRegistroPendiente =
      estados.find(
        (estado) =>
          estado.flag === "R" &&
          estado.estado === "ACTIVO" &&
          estado.nombre_estado === "PENDIENTE",
      ) ?? null;
    const estadoRegistroCompletado =
      estados.find(
        (estado) =>
          estado.flag === "R" &&
          estado.estado === "ACTIVO" &&
          estado.nombre_estado === "COMPLETADO",
      ) ?? null;
    return transacciones.map((transaccion) => {
      const isOwner = transaccion.id_usuario === idUsuario;
      const detallesTransaccionCompletos = detalles.filter(
        (detalle) => detalle.id_transaccion === transaccion.id_transaccion,
      );
      const detallesTransaccionAccesibles = isOwner
        ? detallesTransaccionCompletos
        : detallesTransaccionCompletos.filter(
            (detalle) => detalle.id_usuario_relacionado === idUsuario,
          );
      const titularParticipanteId =
        detallesTransaccionCompletos.find(
          (detalle) =>
            detalle.id_tipo_transaccion === DETALLE_TIPO_TRANSACCION_TITULAR_ID,
        )?.id_participante ?? null;
      const detallesTransaccionOrdenados = [
        ...detallesTransaccionCompletos,
      ].sort((left, right) => {
        const leftTitular =
          titularParticipanteId !== null &&
          left.id_participante === titularParticipanteId
            ? 1
            : 0;
        const rightTitular =
          titularParticipanteId !== null &&
          right.id_participante === titularParticipanteId
            ? 1
            : 0;

        if (leftTitular !== rightTitular) {
          return rightTitular - leftTitular;
        }

        if (left.id_participante !== right.id_participante) {
          return left.id_participante - right.id_participante;
        }

        if (left.numero_cuota !== right.numero_cuota) {
          return left.numero_cuota - right.numero_cuota;
        }

        return left.id - right.id;
      });
      const detallesTransaccion = isOwner
        ? detallesTransaccionOrdenados
        : detallesTransaccionOrdenados.filter(
            (detalle) => detalle.id_usuario_relacionado === idUsuario,
          );

      const participantesDetalle = detallesTransaccion.map((detalle) => {
        const participante =
          participantesMap.get(detalle.id_participante) ?? null;
        const estado = estadosMap.get(detalle.id_estado) ?? null;
        const formaPago = formasPagoMap.get(detalle.id_metodo_pago) ?? null;
        const montoDetalle = Number(detalle.monto);
        const montoPagadoDetalle = Number(detalle.monto_pagado ?? 0);
        const aplicaInteresDetalle = formaPago?.calcula_interes === true;
        const interesPagadoDetalle = aplicaInteresDetalle
          ? Number(detalle.interes_pagado ?? 0)
          : 0;
        const interesPendienteDetalle = aplicaInteresDetalle
          ? Number(detalle.interes_pendiente ?? 0)
          : 0;
        const saldoPendiente = this.centsToAmount(
          this.getSaldoPendienteCentavos(detalle),
        );

        return {
          id: detalle.id,
          id_participante: detalle.id_participante,
          id_usuario_relacionado: detalle.id_usuario_relacionado ?? null,
          nombre_participante: participante?.nombre_participante ?? null,
          monto: montoDetalle,
          monto_pagado: montoPagadoDetalle,
          interes_pagado: interesPagadoDetalle,
          interes_pendiente: interesPendienteDetalle,
          saldo_pendiente: saldoPendiente,
          porcentaje:
            Number(transaccion.monto) > 0
              ? Number(
                  ((montoDetalle / Number(transaccion.monto)) * 100).toFixed(2),
                )
              : 0,
          fecha_pago: detalle.fecha_pago,
          fecha_programada: detalle.fecha_programada,
          fecha_inicio_interes: detalle.fecha_inicio_interes,
          numero_cuota: detalle.numero_cuota ?? 1,
          total_cuotas: detalle.total_cuotas ?? 1,
          id_metodo_pago: detalle.id_metodo_pago,
          nombre_forma_pago: formaPago?.nombre_metodo ?? null,
          id_estado: detalle.id_estado,
          nombre_estado: estado?.nombre_estado ?? null,
          fecha_creacion: detalle.fecha_creacion,
          es_titular:
            titularParticipanteId !== null &&
            detalle.id_participante === titularParticipanteId,
        };
      });

      const formaPago = formasPagoMap.get(transaccion.id_metodo_pago) ?? null;
      const tipoTransaccion =
        tiposTransaccionMap.get(transaccion.id_tipo_transaccion) ?? null;
      const categoria = categoriasMap.get(transaccion.id_categoria) ?? null;
      const subcategoria =
        transaccion.id_subcategoria !== null
          ? (subcategoriasMap.get(transaccion.id_subcategoria) ?? null)
          : null;
      const estadoTransaccionId = transaccion.id_estado;
      const estado = estadosMap.get(estadoTransaccionId) ?? null;
      const estadoRegistroId = this.isRegistroAnulado(transaccion)
        ? transaccion.id_estado_registro
        : this.resolveEstadoRegistroDesdeDetalles(
            Number(transaccion.monto),
            detallesTransaccionCompletos,
            estadoRegistroPendiente?.id_estado ?? null,
            estadoRegistroCompletado?.id_estado ?? null,
            transaccion.id_estado_registro,
          );
      const estadoRegistro =
        estadoRegistroId !== null
          ? (estadosMap.get(estadoRegistroId) ?? null)
          : null;
      const titular =
        participantesMap.get(titularParticipanteId ?? -1)
          ?.nombre_participante ?? null;
      const cantidadParticipantesUnicos = new Set(
        participantesDetalle.map((detalle) => detalle.id_participante),
      ).size;
      const montoVisible = this.centsToAmount(
        detallesTransaccionAccesibles.reduce(
          (sum, detalle) => sum + this.getMontoDistribuidoCentavos(detalle),
          0,
        ),
      );
      const saldoPendienteVisible = this.centsToAmount(
        detallesTransaccionAccesibles.reduce(
          (sum, detalle) => sum + this.getSaldoPendienteCentavos(detalle),
          0,
        ),
      );
      const interesesVisibles = this.centsToAmount(
        detallesTransaccionAccesibles.reduce((sum, detalle) => {
          const formaPagoDetalle =
            formasPagoMap.get(detalle.id_metodo_pago) ?? null;
          if (formaPagoDetalle?.calcula_interes !== true) {
            return sum;
          }

          return sum + this.getInteresPendienteCentavos(detalle);
        }, 0),
      );
      const aplicaInteresTransaccion = formaPago?.calcula_interes === true;

      return {
        id_transaccion: transaccion.id_transaccion,
        es_propietario: isOwner,
        fecha: transaccion.fecha,
        monto: isOwner ? Number(transaccion.monto) : montoVisible,
        intereses:
          isOwner && aplicaInteresTransaccion
            ? Number(transaccion.intereses ?? 0)
            : interesesVisibles,
        cuotas_sin_intereses: transaccion.cuotas_sin_intereses === true,
        tasa_interes_anual:
          formaPago?.calcula_interes === true &&
          formaPago?.tasa_anual !== null &&
          formaPago?.tasa_anual !== undefined
            ? Number(formaPago.tasa_anual)
            : null,
        saldo_pendiente: saldoPendienteVisible,
        id_tipo_transaccion: transaccion.id_tipo_transaccion,
        nombre_tipo_transaccion: tipoTransaccion?.nombre ?? null,
        id_metodo_pago: transaccion.id_metodo_pago,
        nombre_forma_pago: formaPago?.nombre_metodo ?? null,
        id_categoria: transaccion.id_categoria,
        nombre_categoria: categoria?.nombre_categoria ?? null,
        id_subcategoria: transaccion.id_subcategoria,
        nombre_subcategoria: subcategoria?.nombre_subcategoria ?? null,
        id_estado: estadoTransaccionId,
        nombre_estado: estado?.nombre_estado ?? null,
        id_estado_registro: estadoRegistroId,
        nombre_estado_registro: estadoRegistro?.nombre_estado ?? null,
        descripcion: transaccion.descripcion,
        pagocompartido: transaccion.pagocompartido,
        fecha_ultimo_pago: transaccion.fecha_ultimo_pago,
        fecha_creacion: transaccion.fecha_creacion,
        titular,
        cantidad_participantes: cantidadParticipantesUnicos,
        participantes_detalle: participantesDetalle,
      };
    });
  }

  private validateParticipacion(
    pagoCompartido: boolean,
    montoTotal: number,
    participantesDetalle: ResolvedDetalleInput[],
  ): void {
    if (!pagoCompartido && participantesDetalle.length > 0) {
      throw new BadRequestException(
        "No debes enviar participantes cuando la transaccion no es compartida",
      );
    }

    if (pagoCompartido && participantesDetalle.length === 0) {
      throw new BadRequestException(
        "Debes agregar al menos un participante cuando el pago es compartido",
      );
    }

    if (!pagoCompartido) {
      return;
    }

    const participanteIds = participantesDetalle.map(
      (detalle) => detalle.id_participante,
    );
    const participantesUnicos = new Set(participanteIds);

    if (participantesUnicos.size !== participanteIds.length) {
      throw new BadRequestException(
        "No puedes repetir participantes dentro de la misma transaccion compartida",
      );
    }

    if (participantesDetalle.some((detalle) => detalle.cantidad_cuotas < 1)) {
      throw new BadRequestException(
        "Cada participante debe tener al menos una cuota configurada",
      );
    }

    const montoTotalCentavos = this.toCents(montoTotal);
    const montoParticipantesCentavos = participantesDetalle.reduce(
      (sum, detalle) => sum + this.toCents(detalle.monto),
      0,
    );

    if (montoParticipantesCentavos > montoTotalCentavos) {
      throw new BadRequestException(
        "La suma de los montos de participantes no puede ser mayor al monto total de la transaccion",
      );
    }
  }

  private validateApplyPagosRequest(
    applyPagosDto: ApplyPagosTransaccionDto,
  ): void {
    const pagos = applyPagosDto.pagos ?? [];

    if (pagos.length === 0) {
      throw new BadRequestException(
        "Debes enviar al menos un pago para aplicar",
      );
    }

    const detalleIds = pagos.map((pago) => pago.id_detalle);
    const detalleIdsUnicos = new Set(detalleIds);

    if (detalleIdsUnicos.size !== detalleIds.length) {
      throw new BadRequestException(
        "No puedes repetir el mismo detalle dentro de una sola aplicacion de pagos",
      );
    }

    const cuotasActualizadas = applyPagosDto.cuotas_actualizadas ?? [];
    const cuotaIds = cuotasActualizadas.map((cuota) => cuota.id_detalle);
    const cuotaIdsUnicos = new Set(cuotaIds);

    if (cuotaIdsUnicos.size !== cuotaIds.length) {
      throw new BadRequestException(
        "No puedes repetir la misma cuota dentro de una sola redistribucion",
      );
    }
  }

  private validateApplyPagosMasivosRequest(
    applyPagosMasivosDto: ApplyPagosMasivosDto,
  ): void {
    const idsDetalle = applyPagosMasivosDto.ids_detalle ?? [];

    if (idsDetalle.length === 0) {
      throw new BadRequestException(
        "Debes enviar al menos una cuota para aplicar el pago masivo",
      );
    }

    const idsDetalleUnicos = new Set(idsDetalle);

    if (idsDetalleUnicos.size !== idsDetalle.length) {
      throw new BadRequestException(
        "No puedes repetir la misma cuota dentro de un pago masivo",
      );
    }
  }

  private async applyCuotasActualizadas(
    manager: EntityManager,
    detallesMap: Map<number, DetalleTransaccion>,
    detalleIdsAccesibles: ReadonlySet<number>,
    cuotasActualizadas: ApplyCuotaActualizadaDto[],
    estadoPendienteId: number,
    estadoPagoParcialId: number,
    estadoPagadoId: number,
  ): Promise<void> {
    const updatesByParticipante = new Map<number, ApplyCuotaActualizadaDto[]>();

    for (const cuotaActualizada of cuotasActualizadas) {
      if (!detalleIdsAccesibles.has(cuotaActualizada.id_detalle)) {
        throw new ForbiddenException(
          `No tienes permiso para redistribuir la cuota ${cuotaActualizada.id_detalle}`,
        );
      }

      const detalle = detallesMap.get(cuotaActualizada.id_detalle);

      if (!detalle) {
        throw new NotFoundException(
          `La cuota con id ${cuotaActualizada.id_detalle} no existe dentro de la transaccion seleccionada`,
        );
      }

      const updates = updatesByParticipante.get(detalle.id_participante) ?? [];
      updates.push(cuotaActualizada);
      updatesByParticipante.set(detalle.id_participante, updates);
    }

    for (const [idParticipante, updates] of updatesByParticipante.entries()) {
      const detallesParticipante = Array.from(detallesMap.values())
        .filter((detalle) => detalle.id_participante === idParticipante)
        .sort((left, right) => left.numero_cuota - right.numero_cuota);
      const detalleIds = detallesParticipante
        .map((detalle) => detalle.id)
        .sort((a, b) => a - b);
      const updateIds = updates
        .map((update) => update.id_detalle)
        .sort((a, b) => a - b);

      if (
        detalleIds.length !== updateIds.length ||
        !detalleIds.every((detalleId, index) => detalleId === updateIds[index])
      ) {
        throw new BadRequestException(
          `Debes enviar todas las cuotas del participante ${idParticipante} para redistribuir sus montos`,
        );
      }

      const totalActualCentavos = detallesParticipante.reduce(
        (sum, detalle) => sum + this.toCents(Number(detalle.monto)),
        0,
      );
      const totalActualizadoCentavos = updates.reduce(
        (sum, update) => sum + this.toCents(update.monto),
        0,
      );

      if (totalActualCentavos !== totalActualizadoCentavos) {
        throw new BadRequestException(
          `La suma de cuotas actualizadas del participante ${idParticipante} debe mantenerse igual al total original`,
        );
      }

      const updateMap = new Map(
        updates.map((update) => [update.id_detalle, update]),
      );

      for (const detalle of detallesParticipante) {
        const update = updateMap.get(detalle.id)!;
        const montoPagadoCentavos = this.toCents(
          Number(detalle.monto_pagado ?? 0),
        );
        const nuevoMontoCentavos = this.toCents(update.monto);

        if (nuevoMontoCentavos < montoPagadoCentavos) {
          throw new BadRequestException(
            `La cuota ${detalle.id} no puede quedar por debajo de lo ya pagado`,
          );
        }

        detalle.monto = this.toNumericString(update.monto);
        const saldoRestanteCentavos = nuevoMontoCentavos - montoPagadoCentavos;
        detalle.id_estado =
          saldoRestanteCentavos === 0
            ? estadoPagadoId
            : montoPagadoCentavos > 0
              ? estadoPagoParcialId
              : estadoPendienteId;

        await manager.save(DetalleTransaccion, detalle);
        detallesMap.set(detalle.id, detalle);
      }
    }
  }

  private validateTitularNotRepeated(
    participantesDetalle: ResolvedDetalleInput[],
    titularParticipanteId: number,
  ): void {
    if (
      participantesDetalle.some(
        (detalle) => detalle.id_participante === titularParticipanteId,
      )
    ) {
      throw new BadRequestException(
        "El titular no debe repetirse dentro de los participantes adicionales",
      );
    }
  }

  private async findVisibleParticipantes(
    participantesDetalle: ResolvedDetalleInput[],
    idUsuario: number,
  ): Promise<void> {
    const participantesIds = participantesDetalle.map(
      (detalle) => detalle.id_participante,
    );
    const visibleUserIds = await this.getVisibleUserIds(idUsuario);
    const participantes = await this.participantesRepository.find({
      where: {
        id_participante: In(participantesIds),
        id_usuario: In(visibleUserIds),
      },
    });

    if (participantes.length !== participantesIds.length) {
      throw new NotFoundException(
        "Uno o mas participantes no existen o no pertenecen al usuario logueado",
      );
    }

    if (
      participantes.some(
        (participante) =>
          participante.id_usuario_titular === idUsuario ||
          participante.id_usuario_relacionado === idUsuario,
      )
    ) {
      throw new BadRequestException(
        "El titular no debe repetirse dentro de los participantes adicionales",
      );
    }
  }

  private validateMontoMinimoPermitido(
    resolvedInput: ResolvedTransaccionInput,
  ): void {
    if (resolvedInput.pago_variable) {
      return;
    }

    if (this.toCents(resolvedInput.monto) <= 0) {
      throw new BadRequestException(
        'El monto total de la transaccion debe ser mayor que cero',
      );
    }

    if (
      resolvedInput.participantes_detalle.some(
        (detalle) => this.toCents(detalle.monto) <= 0,
      )
    ) {
      throw new BadRequestException(
        'Cada participante debe tener un monto mayor que cero',
      );
    }
  }

  private validateMontoCubiertoPorParticipantes(
    montoTotal: number,
    participantesDetalle: ResolvedDetalleInput[],
    montoTitular: number,
  ): void {
    const montoTotalCentavos = this.toCents(montoTotal);
    const montoParticipantesCentavos = participantesDetalle.reduce(
      (sum, detalle) => sum + this.toCents(detalle.monto),
      0,
    );
    const montoTitularCentavos = this.toCents(montoTitular);

    if (montoTitularCentavos < 0) {
      throw new BadRequestException(
        "El monto total de la transaccion no queda cubierto correctamente por el titular y los participantes",
      );
    }

    if (
      montoParticipantesCentavos + montoTitularCentavos !==
      montoTotalCentavos
    ) {
      throw new BadRequestException(
        "El monto total de la transaccion debe quedar cubierto completamente por el titular o por los participantes del pago compartido",
      );
    }
  }

  private validateTitularCuotaUnicaPagadaInput(
    resolvedInput: ResolvedTransaccionInput,
    montoTitularCalculado: number,
  ): void {
    if (!resolvedInput.titular_cuota_unica_pagada) {
      return;
    }

    if (resolvedInput.id_tipo_transaccion === 2) {
      throw new BadRequestException(
        "Solo se puede marcar como pagada la cuota unica inicial del titular en gastos",
      );
    }

    if (resolvedInput.cuotas_titular.length !== 1) {
      throw new BadRequestException(
        "Solo se puede marcar como pagada la cuota unica 1/1 del titular",
      );
    }

    if (this.toCents(montoTitularCalculado) <= 0) {
      throw new BadRequestException(
        "La cuota unica del titular debe tener un monto mayor que 0 para marcarla como pagada",
      );
    }
  }

  private resolveEstadoPagoTransaccion(
    detalles: DetalleTransaccion[],
    estadoPendienteId: number,
    estadoPagoParcialId: number,
    estadoPagadoId: number,
  ): number {
    const detallesActivos = detalles.filter(
      (detalle) => !this.isDetalleAnulado(detalle),
    );

    if (detallesActivos.length === 0) {
      return estadoPendienteId;
    }

    const hayPendientes = detallesActivos.some(
      (detalle) => this.getSaldoPendienteCentavos(detalle) > 0,
    );
    const hayPagados = detallesActivos.some(
      (detalle) => this.getMontoPagadoTotalCentavos(detalle) > 0,
    );
    const hayPagoParcialMarcado = detallesActivos.some(
      (detalle) => detalle.id_estado === estadoPagoParcialId,
    );
    const todosMarcadosPagado = detallesActivos.every(
      (detalle) => detalle.id_estado === estadoPagadoId,
    );

    if (hayPendientes && (hayPagados || hayPagoParcialMarcado)) {
      return estadoPagoParcialId;
    }

    if (hayPagados || todosMarcadosPagado) {
      return estadoPagadoId;
    }

    return estadoPendienteId;
  }

  private resolveEstadoIngresoTransaccion(
    detalles: Array<
      Pick<
        DetalleTransaccion,
        | "id_estado"
        | "monto"
        | "monto_pagado"
        | "interes_pagado"
        | "interes_pendiente"
        | "fecha_programada"
      >
    >,
    estadoPendienteId: number,
    estadoPagoParcialId: number,
    estadoPagadoId: number,
  ): number {
    const detallesActivos = detalles.filter(
      (detalle) => !this.isDetalleAnulado(detalle),
    );

    if (detallesActivos.length === 0) {
      return estadoPendienteId;
    }

    if (
      detallesActivos.every(
        (detalle) => this.getSaldoPendienteCentavos(detalle) === 0,
      )
    ) {
      return estadoPagadoId;
    }

    const today = this.todayAsLocalIsoDate();
    const hayFechaProgramadaVencida = detallesActivos.some((detalle) => {
      const fechaProgramada = this.normalizeOptionalIsoDate(
        detalle.fecha_programada,
      );
      return fechaProgramada !== null && fechaProgramada < today;
    });
    const hayPagosAplicados = detallesActivos.some(
      (detalle) => this.getMontoPagadoTotalCentavos(detalle) > 0,
    );

    if (hayFechaProgramadaVencida || hayPagosAplicados) {
      return estadoPagoParcialId;
    }

    return estadoPendienteId;
  }

  private resolveEstadoTransaccionDesdeDetalles(
    idTipoTransaccion: number,
    detalles: Array<
      Pick<
        DetalleTransaccion,
        | "id_estado"
        | "monto"
        | "monto_pagado"
        | "interes_pagado"
        | "interes_pendiente"
        | "fecha_programada"
      >
    >,
    estadoPendienteId: number,
    estadoPagoParcialId: number,
    estadoPagadoId: number,
  ): number {
    if (idTipoTransaccion === 2) {
      return this.resolveEstadoIngresoTransaccion(
        detalles,
        estadoPendienteId,
        estadoPagoParcialId,
        estadoPagadoId,
      );
    }

    return this.resolveEstadoPagoTransaccion(
      detalles as DetalleTransaccion[],
      estadoPendienteId,
      estadoPagoParcialId,
      estadoPagadoId,
    );
  }

  private resolveEstadoRegistroDesdeIngreso(
    resolvedInput: ResolvedTransaccionInput,
    estadoRegistroPendienteId: number,
    estadoRegistroCompletadoId: number,
  ): number {
    return this.isRegistroCompletoDesdeIngreso(resolvedInput)
      ? estadoRegistroCompletadoId
      : estadoRegistroPendienteId;
  }

  private isRegistroCompletoDesdeIngreso(
    resolvedInput: ResolvedTransaccionInput,
  ): boolean {
    if (resolvedInput.pago_variable) {
      return false;
    }

    const montoTitular = this.calculateTitularMonto(
      resolvedInput.monto,
      resolvedInput.participantes_detalle,
    );

    if (montoTitular < 0) {
      return false;
    }

    const montoTotalCentavos = this.toCents(resolvedInput.monto);
    const montoDistribuidoCentavos =
      this.toCents(montoTitular) +
      resolvedInput.participantes_detalle.reduce(
        (sum, detalle) => sum + this.toCents(detalle.monto),
        0,
      );

    if (montoDistribuidoCentavos !== montoTotalCentavos) {
      return false;
    }

    const cuotasTitularCentavos = resolvedInput.cuotas_titular.reduce(
      (sum, cuota) => sum + this.toCents(cuota.monto),
      0,
    );

    if (cuotasTitularCentavos !== this.toCents(montoTitular)) {
      return false;
    }

    return resolvedInput.participantes_detalle.every((detalle) => {
      const cuotasParticipanteCentavos = detalle.cuotas.reduce(
        (sum, cuota) => sum + this.toCents(cuota.monto),
        0,
      );

      return cuotasParticipanteCentavos === this.toCents(detalle.monto);
    });
  }

  private resolveEstadoRegistroDesdeDetalles(
    montoTransaccion: number,
    detalles: Array<
      Pick<DetalleTransaccion, "monto" | "monto_pagado"> &
        Partial<Pick<DetalleTransaccion, "id_estado" | "interes_pendiente">>
    >,
    estadoRegistroPendienteId: number | null,
    estadoRegistroCompletadoId: number | null,
    currentEstadoRegistroId: number | null,
  ): number | null {
    if (detalles.length === 0) {
      return estadoRegistroPendienteId ?? currentEstadoRegistroId;
    }

    const montoDetallesCentavos = detalles.reduce(
      (sum, detalle) => sum + this.getMontoDistribuidoCentavos(detalle),
      0,
    );

    if (montoDetallesCentavos === this.toCents(montoTransaccion)) {
      return estadoRegistroCompletadoId ?? currentEstadoRegistroId;
    }

    return estadoRegistroPendienteId ?? currentEstadoRegistroId;
  }

  private resolveReactivatedDetalleEstado(
    idTipoTransaccion: number,
    detalle: Pick<
      DetalleTransaccion,
      "monto" | "monto_pagado" | "interes_pagado" | "interes_pendiente"
    >,
    estadoPendienteId: number,
    estadoPagoParcialId: number,
    estadoPagadoId: number,
  ): number {
    const principalPendienteCentavos = Math.max(
      0,
      this.toCents(Number(detalle.monto)) -
        this.toCents(Number(detalle.monto_pagado ?? 0)),
    );
    const interesPendienteCentavos = Math.max(
      0,
      this.toCents(Number(detalle.interes_pendiente ?? 0)),
    );
    const saldoPendienteCentavos =
      principalPendienteCentavos + interesPendienteCentavos;

    if (saldoPendienteCentavos === 0) {
      return estadoPagadoId;
    }

    return this.getMontoPagadoTotalCentavos(detalle) > 0
      ? estadoPagoParcialId
      : estadoPendienteId;
  }

  private shouldApplyManagedEstadoChange(
    currentEstadoId: number,
    nextEstadoId: number | null,
    estadoPendienteId: number,
    estadoPagadoId: number,
  ): boolean {
    if (nextEstadoId === null || nextEstadoId === currentEstadoId) {
      return false;
    }

    return [
      ESTADO_TRANSACCION_ANULADA_ID,
      estadoPendienteId,
      estadoPagadoId,
    ].includes(nextEstadoId);
  }

  private async applyManagedEstadoChangeToDetalles(
    manager: EntityManager,
    detalles: DetalleTransaccion[],
    nextEstadoId: number,
    estadoPendienteId: number,
    estadoPagadoId: number,
  ): Promise<DetalleTransaccion[]> {
    const currentDate = this.todayAsLocalIsoDate();

    for (const detalle of detalles) {
      if (
        nextEstadoId !== ESTADO_TRANSACCION_ANULADA_ID &&
        this.shouldKeepDetalleAnuladoOnReactivation(detalle)
      ) {
        continue;
      }

      if (nextEstadoId === ESTADO_TRANSACCION_ANULADA_ID) {
        this.applyAnuladoEstadoToDetalle(detalle);
        continue;
      }

      if (nextEstadoId === estadoPagadoId) {
        this.applyPagadoEstadoToDetalle(detalle, currentDate, estadoPagadoId);
        continue;
      }

      this.applyPendienteEstadoToDetalle(detalle, estadoPendienteId);
    }

    return manager.save(DetalleTransaccion, detalles);
  }

  private applyAnuladoEstadoToDetalle(detalle: DetalleTransaccion): void {
    detalle.id_estado = ESTADO_TRANSACCION_ANULADA_ID;
    detalle.monto_pagado = this.toNumericString(0);
    detalle.interes_acumulado = this.toNumericString(0);
    detalle.interes_pagado = this.toNumericString(0);
    detalle.interes_pendiente = this.toNumericString(0);
    detalle.dias_interes = 0;
    detalle.fecha_pago = null;
    detalle.fecha_ultimo_calculo = null;
  }

  private applyPendienteEstadoToDetalle(
    detalle: DetalleTransaccion,
    estadoPendienteId: number,
  ): void {
    detalle.id_estado = estadoPendienteId;
    detalle.monto_pagado = this.toNumericString(0);
    detalle.interes_acumulado = this.toNumericString(0);
    detalle.interes_pagado = this.toNumericString(0);
    detalle.interes_pendiente = this.toNumericString(0);
    detalle.dias_interes = 0;
    detalle.fecha_pago = null;
    detalle.fecha_ultimo_calculo = null;
  }

  private applyPagadoEstadoToDetalle(
    detalle: DetalleTransaccion,
    currentDate: string,
    estadoPagadoId: number,
  ): void {
    detalle.id_estado = estadoPagadoId;
    detalle.fecha_pago = currentDate;
    detalle.fecha_ultimo_calculo = currentDate;
    detalle.dias_interes = 0;
    detalle.monto_pagado = this.toNumericString(Number(detalle.monto ?? 0));
    detalle.interes_pagado = this.toNumericString(
      Number(detalle.interes_pagado ?? 0) + Number(detalle.interes_pendiente ?? 0),
    );
    detalle.interes_pendiente = this.toNumericString(0);
    detalle.interes_acumulado = this.toNumericString(0);
  }

  private async findVisibleFormaPago(
    idFormaPago: number,
    idUsuario: number,
  ): Promise<FormaPago> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const formaPago = await this.formasPagoRepository.findOne({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_metodo: idFormaPago,
        id_usuario: usuarioVisible,
      })),
    });

    if (!formaPago) {
      throw new NotFoundException(
        `La forma de pago con id ${idFormaPago} no existe o no esta visible para el usuario logueado`,
      );
    }

    return formaPago;
  }

  private async findVisibleTipoTransaccion(
    idTipoTransaccion: number,
    idUsuario: number,
  ): Promise<TipoTransaccion> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const tipoTransaccion = await this.tiposTransaccionRepository.findOne({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_tipo: idTipoTransaccion,
        id_usuario: usuarioVisible,
      })),
    });

    if (!tipoTransaccion) {
      throw new NotFoundException(
        `El tipo de transaccion con id ${idTipoTransaccion} no existe o no esta visible para el usuario logueado`,
      );
    }

    return tipoTransaccion;
  }

  private async findVisibleCategoria(
    idCategoria: number,
    idUsuario: number,
  ): Promise<Categoria> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const categoria = await this.categoriasRepository.findOne({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_categoria: idCategoria,
        id_usuario: usuarioVisible,
      })),
    });

    if (!categoria) {
      throw new NotFoundException(
        `La categoria con id ${idCategoria} no existe o no esta visible para el usuario logueado`,
      );
    }

    return categoria;
  }

  private async findVisibleSubcategoria(
    idSubcategoria: number,
    idCategoria: number,
    idUsuario: number,
  ): Promise<Subcategoria> {
    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const subcategoria = await this.subcategoriasRepository.findOne({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_subcategoria: idSubcategoria,
        id_categoria: idCategoria,
        id_usuario: usuarioVisible,
      })),
    });

    if (!subcategoria) {
      throw new NotFoundException(
        `La subcategoria con id ${idSubcategoria} no existe para la categoria seleccionada o no esta visible para el usuario logueado`,
      );
    }

    return subcategoria;
  }

  private async validateRequiredSubcategoria(
    idCategoria: number,
    idSubcategoria: number | null,
    idUsuario: number,
  ): Promise<void> {
    if (idSubcategoria !== null) {
      return;
    }

    const usuariosVisibles = await this.getVisibleUserIds(idUsuario);
    const subcategoriasActivas = await this.subcategoriasRepository.count({
      where: usuariosVisibles.map((usuarioVisible) => ({
        id_categoria: idCategoria,
        id_usuario: usuarioVisible,
        estado: true,
      })),
    });

    if (subcategoriasActivas > 0) {
      throw new BadRequestException(
        "La subcategoria es obligatoria cuando la categoria seleccionada tiene subcategorias activas",
      );
    }
  }

  private async findEstado(idEstado: number): Promise<EstadoTransaccion> {
    const estado = await this.estadosTransaccionRepository.findOne({
      where: { id_estado: idEstado, estado: "ACTIVO", flag: "T" },
    });

    if (!estado) {
      throw new NotFoundException(
        `El estado con id ${idEstado} no existe, no esta activo o no corresponde a estados de pago`,
      );
    }

    return estado;
  }

  private async findEstadoByFlagAndName(
    flag: string,
    nombreEstado: string,
  ): Promise<EstadoTransaccion> {
    const estado = await this.estadosTransaccionRepository.findOne({
      where: {
        flag,
        estado: "ACTIVO",
        nombre_estado: nombreEstado,
      },
    });

    if (!estado) {
      throw new NotFoundException(
        `No existe un estado activo con flag ${flag} y nombre ${nombreEstado}`,
      );
    }

    return estado;
  }

  private async findEstadoByIdAndFlag(
    idEstado: number,
    flag: string,
  ): Promise<EstadoTransaccion> {
    const estado = await this.estadosTransaccionRepository.findOne({
      where: {
        id_estado: idEstado,
        flag,
        estado: "ACTIVO",
      },
    });

    if (!estado) {
      throw new NotFoundException(
        `No existe un estado activo con id ${idEstado} y flag ${flag}`,
      );
    }

    return estado;
  }

  private async ensureTitularParticipante(
    idUsuario: number,
  ): Promise<Participante> {
    const usuario = await this.usuariosRepository.findOne({
      where: { id_usuario: idUsuario },
    });

    if (!usuario) {
      throw new NotFoundException(`El usuario con id ${idUsuario} no existe`);
    }

    const usernameTitular = usuario.username.trim();
    const nombreCompletoTitular = usuario.nombre_completo?.trim() || null;
    const participanteExistente = await this.participantesRepository
      .createQueryBuilder("participante")
      .where("COALESCE(participante.estado, :estadoActivo) = :estadoActivo", {
        estadoActivo: "ACTIVO",
      })
      .andWhere(
        new Brackets((queryBuilder) => {
          queryBuilder.where("participante.id_usuario_titular = :idUsuario", {
            idUsuario,
          });

          queryBuilder.orWhere(
            new Brackets((ownedQueryBuilder) => {
              ownedQueryBuilder
                .where("participante.id_usuario = :idUsuario", { idUsuario })
                .andWhere(
                  new Brackets((matchQueryBuilder) => {
                    matchQueryBuilder.where(
                      "LOWER(participante.nombre_participante) = LOWER(:usernameTitular)",
                      { usernameTitular },
                    );

                    if (nombreCompletoTitular) {
                      matchQueryBuilder.orWhere(
                        "LOWER(participante.nombre_participante) = LOWER(:nombreCompletoTitular)",
                        {
                          nombreCompletoTitular,
                        },
                      );
                    }
                  }),
                );
            }),
          );
        }),
      )
      .orderBy(
        `CASE
          WHEN participante.id_usuario_titular = :idUsuario THEN 0
          WHEN LOWER(participante.nombre_participante) = LOWER(:usernameTitular) THEN 1
          ${nombreCompletoTitular ? "WHEN LOWER(participante.nombre_participante) = LOWER(:nombreCompletoTitular) THEN 2" : ""}
          ELSE 3
        END`,
        "ASC",
      )
      .addOrderBy("participante.id_participante", "ASC")
      .setParameters({
        idUsuario,
        usernameTitular,
        nombreCompletoTitular,
      })
      .getOne();

    if (participanteExistente) {
      return participanteExistente;
    }

    const nuevoParticipante = this.participantesRepository.create({
      id_usuario: idUsuario,
      id_usuario_titular: idUsuario,
      nombre_participante: usernameTitular,
      correo_electronico: usernameTitular.toLowerCase(),
      celular: null,
      porcentaje_participacion: "100",
      estado: "ACTIVO",
    });

    return this.participantesRepository.save(nuevoParticipante);
  }

  private getVisibleUserIds(idUsuario: number): Promise<number[]> {
    return buildVisibleUserIds(this.transaccionesRepository, idUsuario);
  }

  private normalizeDescripcion(descripcion?: string | null): string | null {
    const descripcionNormalizada = descripcion?.trim();
    return descripcionNormalizada ? descripcionNormalizada : null;
  }

  private normalizeOptionalIsoDate(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : null;
  }

  private calculateFechaInicioInteres(
    fechaTransaccion: string,
    diasGracia: number | null | undefined,
  ): string | null {
    const fechaBase = this.normalizeOptionalIsoDate(fechaTransaccion);

    if (!fechaBase) {
      return null;
    }

    const dias = Math.max(0, Math.trunc(Number(diasGracia ?? 0)));
    return this.addDaysToIsoDate(fechaBase, dias);
  }

  private resolveFechaInicioInteresRestante(
    fechaUltimoCalculo: string | null,
    fechaInicioInteres: string | null,
    fechaProgramada: string | null,
    cuotasSinIntereses: boolean,
  ): string | null {
    const fechaProgramadaNormalizada =
      this.normalizeOptionalIsoDate(fechaProgramada);
    const fechaInicioInteresNormalizada =
      this.normalizeOptionalIsoDate(fechaInicioInteres);
    const fechaUltimoCalculoNormalizada =
      this.normalizeOptionalIsoDate(fechaUltimoCalculo);

    if (cuotasSinIntereses) {
      return (
        fechaProgramadaNormalizada ??
        fechaInicioInteresNormalizada ??
        fechaUltimoCalculoNormalizada
      );
    }

    if (!fechaInicioInteresNormalizada) {
      return fechaProgramadaNormalizada ?? fechaUltimoCalculoNormalizada;
    }

    if (!fechaUltimoCalculoNormalizada) {
      return fechaInicioInteresNormalizada;
    }

    return this.addDaysToIsoDate(fechaUltimoCalculoNormalizada, 1);
  }

  private calculateTitularMonto(
    montoTotal: number,
    participantesDetalle: ResolvedDetalleInput[],
  ): number {
    const montoTotalCentavos = this.toCents(montoTotal);
    const montoParticipantesCentavos = participantesDetalle.reduce(
      (sum, detalle) => sum + this.toCents(detalle.monto),
      0,
    );

    return this.centsToAmount(montoTotalCentavos - montoParticipantesCentavos);
  }

  private buildDetalleEntitiesForCuotas(
    manager: EntityManager,
    idUsuario: number,
    idTransaccion: number,
    idParticipante: number,
    cuotas: ResolvedCuotaInput[],
    idTipoTransaccion: number,
    idMetodoPago: number,
    idEstado: number,
    idUsuarioRelacionado: number | null,
    fechaInicioInteres: string | null,
    cuotasSinIntereses: boolean,
  ): DetalleTransaccion[] {
    return cuotas.map((cuota, index) =>
      manager.create(DetalleTransaccion, {
        id_usuario: idUsuario,
        id_transaccion: idTransaccion,
        fecha_pago: null,
        fecha_programada: cuota.fecha_programada,
        fecha_inicio_interes: this.resolveFechaInicioInteresRestante(
          null,
          fechaInicioInteres,
          cuota.fecha_programada,
          cuotasSinIntereses,
        ),
        dias_interes: 0,
        id_participante: idParticipante,
        id_usuario_relacionado: idUsuarioRelacionado,
        monto: this.toNumericString(cuota.monto),
        monto_pagado: this.toNumericString(0),
        numero_cuota: index + 1,
        total_cuotas: cuotas.length,
        id_tipo_transaccion: idTipoTransaccion,
        id_metodo_pago: idMetodoPago,
        id_estado: idEstado,
      }),
    );
  }

  private applyTitularSinglePaymentIfNeeded(
    detalleEntities: DetalleTransaccion[],
    titularParticipanteId: number,
    resolvedInput: ResolvedTransaccionInput,
    estadoPagadoId: number,
  ): void {
    if (!resolvedInput.titular_cuota_unica_pagada) {
      return;
    }

    const detalleTitular = detalleEntities.find(
      (detalle) =>
        detalle.id_participante === titularParticipanteId &&
        detalle.id_tipo_transaccion === DETALLE_TIPO_TRANSACCION_TITULAR_ID &&
        detalle.numero_cuota === 1 &&
        detalle.total_cuotas === 1,
    );

    if (!detalleTitular) {
      return;
    }

    detalleTitular.monto_pagado = this.toNumericString(
      Number(detalleTitular.monto ?? 0),
    );
    detalleTitular.interes_pagado = this.toNumericString(0);
    detalleTitular.interes_pendiente = this.toNumericString(0);
    detalleTitular.fecha_pago = resolvedInput.fecha;
    detalleTitular.id_estado = estadoPagadoId;
  }

  private applyIngresoPagadoDefaultsIfNeeded(
    detalleEntities: DetalleTransaccion[],
    resolvedInput: ResolvedTransaccionInput,
    estadoPagadoId: number,
  ): void {
    if (
      resolvedInput.id_tipo_transaccion !== 2 ||
      resolvedInput.id_estado !== estadoPagadoId
    ) {
      return;
    }

    const today = this.todayAsLocalIsoDate();

    detalleEntities.forEach((detalle) => {
      this.applyIngresoPagadoDefaultsToDetalle(detalle, today, estadoPagadoId);
    });
  }

  private applyIngresoPagadoDefaultsToDetalleIfNeeded(
    detalle: DetalleTransaccion,
    resolvedInput: ResolvedTransaccionInput,
    estadoPagadoId: number,
  ): void {
    if (
      resolvedInput.id_tipo_transaccion !== 2 ||
      resolvedInput.id_estado !== estadoPagadoId
    ) {
      return;
    }

    this.applyIngresoPagadoDefaultsToDetalle(
      detalle,
      this.todayAsLocalIsoDate(),
      estadoPagadoId,
    );
  }

  private applyIngresoPagadoDefaultsToDetalle(
    detalle: DetalleTransaccion,
    currentDate: string,
    estadoPagadoId: number,
  ): void {
    detalle.fecha_programada = currentDate;
    detalle.fecha_pago = currentDate;
    detalle.monto_pagado = this.toNumericString(Number(detalle.monto ?? 0));
    detalle.interes_pagado = this.toNumericString(0);
    detalle.interes_pendiente = this.toNumericString(0);
    detalle.id_estado = estadoPagadoId;
  }

  private distributeMontoEnCuotas(
    montoTotal: number,
    totalCuotas: number,
  ): number[] {
    const cuotas = Math.max(1, totalCuotas);
    const montoTotalCentavos = this.toCents(montoTotal);
    const montoBaseCentavos = Math.floor(montoTotalCentavos / cuotas);
    const sobranteCentavos = montoTotalCentavos % cuotas;

    return Array.from({ length: cuotas }, (_, index) =>
      this.centsToAmount(
        montoBaseCentavos + (index < sobranteCentavos ? 1 : 0),
      ),
    );
  }

  private distributeInteresesAcrossPendingDetalles(
    detalles: DetalleTransaccion[],
    intereses: number,
  ): void {
    const interesesCentavos = Math.max(0, this.toCents(intereses));

    if (interesesCentavos <= 0 || detalles.length === 0) {
      return;
    }

    const detallesPendientes = detalles.filter(
      (detalle) => this.getSaldoPendienteCentavos(detalle) > 0,
    );

    if (detallesPendientes.length === 0) {
      return;
    }

    const totalPendienteCentavos = detallesPendientes.reduce(
      (sum, detalle) => sum + this.getSaldoPendienteCentavos(detalle),
      0,
    );

    if (totalPendienteCentavos <= 0) {
      return;
    }

    let interesesAsignadosCentavos = 0;

    detallesPendientes.forEach((detalle, index) => {
      const saldoPendienteCentavos = this.getSaldoPendienteCentavos(detalle);
      const interesesDetalleCentavos =
        index < detallesPendientes.length - 1
          ? Math.floor(
              (interesesCentavos * saldoPendienteCentavos) /
                totalPendienteCentavos,
            )
          : interesesCentavos - interesesAsignadosCentavos;

      interesesAsignadosCentavos += interesesDetalleCentavos;

      const montoActualCentavos = this.toCents(Number(detalle.monto));
      detalle.monto = this.toNumericString(
        this.centsToAmount(montoActualCentavos + interesesDetalleCentavos),
      );
    });
  }

  private summarizeDetallesByParticipante(
    detalles: DetalleTransaccion[],
  ): ResolvedDetalleInput[] {
    const detallesPorParticipante = new Map<number, ResolvedDetalleInput>();

    for (const detalle of detalles) {
      if (this.isDetalleAnulado(detalle)) {
        continue;
      }

      const existente = detallesPorParticipante.get(detalle.id_participante);

      if (existente) {
        existente.monto = this.centsToAmount(
          this.toCents(existente.monto) + this.toCents(Number(detalle.monto)),
        );
        existente.cantidad_cuotas += 1;
        existente.cuotas.push({
          monto: Number(detalle.monto),
          fecha_programada: this.normalizeOptionalIsoDate(
            detalle.fecha_programada,
          ),
        });
        continue;
      }

      detallesPorParticipante.set(detalle.id_participante, {
        id_participante: detalle.id_participante,
        monto: Number(detalle.monto),
        cantidad_cuotas: 1,
        cuotas: [
          {
            monto: Number(detalle.monto),
            fecha_programada: this.normalizeOptionalIsoDate(
              detalle.fecha_programada,
            ),
          },
        ],
      });
    }

    return Array.from(detallesPorParticipante.values());
  }

  private summarizeTitularDetalles(
    detalles: DetalleTransaccion[],
    titularParticipanteId: number,
  ): { cantidad_cuotas: number; cuotas: ResolvedCuotaInput[] } | null {
    const detallesTitular = detalles.filter(
      (detalle) =>
        detalle.id_participante === titularParticipanteId &&
        !this.isDetalleAnulado(detalle),
    );

    if (detallesTitular.length === 0) {
      return null;
    }

    return {
      cantidad_cuotas: detallesTitular.length,
      cuotas: detallesTitular
        .sort((left, right) => left.numero_cuota - right.numero_cuota)
        .map((detalle) => ({
          monto: Number(detalle.monto),
          fecha_programada: this.normalizeOptionalIsoDate(
            detalle.fecha_programada,
          ),
        })),
    };
  }

  private resolveCuotasInput(
    montoTotal: number,
    cuotas?: CuotaProgramadaDto[],
    cantidadCuotas?: number,
    cuotasExistentes?: ResolvedCuotaInput[],
  ): ResolvedCuotaInput[] {
    if (cuotas && cuotas.length > 0) {
      return cuotas.map((cuota) => ({
        monto: this.centsToAmount(this.toCents(Number(cuota.monto))),
        fecha_programada: this.normalizeOptionalIsoDate(cuota.fecha_programada),
      }));
    }

    const cantidadNormalizada = Math.max(1, cantidadCuotas ?? 1);

    if (
      cuotasExistentes &&
      cuotasExistentes.length > 0 &&
      cuotasExistentes.length === cantidadNormalizada &&
      cuotasExistentes.reduce(
        (sum, cuota) => sum + this.toCents(cuota.monto),
        0,
      ) === this.toCents(montoTotal)
    ) {
      return cuotasExistentes.map((cuota) => ({
        monto: this.centsToAmount(this.toCents(cuota.monto)),
        fecha_programada: this.normalizeOptionalIsoDate(cuota.fecha_programada),
      }));
    }

    return this.distributeMontoEnCuotas(montoTotal, cantidadNormalizada).map(
      (monto) => ({
        monto,
        fecha_programada: null,
      }),
    );
  }

  private validateCuotasCubrenMonto(
    cuotas: ResolvedCuotaInput[],
    montoEsperado: number,
    referencia: string,
    allowZeroAmounts = false,
  ): void {
    if (cuotas.length === 0) {
      throw new BadRequestException(
        `Debes definir al menos una cuota para ${referencia}`,
      );
    }

    const montoEsperadoCentavos = this.toCents(montoEsperado);
    const cuotasInvalidas = cuotas.some((cuota) =>
      montoEsperadoCentavos === 0
        ? this.toCents(cuota.monto) < 0
        : allowZeroAmounts
          ? this.toCents(cuota.monto) < 0
          : this.toCents(cuota.monto) <= 0,
    );

    if (cuotasInvalidas) {
      throw new BadRequestException(
        montoEsperadoCentavos === 0
          ? `Las cuotas de ${referencia} no pueden ser negativas`
          : allowZeroAmounts
            ? `Las cuotas de ${referencia} no pueden ser negativas`
            : `Todas las cuotas de ${referencia} deben ser mayores que cero`,
      );
    }

    const totalCuotasCentavos = cuotas.reduce(
      (sum, cuota) => sum + this.toCents(cuota.monto),
      0,
    );

    if (totalCuotasCentavos !== this.toCents(montoEsperado)) {
      throw new BadRequestException(
        `La suma de cuotas de ${referencia} debe cubrir exactamente su monto asignado`,
      );
    }
  }

  private hasAppliedPayments(
    detalles: Array<
      Pick<DetalleTransaccion, "monto_pagado" | "interes_pagado" | "fecha_pago">
    >,
  ): boolean {
    return detalles.some((detalle) => this.hasAppliedPaymentOnDetalle(detalle));
  }

  private hasAppliedPaymentOnDetalle(
    detalle: Pick<
      DetalleTransaccion,
      "monto_pagado" | "interes_pagado" | "fecha_pago"
    >,
  ): boolean {
    return (
      this.getMontoPagadoTotalCentavos(detalle) > 0 ||
      detalle.fecha_pago !== null
    );
  }

  private shouldKeepDetalleAnuladoOnReactivation(
    detalle: Pick<
      DetalleTransaccion,
      | "monto"
      | "monto_pagado"
      | "interes_pagado"
      | "interes_pendiente"
      | "fecha_pago"
      | "id_estado"
    >,
  ): boolean {
    if (!this.isDetalleAnulado(detalle)) {
      return false;
    }

    return (
      this.toCents(Number(detalle.monto)) === 0 &&
      this.toCents(Number(detalle.monto_pagado ?? 0)) === 0 &&
      this.toCents(Number(detalle.interes_pagado ?? 0)) === 0 &&
      this.toCents(Number(detalle.interes_pendiente ?? 0)) === 0 &&
      detalle.fecha_pago === null
    );
  }

  private isDetalleAnulado(
    detalle: Pick<DetalleTransaccion, "id_estado">,
  ): boolean {
    return detalle.id_estado === ESTADO_TRANSACCION_ANULADA_ID;
  }

  private isTransaccionAnulada(
    transaccion: Pick<Transaccion, "id_estado">,
  ): boolean {
    return transaccion.id_estado === ESTADO_TRANSACCION_ANULADA_ID;
  }

  private isRegistroAnulado(
    transaccion: Pick<Transaccion, "id_estado_registro">,
  ): boolean {
    return transaccion.id_estado_registro === ESTADO_REGISTRO_ANULADO_ID;
  }

  private validateUpdateWithAppliedPayments(
    existingTransaccion: Transaccion,
    existingDetalles: DetalleTransaccion[],
    titularParticipanteId: number,
    resolvedInput: ResolvedTransaccionInput,
    allowEstadoMasivoChange = false,
  ): void {
    if (resolvedInput.fecha !== existingTransaccion.fecha) {
      throw new BadRequestException(
        "No puedes cambiar la fecha de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (
      this.toCents(resolvedInput.monto) !==
      this.toCents(Number(existingTransaccion.monto))
    ) {
      throw new BadRequestException(
        "No puedes cambiar el monto total de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (
      this.toCents(resolvedInput.intereses) !==
      this.toCents(Number(existingTransaccion.intereses ?? 0))
    ) {
      throw new BadRequestException(
        "No puedes cambiar los intereses de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (
      resolvedInput.cuotas_sin_intereses !==
      (existingTransaccion.cuotas_sin_intereses === true)
    ) {
      throw new BadRequestException(
        "No puedes cambiar la configuracion de cuotas sin intereses de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (
      resolvedInput.id_tipo_transaccion !==
      existingTransaccion.id_tipo_transaccion
    ) {
      throw new BadRequestException(
        "No puedes cambiar el tipo de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (resolvedInput.id_metodo_pago !== existingTransaccion.id_metodo_pago) {
      throw new BadRequestException(
        "No puedes cambiar la forma de pago de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (
      !allowEstadoMasivoChange &&
      resolvedInput.id_estado !== existingTransaccion.id_estado
    ) {
      throw new BadRequestException(
        "No puedes cambiar el estado de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    if (resolvedInput.pagocompartido !== existingTransaccion.pagocompartido) {
      throw new BadRequestException(
        "No puedes cambiar la estructura de participantes de una transaccion que ya tiene cuotas con pagos aplicados",
      );
    }

    const existingByParticipante =
      this.buildDetalleMapByParticipante(existingDetalles);
    const submittedByParticipante = this.buildSubmittedCuotasMap(
      resolvedInput,
      titularParticipanteId,
    );

    if (existingByParticipante.size !== submittedByParticipante.size) {
      throw new BadRequestException(
        "No puedes agregar o quitar participantes cuando ya existen cuotas con pagos aplicados",
      );
    }

    for (const [
      idParticipante,
      detallesParticipante,
    ] of existingByParticipante.entries()) {
      const cuotasEnviadas = submittedByParticipante.get(idParticipante);

      if (!cuotasEnviadas) {
        throw new BadRequestException(
          `Debes conservar todas las cuotas del participante ${idParticipante} porque ya existen pagos aplicados`,
        );
      }

      const plan = this.buildDetalleUpdatePlan(
        detallesParticipante,
        cuotasEnviadas,
        idParticipante,
      );

      plan.activeExistingDetalles.forEach((detalle, index) => {
        if (!this.hasAppliedPaymentOnDetalle(detalle)) {
          return;
        }

        const cuotaEnviada = cuotasEnviadas[index];

        if (!cuotaEnviada) {
          throw new BadRequestException(
            `Debes conservar la cuota ${detalle.id} porque ya tiene pagos aplicados`,
          );
        }

        if (
          this.toCents(cuotaEnviada.monto) !==
            this.toCents(Number(detalle.monto_pagado ?? 0)) ||
          cuotaEnviada.fecha_programada !==
            this.normalizeOptionalIsoDate(detalle.fecha_programada)
        ) {
          throw new BadRequestException(
            `La cuota ${detalle.id} ya tiene pagos aplicados; solo puede conservar fija la parte ya pagada`,
          );
        }
      });
    }
  }

  private buildSubmittedCuotasMap(
    resolvedInput: ResolvedTransaccionInput,
    titularParticipanteId: number,
  ): Map<number, ResolvedCuotaInput[]> {
    const cuotasPorParticipante = new Map<number, ResolvedCuotaInput[]>();
    cuotasPorParticipante.set(
      titularParticipanteId,
      resolvedInput.cuotas_titular,
    );

    resolvedInput.participantes_detalle.forEach((detalle) => {
      cuotasPorParticipante.set(detalle.id_participante, detalle.cuotas);
    });

    return cuotasPorParticipante;
  }

  private buildDetalleMapByParticipante(
    detalles: DetalleTransaccion[],
  ): Map<number, DetalleTransaccion[]> {
    const detallesPorParticipante = new Map<number, DetalleTransaccion[]>();

    for (const detalle of [...detalles].sort((left, right) => {
      if (left.id_participante !== right.id_participante) {
        return left.id_participante - right.id_participante;
      }

      if ((left.numero_cuota ?? 1) !== (right.numero_cuota ?? 1)) {
        return (left.numero_cuota ?? 1) - (right.numero_cuota ?? 1);
      }

      return left.id - right.id;
    })) {
      if (this.isDetalleAnulado(detalle)) {
        continue;
      }

      const existentes =
        detallesPorParticipante.get(detalle.id_participante) ?? [];
      existentes.push(detalle);
      detallesPorParticipante.set(detalle.id_participante, existentes);
    }

    return detallesPorParticipante;
  }

  private buildDetalleUpdatePlan(
    detallesParticipante: DetalleTransaccion[],
    cuotasEnviadas: ResolvedCuotaInput[],
    idParticipante: number,
  ): DetalleUpdatePlan {
    const orderedDetalles = [...detallesParticipante].sort((left, right) => {
      if ((left.numero_cuota ?? 1) !== (right.numero_cuota ?? 1)) {
        return (left.numero_cuota ?? 1) - (right.numero_cuota ?? 1);
      }

      return left.id - right.id;
    });
    const appliedDetalles = orderedDetalles.filter((detalle) =>
      this.hasAppliedPaymentOnDetalle(detalle),
    );
    const pendingDetalles = orderedDetalles.filter(
      (detalle) => !this.hasAppliedPaymentOnDetalle(detalle),
    );
    const totalPendienteExistenteCentavos = pendingDetalles.reduce(
      (sum, detalle) => sum + this.toCents(Number(detalle.monto)),
      0,
    );
    const minCuotasPermitidas =
      appliedDetalles.length + (totalPendienteExistenteCentavos > 0 ? 1 : 0);

    if (cuotasEnviadas.length < minCuotasPermitidas) {
      throw new BadRequestException(
        `No puedes reducir la cantidad de cuotas del participante ${idParticipante} por debajo de las cuotas ya pagadas y del saldo pendiente restante`,
      );
    }

    const pendingDetallesToKeep = Math.min(
      pendingDetalles.length,
      Math.max(0, cuotasEnviadas.length - appliedDetalles.length),
    );
    const activeExistingDetalles: DetalleTransaccion[] = [];
    const removedPendingDetalles: DetalleTransaccion[] = [];
    let keptPendingCount = 0;

    for (const detalle of orderedDetalles) {
      if (this.hasAppliedPaymentOnDetalle(detalle)) {
        activeExistingDetalles.push(detalle);
        continue;
      }

      if (keptPendingCount < pendingDetallesToKeep) {
        activeExistingDetalles.push(detalle);
        keptPendingCount += 1;
        continue;
      }

      removedPendingDetalles.push(detalle);
    }

    return {
      activeExistingDetalles,
      removedPendingDetalles,
      newCuotas: cuotasEnviadas.slice(activeExistingDetalles.length),
    };
  }

  private async updateDetallesPreservingAppliedPayments(
    manager: EntityManager,
    existingDetalles: DetalleTransaccion[],
    titularParticipanteId: number,
    resolvedInput: ResolvedTransaccionInput,
    estadoPendienteId: number,
    estadoPagadoId: number,
  ): Promise<DetalleTransaccion[]> {
    const existingByParticipante =
      this.buildDetalleMapByParticipante(existingDetalles);
    const submittedByParticipante = this.buildSubmittedCuotasMap(
      resolvedInput,
      titularParticipanteId,
    );
    const detallesActualizados: DetalleTransaccion[] = [];

    for (const [
      idParticipante,
      detallesParticipante,
    ] of existingByParticipante.entries()) {
      const cuotasEnviadas = submittedByParticipante.get(idParticipante) ?? [];
      const plan = this.buildDetalleUpdatePlan(
        detallesParticipante,
        cuotasEnviadas,
        idParticipante,
      );
      const totalCuotasActivas = cuotasEnviadas.length;

      for (const [index, detalle] of plan.activeExistingDetalles.entries()) {
        const cuotaEnviada = cuotasEnviadas[index];

        if (!cuotaEnviada) {
          throw new BadRequestException(
            `No se encontro la cuota esperada para actualizar el participante ${idParticipante}`,
          );
        }

        if (this.hasAppliedPaymentOnDetalle(detalle)) {
          detalle.monto = this.toNumericString(cuotaEnviada.monto);
          detalle.fecha_programada = cuotaEnviada.fecha_programada;
          detalle.fecha_inicio_interes = this.resolveFechaInicioInteresRestante(
            detalle.fecha_ultimo_calculo,
            resolvedInput.fecha_inicio_interes,
            cuotaEnviada.fecha_programada,
            resolvedInput.cuotas_sin_intereses,
          );
          detalle.numero_cuota = index + 1;
          detalle.total_cuotas = totalCuotasActivas;
          detallesActualizados.push(
            await manager.save(DetalleTransaccion, detalle),
          );
          continue;
        }

        detalle.monto = this.toNumericString(cuotaEnviada.monto);
        detalle.fecha_programada = cuotaEnviada.fecha_programada;
        detalle.fecha_inicio_interes = this.resolveFechaInicioInteresRestante(
          detalle.fecha_ultimo_calculo,
          resolvedInput.fecha_inicio_interes,
          cuotaEnviada.fecha_programada,
          resolvedInput.cuotas_sin_intereses,
        );
        detalle.numero_cuota = index + 1;
        detalle.total_cuotas = totalCuotasActivas;
        this.applyIngresoPagadoDefaultsToDetalleIfNeeded(
          detalle,
          resolvedInput,
          estadoPagadoId,
        );
        detallesActualizados.push(
          await manager.save(DetalleTransaccion, detalle),
        );
      }

      for (const detalle of plan.removedPendingDetalles) {
        detalle.id_estado = ESTADO_TRANSACCION_ANULADA_ID;
        detalle.monto = this.toNumericString(0);
        detalle.monto_pagado = this.toNumericString(0);
        detalle.interes_acumulado = this.toNumericString(0);
        detalle.interes_pagado = this.toNumericString(0);
        detalle.interes_pendiente = this.toNumericString(0);
        detalle.dias_interes = 0;
        detalle.fecha_pago = null;
        detalle.fecha_ultimo_calculo = null;
        detallesActualizados.push(
          await manager.save(DetalleTransaccion, detalle),
        );
      }

      for (let index = 0; index < plan.newCuotas.length; index += 1) {
        const cuotaEnviada = plan.newCuotas[index];
        const detalleBase = plan.activeExistingDetalles[0];

        if (!cuotaEnviada || !detalleBase) {
          continue;
        }

        const nuevoDetalle = manager.create(DetalleTransaccion, {
          id_usuario: detalleBase.id_usuario,
          id_transaccion: detalleBase.id_transaccion,
          fecha_pago: null,
          fecha_programada: cuotaEnviada.fecha_programada,
          fecha_inicio_interes: this.resolveFechaInicioInteresRestante(
            detalleBase.fecha_ultimo_calculo,
            detalleBase.fecha_inicio_interes ??
              resolvedInput.fecha_inicio_interes,
            cuotaEnviada.fecha_programada,
            resolvedInput.cuotas_sin_intereses,
          ),
          interes_acumulado: this.toNumericString(0),
          interes_pagado: this.toNumericString(0),
          interes_pendiente: this.toNumericString(0),
          fecha_ultimo_calculo: null,
          dias_interes: 0,
          id_participante: detalleBase.id_participante,
          id_usuario_relacionado: detalleBase.id_usuario_relacionado,
          monto: this.toNumericString(cuotaEnviada.monto),
          monto_pagado: this.toNumericString(0),
          numero_cuota: plan.activeExistingDetalles.length + index + 1,
          total_cuotas: totalCuotasActivas,
          id_tipo_transaccion: detalleBase.id_tipo_transaccion,
          id_metodo_pago: resolvedInput.id_metodo_pago,
          id_estado: estadoPendienteId,
        });
        this.applyIngresoPagadoDefaultsToDetalleIfNeeded(
          nuevoDetalle,
          resolvedInput,
          estadoPagadoId,
        );

        detallesActualizados.push(
          await manager.save(DetalleTransaccion, nuevoDetalle),
        );
      }
    }

    return detallesActualizados.sort((left, right) => {
      if (left.id_participante !== right.id_participante) {
        return left.id_participante - right.id_participante;
      }

      if ((left.numero_cuota ?? 1) !== (right.numero_cuota ?? 1)) {
        return (left.numero_cuota ?? 1) - (right.numero_cuota ?? 1);
      }

      return left.id - right.id;
    });
  }

  private getMontoPagadoTotalCentavos(
    detalle: Pick<DetalleTransaccion, "monto_pagado" | "interes_pagado">,
  ): number {
    return (
      this.toCents(Number(detalle.monto_pagado ?? 0)) +
      this.toCents(Number(detalle.interes_pagado ?? 0))
    );
  }

  private getInteresPendienteCentavos(
    detalle: Partial<
      Pick<DetalleTransaccion, "id_estado" | "interes_pendiente">
    >,
  ): number {
    if (!this.shouldApplyPendingInteres(detalle.id_estado ?? null)) {
      return 0;
    }

    return Math.max(0, this.toCents(Number(detalle.interes_pendiente ?? 0)));
  }

  private usaFechaProgramadaComoInicioInteres(
    detalle: Pick<
      DetalleTransaccion,
      "fecha_inicio_interes" | "fecha_programada"
    >,
  ): boolean {
    const fechaInicioInteres = this.normalizeOptionalIsoDate(
      detalle.fecha_inicio_interes,
    );
    const fechaProgramada = this.normalizeOptionalIsoDate(
      detalle.fecha_programada,
    );

    return fechaProgramada !== null && fechaInicioInteres === fechaProgramada;
  }

  private shouldApplyPendingInteres(idEstado: number | null): boolean {
    return (
      idEstado === ESTADO_TRANSACCION_PENDIENTE_ID ||
      idEstado === ESTADO_TRANSACCION_PAGO_PARCIAL_ID
    );
  }

  private shouldApplyPendingPrincipal(idEstado: number | null): boolean {
    return (
      idEstado === null ||
      idEstado === ESTADO_TRANSACCION_PENDIENTE_ID ||
      idEstado === ESTADO_TRANSACCION_PAGO_PARCIAL_ID
    );
  }

  private getMontoDistribuidoCentavos(
    detalle: Pick<DetalleTransaccion, "monto" | "monto_pagado"> &
      Partial<Pick<DetalleTransaccion, "id_estado" | "interes_pendiente">>,
  ): number {
    const montoCentavos = this.toCents(Number(detalle.monto));
    const montoPagadoCentavos = this.toCents(Number(detalle.monto_pagado ?? 0));

    if (
      !this.shouldApplyPendingPrincipal(detalle.id_estado ?? null) &&
      montoPagadoCentavos > 0 &&
      montoPagadoCentavos < montoCentavos &&
      this.getInteresPendienteCentavos(detalle) === 0
    ) {
      return montoPagadoCentavos;
    }

    return montoCentavos;
  }

  private getSaldoPendienteCentavos(
    detalle: Pick<DetalleTransaccion, "monto" | "monto_pagado"> &
      Partial<Pick<DetalleTransaccion, "id_estado" | "interes_pendiente">>,
  ): number {
    if (!this.shouldApplyPendingPrincipal(detalle.id_estado ?? null)) {
      return 0;
    }

    const principalPendienteCentavos = Math.max(
      0,
      this.toCents(Number(detalle.monto)) -
        this.toCents(Number(detalle.monto_pagado ?? 0)),
    );

    return (
      principalPendienteCentavos + this.getInteresPendienteCentavos(detalle)
    );
  }

  private calculateTransaccionSaldoPendiente(
    detalles: Pick<DetalleTransaccion, "monto" | "monto_pagado">[],
  ): number {
    const saldoDetallesCentavos = detalles.reduce(
      (sum, detalle) => sum + this.getSaldoPendienteCentavos(detalle),
      0,
    );

    return this.centsToAmount(saldoDetallesCentavos);
  }

  private toNumericString(value: number): string {
    return value.toFixed(2);
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToAmount(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private addDaysToIsoDate(value: string, days: number): string {
    const [year, month, day] = value.split("-").map(Number);
    const result = new Date(year, month - 1, day);
    result.setDate(result.getDate() + Math.max(0, days));

    const resultYear = result.getFullYear();
    const resultMonth = String(result.getMonth() + 1).padStart(2, "0");
    const resultDay = String(result.getDate()).padStart(2, "0");

    return `${resultYear}-${resultMonth}-${resultDay}`;
  }

  private uniqueNumbers(values: number[]): number[] {
    return Array.from(
      new Set(values.filter((value) => Number.isInteger(value))),
    );
  }

  private todayAsIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private todayAsLocalIsoDate(): string {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
}





