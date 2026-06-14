import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EstadoTransaccion } from './entities/estado-transaccion.entity';

@Injectable()
export class EstadosTransaccionService {
  constructor(
    @InjectRepository(EstadoTransaccion)
    private readonly estadosTransaccionRepository: Repository<EstadoTransaccion>,
  ) {}

  async findAll() {
    return this.estadosTransaccionRepository.find({
      where: { estado: 'ACTIVO' },
      order: { id_estado: 'ASC' },
    });
  }
}
