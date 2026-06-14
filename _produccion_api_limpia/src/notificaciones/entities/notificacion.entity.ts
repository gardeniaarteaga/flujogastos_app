import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notificaciones' })
export class Notificacion {
  @PrimaryGeneratedColumn({ name: 'id_notificacion' })
  id_notificacion!: number;

  @Column({ name: 'id_usuario_destino', type: 'int' })
  id_usuario_destino!: number;

  @Column({ name: 'id_usuario_origen', type: 'int', nullable: true })
  id_usuario_origen!: number | null;

  @Column({ name: 'id_transaccion', type: 'int', nullable: true })
  id_transaccion!: number | null;

  @Column({ name: 'tipo', type: 'varchar', length: 50 })
  tipo!: string;

  @Column({ name: 'titulo', type: 'varchar', length: 160 })
  titulo!: string;

  @Column({ name: 'mensaje', type: 'varchar', length: 500 })
  mensaje!: string;

  @Column({ name: 'leida', type: 'boolean', default: false })
  leida!: boolean;

  @Column({ name: 'fecha_leida', type: 'timestamp', nullable: true })
  fecha_leida!: Date | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
