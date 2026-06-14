import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'transacciones' })
export class Transaccion {
  @PrimaryGeneratedColumn({ name: 'id_transaccion' })
  id_transaccion!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  id_usuario!: number;

  @Column({ name: 'fecha', type: 'date' })
  fecha!: string;

  @Column({ name: 'monto', type: 'numeric', precision: 12, scale: 2 })
  monto!: string;

  @Column({ name: 'id_tipo_transaccion', type: 'int' })
  id_tipo_transaccion!: number;

  @Column({ name: 'id_metodo_pago', type: 'int' })
  id_metodo_pago!: number;

  @Column({ name: 'id_categoria', type: 'int' })
  id_categoria!: number;

  @Column({ name: 'id_subcategoria', type: 'int', nullable: true })
  id_subcategoria!: number | null;

  @Column({ name: 'id_estado', type: 'int' })
  id_estado!: number;

  @Column({ name: 'id_estado_registro', type: 'int', nullable: true })
  id_estado_registro!: number | null;

  @Column({ name: 'descripcion', type: 'varchar', length: 250, nullable: true })
  descripcion!: string | null;

  @Column({
    name: 'intereses',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  intereses!: string;

  @Column({
    name: 'saldo_pendiente',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  saldo_pendiente!: string;

  @Column({ name: 'cuotas_sin_intereses', type: 'boolean', default: false })
  cuotas_sin_intereses!: boolean;

  @Column({ name: 'fecha_ultimo_pago', type: 'timestamp', nullable: true })
  fecha_ultimo_pago!: Date | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;

  @Column({ name: 'pagocompartido', type: 'boolean' })
  pagocompartido!: boolean;
}
