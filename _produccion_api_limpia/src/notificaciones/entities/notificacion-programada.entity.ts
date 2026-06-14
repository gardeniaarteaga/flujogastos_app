import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Periodicidad } from './periodicidad.entity';

@Entity({ name: 'notificaciones_programadas' })
export class NotificacionProgramada {
  @PrimaryGeneratedColumn({ name: 'id_notificacion_programada' })
  id_notificacion_programada!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  id_usuario!: number;

  @Column({ name: 'descripcion', type: 'varchar', length: 160 })
  descripcion!: string;

  @Column({ name: 'prioridad', type: 'varchar', length: 20, default: 'media' })
  prioridad!: 'alta' | 'media' | 'baja';

  @Column({ name: 'fecha_inicio', type: 'date' })
  fecha_inicio!: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fecha_fin!: string;

  @Column({ name: 'dia_pago_programado', type: 'int' })
  dia_pago_programado!: number;

  @Column({ name: 'id_periodicidad', type: 'int' })
  id_periodicidad!: number;

  @ManyToOne(() => Periodicidad, { eager: false })
  @JoinColumn({ name: 'id_periodicidad' })
  periodicidad?: Periodicidad;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamp' })
  fecha_actualizacion!: Date;
}
