import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tipo_entidad' })
export class TipoEntidad {
  @PrimaryGeneratedColumn({ name: 'id_tipo_entidad' })
  id_tipo_entidad!: number;

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  id_usuario!: number | null;

  @Column({ name: 'descripcion', type: 'varchar', length: 100 })
  descripcion!: string;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;
}
