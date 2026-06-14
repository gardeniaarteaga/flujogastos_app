import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'periodicidad' })
export class Periodicidad {
  @PrimaryGeneratedColumn({ name: 'id_periodicidad' })
  id_periodicidad!: number;

  @Column({ name: 'nombre_periodicidad', type: 'varchar', length: 80 })
  nombre_periodicidad!: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 180, nullable: true })
  descripcion!: string | null;

  @Column({ name: 'codigo', type: 'varchar', length: 40 })
  codigo!: string;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;
}
