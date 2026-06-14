import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'detalle_transacciones' })
export class DetalleTransaccion {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  id_usuario!: number;

  @Column({ name: 'id_transaccion', type: 'int' })
  id_transaccion!: number;

  @Column({ name: 'fecha_pago', type: 'date', nullable: true })
  fecha_pago!: string | null;

  @Column({ name: 'fecha_programada', type: 'date', nullable: true })
  fecha_programada!: string | null;

  @Column({ name: 'fecha_inicio_interes', type: 'date', nullable: true })
  fecha_inicio_interes!: string | null;

  @Column({
    name: 'interes_acumulado',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  interes_acumulado!: string;

  @Column({
    name: 'interes_pagado',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  interes_pagado!: string;

  @Column({
    name: 'interes_pendiente',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  interes_pendiente!: string;

  @Column({ name: 'fecha_ultimo_calculo', type: 'date', nullable: true })
  fecha_ultimo_calculo!: string | null;

  @Column({ name: 'dias_interes', type: 'int', default: () => '0' })
  dias_interes!: number;

  @Column({ name: 'id_participante', type: 'int' })
  id_participante!: number;

  @Column({ name: 'id_usuario_relacionado', type: 'int', nullable: true })
  id_usuario_relacionado!: number | null;

  @Column({ name: 'monto', type: 'numeric', precision: 12, scale: 2 })
  monto!: string;

  @Column({
    name: 'monto_pagado',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  monto_pagado!: string;

  @Column({ name: 'numero_cuota', type: 'int', default: () => '1' })
  numero_cuota!: number;

  @Column({ name: 'total_cuotas', type: 'int', default: () => '1' })
  total_cuotas!: number;

  @Column({ name: 'id_tipo_transaccion', type: 'int' })
  id_tipo_transaccion!: number;

  @Column({ name: 'id_metodo_pago', type: 'int' })
  id_metodo_pago!: number;

  @Column({ name: 'id_estado', type: 'int' })
  id_estado!: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
