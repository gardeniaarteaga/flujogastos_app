import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'estados_transaccion' })
export class EstadoTransaccion {
  @PrimaryGeneratedColumn({ name: 'id_estado' })
  id_estado!: number;

  @Column({ name: 'nombre_estado', type: 'varchar', length: 100 })
  nombre_estado!: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  descripcion!: string | null;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: string;

  @Column({ name: 'flag', type: 'varchar', length: 20, nullable: true })
  flag!: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
