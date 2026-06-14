import { CreateDateColumn, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoEntidad } from '../../tipo-entidad/entities/tipo-entidad.entity';

@Entity({ name: 'entidades_financieras' })
export class EntidadFinanciera {
  @PrimaryGeneratedColumn({ name: 'id_entidad' })
  id_entidad!: number;

  @Column({ name: 'nombre_entidad', type: 'varchar', length: 100 })
  nombre_entidad!: string;

  @Column({ name: 'tipo_entidad', type: 'int', nullable: true })
  tipo_entidad!: number | null;

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  id_usuario!: number | null;

  @Column({ name: 'pais', type: 'varchar', length: 100, nullable: true })
  pais!: string | null;

  @Column({ name: 'sitio_web', type: 'varchar', length: 200, nullable: true })
  sitio_web!: string | null;

  @Column({ name: 'telefono_contacto', type: 'varchar', length: 50, nullable: true })
  telefono_contacto!: string | null;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;

  @ManyToOne(() => TipoEntidad, { eager: true, nullable: true })
  @JoinColumn({ name: 'tipo_entidad', referencedColumnName: 'id_tipo_entidad' })
  tipoEntidad!: TipoEntidad | null;
}
