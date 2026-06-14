import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tipo_producto' })
export class TipoProducto {
  @PrimaryGeneratedColumn({ name: 'id_tipo_producto' })
  id_tipo_producto!: number;

  @Column({ name: 'nombre_tipo', type: 'varchar', length: 100 })
  nombre_tipo!: string;

  @Column({ name: 'pago_inmediato', type: 'boolean', nullable: true, default: true })
  pago_inmediato!: boolean | null;

  @Column({ name: 'id_usuario', type: 'int' })
  id_usuario!: number;
}
