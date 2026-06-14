import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'participantes' })
export class Participante {
  @PrimaryGeneratedColumn({ name: 'id_participante' })
  id_participante!: number;

  @Column({ name: 'nombre_participante', type: 'varchar', length: 150 })
  nombre_participante!: string;

  @Column({ name: 'correo_electronico', type: 'varchar', length: 255, nullable: true })
  correo_electronico!: string | null;

  @Column({ name: 'celular', type: 'varchar', length: 25, nullable: true })
  celular!: string | null;

  @Column({
    name: 'porcentaje_participacion',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  porcentaje_participacion!: string | null;

  @Column({ name: 'estado', type: 'varchar', length: 10, default: 'ACTIVO', nullable: true })
  estado!: string | null;

  @Column({ name: 'id_usuario', type: 'int', default: 1 })
  id_usuario!: number;

  @Column({ name: 'id_usuario_titular', type: 'int', nullable: true })
  id_usuario_titular!: number | null;

  @Column({ name: 'id_usuario_relacionado', type: 'int', nullable: true })
  id_usuario_relacionado!: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
