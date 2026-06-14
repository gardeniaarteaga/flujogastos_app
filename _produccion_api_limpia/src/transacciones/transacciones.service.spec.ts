import { TransaccionesService } from "./transacciones.service";
import { DetalleTransaccion } from "./entities/detalle-transaccion.entity";
import { Transaccion } from "./entities/transaccion.entity";
import { EntityManager } from "typeorm";

type RepositoryMock<T = unknown> = {
  find: jest.Mock<Promise<T[]>, [unknown?]>;
  findOne: jest.Mock<Promise<T | null>, [unknown?]>;
};

const createRepositoryMock = <T = unknown>(): RepositoryMock<T> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe("TransaccionesService", () => {
  it("crea las cuotas compartidas pendientes y solo marca pagada la cuota unica 1/1 del titular", async () => {
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;
    const manager = {
      create: jest.fn((_entity, value) => value),
      find: jest.fn().mockResolvedValue([
        { id_participante: 30, id_usuario_relacionado: 99 },
      ]),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    } as unknown as EntityManager;
    const resolvedInput = {
      fecha: "2026-05-23",
      calcula_interes: false,
      cuotas_sin_intereses: false,
      titular_cuota_unica_pagada: true,
      fecha_inicio_interes: null,
      monto: 100,
      intereses: 0,
      id_tipo_transaccion: 1,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 4,
      descripcion: "Compartido",
      pagocompartido: true,
      cantidad_cuotas_titular: 1,
      cuotas_titular: [{ monto: 40, fecha_programada: "2026-05-23" }],
      participantes_detalle: [
        {
          id_participante: 30,
          monto: 60,
          cantidad_cuotas: 1,
          cuotas: [{ monto: 60, fecha_programada: "2026-05-24" }],
        },
      ],
    };

    const detalles = await serviceInternals.saveDetallesTransaccion(
      manager,
      1,
      1,
      20,
      resolvedInput,
      3,
      5,
    );

    expect(detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id_participante: 20,
          numero_cuota: 1,
          total_cuotas: 1,
          id_estado: 5,
          monto_pagado: "40.00",
          fecha_pago: "2026-05-23",
        }),
        expect.objectContaining({
          id_participante: 30,
          numero_cuota: 1,
          total_cuotas: 1,
          id_estado: 3,
          monto_pagado: "0.00",
          fecha_pago: null,
        }),
      ]),
    );
  });

  it("al crear un ingreso pagado marca todas las cuotas con fecha actual y monto pagado completo", async () => {
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;
    jest
      .spyOn(serviceInternals, "todayAsLocalIsoDate")
      .mockReturnValue("2026-05-31");
    const manager = {
      create: jest.fn((_entity, value) => value),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    } as unknown as EntityManager;
    const resolvedInput = {
      fecha: "2026-05-20",
      calcula_interes: false,
      cuotas_sin_intereses: false,
      titular_cuota_unica_pagada: false,
      fecha_inicio_interes: null,
      monto: 100,
      intereses: 0,
      id_tipo_transaccion: 2,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 5,
      descripcion: "Ingreso pagado",
      pagocompartido: false,
      cantidad_cuotas_titular: 2,
      cuotas_titular: [
        { monto: 50, fecha_programada: "2026-06-10" },
        { monto: 50, fecha_programada: "2026-06-25" },
      ],
      participantes_detalle: [],
    };

    const detalles = await serviceInternals.saveDetallesTransaccion(
      manager,
      1,
      1,
      20,
      resolvedInput,
      3,
      5,
    );

    expect(detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          numero_cuota: 1,
          total_cuotas: 2,
          id_estado: 5,
          fecha_programada: "2026-05-31",
          fecha_pago: "2026-05-31",
          monto_pagado: "50.00",
        }),
        expect.objectContaining({
          numero_cuota: 2,
          total_cuotas: 2,
          id_estado: 5,
          fecha_programada: "2026-05-31",
          fecha_pago: "2026-05-31",
          monto_pagado: "50.00",
        }),
      ]),
    );
  });

  it("al actualizar un ingreso pagado completa fecha_pago actual en cuotas pendientes o nuevas", async () => {
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;
    jest
      .spyOn(serviceInternals, "todayAsLocalIsoDate")
      .mockReturnValue("2026-05-31");
    const manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    } as unknown as EntityManager;
    const existingDetalles = [
      {
        id: 100,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-06-10",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "40.00",
        monto_pagado: "0.00",
        numero_cuota: 1,
        total_cuotas: 1,
        id_tipo_transaccion: 2,
        id_metodo_pago: 10,
        id_estado: 3,
        fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      } as DetalleTransaccion,
    ];
    const resolvedInput = {
      fecha: "2026-05-20",
      calcula_interes: false,
      cuotas_sin_intereses: false,
      titular_cuota_unica_pagada: false,
      fecha_inicio_interes: null,
      monto: 100,
      intereses: 0,
      id_tipo_transaccion: 2,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 5,
      descripcion: "Ingreso pagado editado",
      pagocompartido: false,
      cantidad_cuotas_titular: 2,
      cuotas_titular: [
        { monto: 40, fecha_programada: "2026-06-10" },
        { monto: 60, fecha_programada: "2026-06-25" },
      ],
      participantes_detalle: [],
    };

    const detalles = await serviceInternals.updateDetallesPreservingAppliedPayments(
      manager,
      existingDetalles,
      20,
      resolvedInput,
      3,
      5,
    );

    expect(detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          numero_cuota: 1,
          total_cuotas: 2,
          id_estado: 5,
          fecha_programada: "2026-05-31",
          fecha_pago: "2026-05-31",
          monto_pagado: "40.00",
        }),
        expect.objectContaining({
          numero_cuota: 2,
          total_cuotas: 2,
          id_estado: 5,
          fecha_programada: "2026-05-31",
          fecha_pago: "2026-05-31",
          monto_pagado: "60.00",
        }),
      ]),
    );
  });

  it("aplica el cambio masivo de estado sobre todas las cuotas", async () => {
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;
    jest
      .spyOn(serviceInternals, "todayAsLocalIsoDate")
      .mockReturnValue("2026-06-03");
    const manager = {
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    } as unknown as EntityManager;
    const baseDetalle = {
      id: 100,
      id_usuario: 1,
      id_transaccion: 1,
      fecha_pago: "2026-05-31",
      fecha_programada: "2026-06-10",
      fecha_inicio_interes: null,
      interes_acumulado: "4.00",
      interes_pagado: "1.00",
      interes_pendiente: "3.00",
      fecha_ultimo_calculo: "2026-05-31",
      dias_interes: 5,
      id_participante: 20,
      id_usuario_relacionado: null,
      monto: "40.00",
      monto_pagado: "15.00",
      numero_cuota: 1,
      total_cuotas: 1,
      id_tipo_transaccion: 1,
      id_metodo_pago: 10,
      id_estado: 4,
      fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
    } as DetalleTransaccion;

    const pagados = await serviceInternals.applyManagedEstadoChangeToDetalles(
      manager,
      [{ ...baseDetalle }],
      5,
      3,
      5,
    );
    expect(pagados[0]).toEqual(
      expect.objectContaining({
        id_estado: 5,
        fecha_pago: "2026-06-03",
        monto_pagado: "40.00",
        interes_pagado: "4.00",
        interes_pendiente: "0.00",
      }),
    );

    const pendientes = await serviceInternals.applyManagedEstadoChangeToDetalles(
      manager,
      [{ ...baseDetalle }],
      3,
      3,
      5,
    );
    expect(pendientes[0]).toEqual(
      expect.objectContaining({
        id_estado: 3,
        fecha_pago: null,
        monto_pagado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
      }),
    );

    const anulados = await serviceInternals.applyManagedEstadoChangeToDetalles(
      manager,
      [{ ...baseDetalle }],
      2,
      3,
      5,
    );
    expect(anulados[0]).toEqual(
      expect.objectContaining({
        id_estado: 2,
        fecha_pago: null,
        monto_pagado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
      }),
    );
  });

  it("muestra el estado guardado de la transaccion aunque las cuotas vencidas sigan pendientes", async () => {
    const transaccionesRepository = createRepositoryMock<Transaccion>();
    const detalleRepository = createRepositoryMock<DetalleTransaccion>();
    const formasPagoRepository = createRepositoryMock();
    const categoriasRepository = createRepositoryMock();
    const subcategoriasRepository = createRepositoryMock();
    const participantesRepository = createRepositoryMock();
    const estadosRepository = createRepositoryMock();
    const tiposTransaccionRepository = createRepositoryMock();
    const usuariosRepository = createRepositoryMock();

    formasPagoRepository.find.mockResolvedValue([
      { id_metodo: 10, nombre_metodo: "Tarjeta", calcula_interes: false },
    ]);
    categoriasRepository.find.mockResolvedValue([
      { id_categoria: 5, nombre_categoria: "Servicios" },
    ]);
    tiposTransaccionRepository.find.mockResolvedValue([
      { id_tipo: 2, nombre: "Ingreso" },
    ]);
    participantesRepository.find.mockResolvedValue([
      {
        id_participante: 20,
        nombre_participante: "Titular",
      },
    ]);
    estadosRepository.find.mockResolvedValue([
      {
        id_estado: 3,
        nombre_estado: "PENDIENTE",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 4,
        nombre_estado: "PAGO PARCIAL",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 5,
        nombre_estado: "PAGADO",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 6,
        nombre_estado: "PENDIENTE",
        estado: "ACTIVO",
        flag: "R",
      },
      {
        id_estado: 8,
        nombre_estado: "COMPLETADO",
        estado: "ACTIVO",
        flag: "R",
      },
    ]);

    const service = new TransaccionesService(
      {} as never,
      transaccionesRepository as never,
      detalleRepository as never,
      formasPagoRepository as never,
      categoriasRepository as never,
      subcategoriasRepository as never,
      participantesRepository as never,
      estadosRepository as never,
      tiposTransaccionRepository as never,
      usuariosRepository as never,
      {} as never,
    );

    const transaccion = {
      id_transaccion: 1,
      id_usuario: 1,
      fecha: "2026-05-01",
      monto: "100.00",
      id_tipo_transaccion: 2,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 3,
      id_estado_registro: 6,
      descripcion: "Ingreso editado",
      intereses: "0.00",
      saldo_pendiente: "100.00",
      cuotas_sin_intereses: false,
      fecha_ultimo_pago: null,
      fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      pagocompartido: false,
    } as Transaccion;

    const detalles = [
      {
        id: 100,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-05-02",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "50.00",
        monto_pagado: "0.00",
        numero_cuota: 1,
        total_cuotas: 2,
        id_tipo_transaccion: 2,
        id_metodo_pago: 10,
        id_estado: 3,
        fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      } as DetalleTransaccion,
      {
        id: 101,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-05-03",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "50.00",
        monto_pagado: "0.00",
        numero_cuota: 2,
        total_cuotas: 2,
        id_tipo_transaccion: 2,
        id_metodo_pago: 10,
        id_estado: 3,
        fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      } as DetalleTransaccion,
    ];

    const [response] = await (
      service as unknown as {
        buildDetailedResponses: (
          transacciones: Transaccion[],
          idUsuario: number,
          detallesPrecargados?: DetalleTransaccion[],
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).buildDetailedResponses([transaccion], 1, detalles);

    expect(response.id_estado).toBe(3);
    expect(response.nombre_estado).toBe("PENDIENTE");
    expect(response.participantes_detalle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 100, id_estado: 3 }),
        expect.objectContaining({ id: 101, id_estado: 3 }),
      ]),
    );
  });

  it("respeta el id_estado enviado al editar y no lo reemplaza por la forma de pago", async () => {
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;
    const transaccionExistente = {
      id_transaccion: 5,
      id_usuario: 3,
      fecha: "2026-05-15",
      monto: "500.00",
      id_tipo_transaccion: 1,
      id_metodo_pago: 3,
      id_categoria: 10,
      id_subcategoria: 49,
      id_estado: 4,
      id_estado_registro: 5,
      descripcion: "GRACIELA",
      intereses: "0.00",
      saldo_pendiente: "500.00",
      cuotas_sin_intereses: false,
      fecha_ultimo_pago: null,
      fecha_creacion: new Date("2026-05-15T21:49:37.553Z"),
      pagocompartido: false,
    } as Transaccion;

    jest
      .spyOn(serviceInternals, "findVisibleTipoTransaccion")
      .mockResolvedValue({ id_tipo: 1 });
    jest.spyOn(serviceInternals, "findVisibleFormaPago").mockResolvedValue({
      id_metodo: 3,
      calcula_interes: false,
      tipo_producto: { pago_inmediato: false },
    });
    jest
      .spyOn(serviceInternals, "findVisibleCategoria")
      .mockResolvedValue({ id_categoria: 10 });
    jest
      .spyOn(serviceInternals, "validateRequiredSubcategoria")
      .mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, "findVisibleSubcategoria").mockResolvedValue({
      id_subcategoria: 49,
    });
    jest.spyOn(serviceInternals, "findEstado").mockResolvedValue({
      id_estado: 1,
    });
    const resolveEstadoDesdeFormaPagoSpy = jest
      .spyOn(serviceInternals, "resolveEstadoTransaccionDesdeFormaPago")
      .mockResolvedValue(4);

    const resolvedInput = await serviceInternals.resolveTransaccionInput(
      { id_estado: 1 },
      3,
      transaccionExistente,
    );

    expect(resolvedInput.id_estado).toBe(1);
    expect(resolveEstadoDesdeFormaPagoSpy).not.toHaveBeenCalled();
  });

  it("mantiene el encabezado y el registro como anulados aunque existan cuotas con saldo pendiente", async () => {
    const transaccionesRepository = createRepositoryMock<Transaccion>();
    const detalleRepository = createRepositoryMock<DetalleTransaccion>();
    const formasPagoRepository = createRepositoryMock();
    const categoriasRepository = createRepositoryMock();
    const subcategoriasRepository = createRepositoryMock();
    const participantesRepository = createRepositoryMock();
    const estadosRepository = createRepositoryMock();
    const tiposTransaccionRepository = createRepositoryMock();
    const usuariosRepository = createRepositoryMock();

    formasPagoRepository.find.mockResolvedValue([
      { id_metodo: 10, nombre_metodo: "Tarjeta", calcula_interes: false },
    ]);
    categoriasRepository.find.mockResolvedValue([
      { id_categoria: 5, nombre_categoria: "Servicios" },
    ]);
    tiposTransaccionRepository.find.mockResolvedValue([
      { id_tipo: 1, nombre: "Gasto" },
    ]);
    participantesRepository.find.mockResolvedValue([
      {
        id_participante: 20,
        nombre_participante: "Titular",
      },
    ]);
    estadosRepository.find.mockResolvedValue([
      {
        id_estado: 2,
        nombre_estado: "ANULADO",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 3,
        nombre_estado: "PENDIENTE",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 4,
        nombre_estado: "PAGO PARCIAL",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 5,
        nombre_estado: "PAGADO",
        estado: "ACTIVO",
        flag: "T",
      },
      {
        id_estado: 7,
        nombre_estado: "ANULADO",
        estado: "ACTIVO",
        flag: "R",
      },
    ]);

    const service = new TransaccionesService(
      {} as never,
      transaccionesRepository as never,
      detalleRepository as never,
      formasPagoRepository as never,
      categoriasRepository as never,
      subcategoriasRepository as never,
      participantesRepository as never,
      estadosRepository as never,
      tiposTransaccionRepository as never,
      usuariosRepository as never,
      {} as never,
    );

    const transaccion = {
      id_transaccion: 1,
      id_usuario: 1,
      fecha: "2026-05-15",
      monto: "100.00",
      id_tipo_transaccion: 1,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 2,
      id_estado_registro: 7,
      descripcion: "Pago anulado",
      intereses: "0.00",
      saldo_pendiente: "100.00",
      cuotas_sin_intereses: false,
      fecha_ultimo_pago: null,
      fecha_creacion: new Date("2026-05-15T10:00:00.000Z"),
      pagocompartido: false,
    } as Transaccion;

    const detalles = [
      {
        id: 100,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-05-20",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "100.00",
        monto_pagado: "0.00",
        numero_cuota: 1,
        total_cuotas: 1,
        id_tipo_transaccion: 1,
        id_metodo_pago: 10,
        id_estado: 2,
        fecha_creacion: new Date("2026-05-15T10:00:00.000Z"),
      } as DetalleTransaccion,
    ];

    const [response] = await (
      service as unknown as {
        buildDetailedResponses: (
          transacciones: Transaccion[],
          idUsuario: number,
          detallesPrecargados?: DetalleTransaccion[],
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).buildDetailedResponses([transaccion], 1, detalles);

    expect(response.id_estado).toBe(2);
    expect(response.nombre_estado).toBe("ANULADO");
    expect(response.id_estado_registro).toBe(7);
    expect(response.nombre_estado_registro).toBe("ANULADO");
    expect(response.saldo_pendiente).toBe(0);
    expect(response.participantes_detalle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 100,
          id_estado: 2,
          nombre_estado: "ANULADO",
          saldo_pendiente: 0,
        }),
      ]),
    );
  });

  it("conserva el estado editado en la transaccion al actualizar varias cuotas sin pagos aplicados", async () => {
    const manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (managerArg: typeof manager) => Promise<void>) =>
        callback(manager),
      ),
    };
    const transaccionesRepository = createRepositoryMock<Transaccion>();
    const detalleRepository = createRepositoryMock<DetalleTransaccion>();
    const formasPagoRepository = createRepositoryMock();
    const categoriasRepository = createRepositoryMock();
    const subcategoriasRepository = createRepositoryMock();
    const participantesRepository = createRepositoryMock();
    const estadosRepository = createRepositoryMock();
    const tiposTransaccionRepository = createRepositoryMock();
    const usuariosRepository = createRepositoryMock();
    const notificacionesService = {
      syncPagoAsignadoNotificationsSafely: jest.fn().mockResolvedValue(undefined),
    };

    const service = new TransaccionesService(
      dataSource as never,
      transaccionesRepository as never,
      detalleRepository as never,
      formasPagoRepository as never,
      categoriasRepository as never,
      subcategoriasRepository as never,
      participantesRepository as never,
      estadosRepository as never,
      tiposTransaccionRepository as never,
      usuariosRepository as never,
      notificacionesService as never,
    );
    const serviceInternals = service as unknown as {
      findOwnedTransaccion: jest.Mock;
      resolveTransaccionInput: jest.Mock;
      findEstadoByFlagAndName: jest.Mock;
      saveDetallesTransaccion: jest.Mock;
      findOneDetailed: jest.Mock;
    };

    const transaccion = {
      id_transaccion: 1,
      id_usuario: 1,
      fecha: "2026-05-01",
      monto: "100.00",
      id_tipo_transaccion: 2,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 4,
      id_estado_registro: 6,
      descripcion: "Ingreso editado",
      intereses: "0.00",
      saldo_pendiente: "100.00",
      cuotas_sin_intereses: false,
      fecha_ultimo_pago: null,
      fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      pagocompartido: false,
    } as Transaccion;
    const detallesExistentes = [
      {
        id: 100,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-05-02",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "50.00",
        monto_pagado: "0.00",
        numero_cuota: 1,
        total_cuotas: 2,
        id_tipo_transaccion: 2,
        id_metodo_pago: 10,
        id_estado: 4,
        fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      } as DetalleTransaccion,
      {
        id: 101,
        id_usuario: 1,
        id_transaccion: 1,
        fecha_pago: null,
        fecha_programada: "2026-05-03",
        fecha_inicio_interes: null,
        interes_acumulado: "0.00",
        interes_pagado: "0.00",
        interes_pendiente: "0.00",
        fecha_ultimo_calculo: null,
        dias_interes: 0,
        id_participante: 20,
        id_usuario_relacionado: null,
        monto: "50.00",
        monto_pagado: "0.00",
        numero_cuota: 2,
        total_cuotas: 2,
        id_tipo_transaccion: 2,
        id_metodo_pago: 10,
        id_estado: 4,
        fecha_creacion: new Date("2026-05-01T10:00:00.000Z"),
      } as DetalleTransaccion,
    ];
    const detallesEditados = detallesExistentes.map((detalle) => ({
      ...detalle,
      id_estado: 3,
    })) as DetalleTransaccion[];
    const resolvedInput = {
      fecha: "2026-05-01",
      calcula_interes: false,
      cuotas_sin_intereses: false,
      fecha_inicio_interes: null,
      monto: 100,
      intereses: 0,
      id_tipo_transaccion: 2,
      id_metodo_pago: 10,
      id_categoria: 5,
      id_subcategoria: null,
      id_estado: 3,
      descripcion: "Ingreso editado",
      pagocompartido: false,
      cantidad_cuotas_titular: 2,
      cuotas_titular: [
        { monto: 50, fecha_programada: "2026-05-02" },
        { monto: 50, fecha_programada: "2026-05-03" },
      ],
      participantes_detalle: [],
    };

    jest.spyOn(service as any, "findOwnedTransaccion").mockResolvedValue({
      transaccion,
      detalles: detallesExistentes,
      titularParticipante: { id_participante: 20 },
    });
    jest
      .spyOn(service as any, "resolveTransaccionInput")
      .mockResolvedValue(resolvedInput);
    jest
      .spyOn(service as any, "findEstadoByFlagAndName")
      .mockImplementation(async (...args: unknown[]) => {
        const [flag, nombre] = args as [string, string];
        const estados = new Map([
          ["T:PENDIENTE", { id_estado: 3 }],
          ["T:PAGO PARCIAL", { id_estado: 4 }],
          ["T:PAGADO", { id_estado: 5 }],
          ["R:PENDIENTE", { id_estado: 6 }],
          ["R:COMPLETADO", { id_estado: 8 }],
        ]);
        return estados.get(`${flag}:${nombre}`) as { id_estado: number };
      });
    jest
      .spyOn(service as any, "saveDetallesTransaccion")
      .mockResolvedValue(detallesEditados);
    jest
      .spyOn(service as any, "findOneDetailed")
      .mockResolvedValue({
        id_transaccion: 1,
        id_estado: 3,
        participantes_detalle: detallesEditados,
      });

    await service.update(1, { id_estado: 3 } as never, 1);

    const transaccionGuardadaFinal = manager.save.mock.calls
      .filter(([entity]) => entity === Transaccion)
      .at(-1)?.[1] as Transaccion;

    expect(transaccionGuardadaFinal.id_estado).toBe(3);
    expect(manager.delete).toHaveBeenCalledWith(DetalleTransaccion, {
      id_transaccion: 1,
      id_usuario: 1,
    });
    expect(serviceInternals.saveDetallesTransaccion).toHaveBeenCalled();
    expect(detallesEditados.map((detalle) => detalle.id_estado)).toEqual([3, 3]);
  });

  it("aplica pagos masivos agrupando cuotas por transaccion con el saldo pendiente actual", async () => {
    const detalleRepository = createRepositoryMock<DetalleTransaccion>();
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      detalleRepository as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;

    detalleRepository.find.mockResolvedValue([
      {
        id: 11,
        id_transaccion: 1,
      },
      {
        id: 12,
        id_transaccion: 1,
      },
      {
        id: 21,
        id_transaccion: 2,
      },
    ] as DetalleTransaccion[]);

    jest
      .spyOn(serviceInternals, "findAccessibleTransaccion")
      .mockImplementation(async (...args: unknown[]) => {
        const [idTransaccion] = args as [number];

        return {
          transaccion: { id_transaccion: idTransaccion },
          detalles:
            idTransaccion === 1
              ? [
                  {
                    id: 11,
                    monto: "40.00",
                    monto_pagado: "10.00",
                    interes_pendiente: "0.00",
                    id_estado: 3,
                    id_usuario_relacionado: 9,
                    id_tipo_transaccion: 2,
                  },
                  {
                    id: 12,
                    monto: "30.00",
                    monto_pagado: "0.00",
                    interes_pendiente: "5.00",
                    id_estado: 4,
                    id_usuario_relacionado: 9,
                    id_tipo_transaccion: 2,
                  },
                ]
              : [
                  {
                    id: 21,
                    monto: "25.00",
                    monto_pagado: "0.00",
                    interes_pendiente: "0.00",
                    id_estado: 3,
                    id_usuario_relacionado: 9,
                    id_tipo_transaccion: 2,
                  },
                ],
          detallesCompletos: [],
          isOwner: false,
        };
      });
    const applyPagosSpy = jest
      .spyOn(service, "applyPagos")
      .mockResolvedValue({} as never);

    const response = await service.applyPagosMasivos(
      { ids_detalle: [11, 12, 21] },
      9,
    );

    expect(applyPagosSpy).toHaveBeenNthCalledWith(
      1,
      1,
      {
        pagos: [
          { id_detalle: 11, monto: 30 },
          { id_detalle: 12, monto: 35 },
        ],
      },
      9,
    );
    expect(applyPagosSpy).toHaveBeenNthCalledWith(
      2,
      2,
      {
        pagos: [{ id_detalle: 21, monto: 25 }],
      },
      9,
    );
    expect(response).toEqual({
      transacciones_actualizadas: [1, 2],
      detalles_pagados: 3,
    });
  });

  it("rechaza pagos masivos sobre cuotas que no pertenecen al usuario logueado", async () => {
    const detalleRepository = createRepositoryMock<DetalleTransaccion>();
    const service = new TransaccionesService(
      {} as never,
      createRepositoryMock<Transaccion>() as never,
      detalleRepository as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      {} as never,
    );
    const serviceInternals = service as any;

    detalleRepository.find.mockResolvedValue([
      {
        id: 11,
        id_transaccion: 1,
      },
    ] as DetalleTransaccion[]);

    jest.spyOn(serviceInternals, "findAccessibleTransaccion").mockResolvedValue({
      transaccion: { id_transaccion: 1 },
      detalles: [],
      detallesCompletos: [],
      isOwner: false,
    });
    const applyPagosSpy = jest
      .spyOn(service, "applyPagos")
      .mockResolvedValue({} as never);

    await expect(
      service.applyPagosMasivos({ ids_detalle: [11] }, 9),
    ).rejects.toThrow(
      "No tienes permiso para aplicar pagos sobre la cuota 11",
    );
    expect(applyPagosSpy).not.toHaveBeenCalled();
  });

  it("crea notificacion de pago recibido cuando un participante paga una transaccion compartida ajena", async () => {
    const manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (managerArg: typeof manager) => Promise<void>) =>
          callback(manager),
      ),
    };
    const notificacionesService = {
      syncPagoAsignadoNotificationsSafely: jest.fn().mockResolvedValue(undefined),
      createCobroIngresadoNotificationsSafely: jest.fn().mockResolvedValue(undefined),
      createPagoRecibidoNotificationsSafely: jest.fn().mockResolvedValue(undefined),
    };

    const service = new TransaccionesService(
      dataSource as never,
      createRepositoryMock<Transaccion>() as never,
      createRepositoryMock<DetalleTransaccion>() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      createRepositoryMock() as never,
      notificacionesService as never,
    );
    const serviceInternals = service as any;

    jest.spyOn(serviceInternals, "findAccessibleTransaccion").mockResolvedValue({
      transaccion: {
        id_transaccion: 77,
        id_usuario: 1,
        fecha: "2026-06-10",
        descripcion: "Pago compartido de prueba",
        pagocompartido: true,
        id_tipo_transaccion: 1,
        saldo_pendiente: "25.00",
      },
      detalles: [
        {
          id: 501,
          id_participante: 30,
          id_usuario_relacionado: 9,
          monto: "25.00",
          monto_pagado: "0.00",
          interes_pagado: "0.00",
          interes_pendiente: "0.00",
          id_estado: 3,
          id_tipo_transaccion: 1,
          fecha_pago: null,
        },
      ],
      detallesCompletos: [
        {
          id: 501,
          id_participante: 30,
          id_usuario_relacionado: 9,
          monto: "25.00",
          monto_pagado: "0.00",
          interes_pagado: "0.00",
          interes_pendiente: "0.00",
          id_estado: 3,
          id_tipo_transaccion: 1,
          fecha_pago: null,
        },
      ],
      isOwner: false,
    });
    jest
      .spyOn(serviceInternals, "findEstadoByFlagAndName")
      .mockImplementation(async (...args: unknown[]) => {
        const [flag, nombre] = args as [string, string];
        const estados = new Map([
          ["T:PENDIENTE", { id_estado: 3 }],
          ["T:PAGO PARCIAL", { id_estado: 4 }],
          ["T:PAGADO", { id_estado: 5 }],
        ]);
        return estados.get(`${flag}:${nombre}`) as { id_estado: number };
      });
    jest
      .spyOn(serviceInternals, "findOneDetailed")
      .mockResolvedValue({ id_transaccion: 77 });
    jest
      .spyOn(serviceInternals, "todayAsLocalIsoDate")
      .mockReturnValue("2026-06-10");

    await service.applyPagos(
      77,
      {
        pagos: [{ id_detalle: 501, monto: 25 }],
      } as never,
      9,
    );

    expect(
      notificacionesService.createPagoRecibidoNotificationsSafely,
    ).toHaveBeenCalledWith({
      idUsuarioOrigen: 9,
      idUsuarioDestino: 1,
      idTransaccion: 77,
      descripcion: "Pago compartido de prueba",
      fecha: "2026-06-10",
      detalles: [
        {
          id_participante: 30,
          monto: 25,
        },
      ],
    });
  });
});
