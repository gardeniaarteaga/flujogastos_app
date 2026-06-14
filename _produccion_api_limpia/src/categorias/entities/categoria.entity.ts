import { CreateDateColumn, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'categorias' })
export class Categoria {
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  id_categoria!: number;

  @Column({ name: 'nombre_categoria', type: 'varchar', length: 50 })
  nombre_categoria!: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 150, nullable: true })
  descripcion!: string | null;

  @Column({ name: 'estado', type: 'boolean', default: true })
  estado!: boolean;

  @Column({ name: 'id_usuario', type: 'integer' })
  id_usuario!: number;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
