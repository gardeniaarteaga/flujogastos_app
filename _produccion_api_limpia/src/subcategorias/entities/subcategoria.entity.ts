import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'subcategorias' })
export class Subcategoria {
  @PrimaryGeneratedColumn({ name: 'id_subcategoria' })
  id_subcategoria!: number;

  @Column({ name: 'id_categoria', type: 'integer' })
  id_categoria!: number;

  @Column({ name: 'nombre_subcategoria', type: 'varchar', length: 50 })
  nombre_subcategoria!: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 100, nullable: true })
  descripcion!: string | null;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;

  @Column({ name: 'id_usuario', type: 'integer', nullable: true })
  id_usuario!: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
