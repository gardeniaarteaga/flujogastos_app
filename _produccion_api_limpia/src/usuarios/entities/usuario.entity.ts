import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn({ name: 'id_usuario' })
  id_usuario!: number;

  @Column({ name: 'username', type: 'varchar', length: 255, unique: true })
  username!: string;

  @Column({ name: 'password', type: 'varchar', length: 255 })
  password!: string;

  @Column({ name: 'cambiar_password', type: 'boolean', default: false })
  cambiar_password!: boolean;

  @Column({ name: 'fecha_ult_password', type: 'timestamp', nullable: true })
  fecha_ult_password!: Date | null;

  @Column({ name: 'nombre_completo', type: 'varchar', length: 255, nullable: true })
  nombre_completo!: string | null;

  @Column({ name: 'celular', type: 'varchar', length: 25, nullable: true })
  celular!: string | null;

  @Column({ name: 'pais', type: 'varchar', length: 80, nullable: true })
  pais!: string | null;

  @Column({ name: 'codigo_area', type: 'varchar', length: 10, nullable: true })
  codigo_area!: string | null;

  @Column({ name: 'ciudad', type: 'varchar', length: 80, nullable: true })
  ciudad!: string | null;

  @Column({ name: 'id_rol', type: 'integer', nullable: true })
  id_rol!: number | null;

  @Column({ name: 'estado', type: 'varchar', length: 20, nullable: true })
  estado!: string | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp' })
  fecha_creacion!: Date;
}
