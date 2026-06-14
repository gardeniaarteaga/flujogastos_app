import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tipo_transaccion' })
export class TipoTransaccion {
  @PrimaryGeneratedColumn({ name: 'id_tipo' })
  id_tipo!: number;

  @Column({ name: 'nombre', type: 'varchar', length: 50 })
  nombre!: string;

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  id_usuario!: number | null;

  @Column({ name: 'signo', type: 'varchar', length: 1, nullable: true })
  signo!: string | null;
}
