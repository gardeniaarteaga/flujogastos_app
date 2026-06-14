import { CreateDateColumn, Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EntidadFinanciera } from '../../entidades-financieras/entities/entidad-financiera.entity';
import { TipoProducto } from '../../tipo-producto/entities/tipo-producto.entity';

@Entity({ name: 'metodos_pago' })
export class FormaPago {
  @PrimaryGeneratedColumn({ name: 'id_metodo' })
  id_metodo!: number;

  @Column({ name: 'nombre_metodo', type: 'varchar', length: 100 })
  nombre_metodo!: string;

  @Column({ name: 'id_entidad', type: 'int' })
  id_entidad!: number;

  @Column({ name: 'id_tipo_producto', type: 'int' })
  id_tipo_producto!: number;

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  id_usuario!: number | null;

  @Column({ name: 'tasa_anual', type: 'numeric', precision: 10, scale: 2, nullable: true })
  tasa_anual!: string | null;

  @Column({ name: 'calcula_interes', type: 'boolean', default: false, nullable: true })
  calcula_interes!: boolean | null;

  @Column({ name: 'recibe_estado_cuenta', type: 'boolean', default: false, nullable: true })
  recibe_estado_cuenta!: boolean | null;

  @Column({ name: 'aplica_membresia', type: 'boolean', default: false, nullable: true })
  aplica_membresia!: boolean | null;

  @Column({ name: 'mes_pago_membresia', type: 'int', nullable: true })
  mes_pago_membresia!: number | null;

  @Column({ name: 'dia_corte', type: 'int', nullable: true })
  dia_corte!: number | null;

  @Column({ name: 'dia_ultimo_pago', type: 'int', nullable: true })
  dia_ultimo_pago!: number | null;

  @Column({ name: 'dias_gracia', type: 'int', nullable: true })
  dias_gracia!: number | null;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;

  @ManyToOne(() => EntidadFinanciera, { eager: true })
  @JoinColumn({ name: 'id_entidad' })
  entidad_financiera!: EntidadFinanciera;

  @ManyToOne(() => TipoProducto, { eager: true })
  @JoinColumn({ name: 'id_tipo_producto' })
  tipo_producto!: TipoProducto;
}
