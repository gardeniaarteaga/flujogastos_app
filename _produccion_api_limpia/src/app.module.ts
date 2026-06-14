import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriasModule } from './categorias/categorias.module';
import { SubcategoriasModule } from './subcategorias/subcategorias.module';
import { EntidadesFinancierasModule } from './entidades-financieras/entidades-financieras.module';
import { TipoEntidadModule } from './tipo-entidad/tipo-entidad.module';
import { TipoProductoModule } from './tipo-producto/tipo-producto.module';
import { FormasPagoModule } from './formas-pago/formas-pago.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ParticipantesModule } from './participantes/participantes.module';
import { EstadosTransaccionModule } from './estados-transaccion/estados-transaccion.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { InteresesModule } from './intereses/intereses.module';
import { TransaccionesModule } from './transacciones/transacciones.module';

const getFirstConfigValue = (
  configService: ConfigService,
  keys: string[],
  defaultValue: string,
): string => {
  for (const key of keys) {
    const value = configService.get<string>(key);

    if (value !== undefined && value !== '') {
      return value;
    }
  }

  return defaultValue;
};

const getDatabasePort = (configService: ConfigService): number => {
  const value = getFirstConfigValue(configService, ['DB_PORT', 'PGPORT'], '5432');
  const port = Number(value);

  return Number.isInteger(port) ? port : 5432;
};

const shouldUseDatabaseSsl = (configService: ConfigService): boolean => {
  const sslMode = configService.get<string>('PGSSLMODE')?.toLowerCase();
  const dbSsl = configService.get<string>('DB_SSL')?.toLowerCase();

  return dbSsl === 'true' || sslMode === 'require';
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL') || undefined,
        host: getFirstConfigValue(configService, ['DB_HOST', 'PGHOST'], 'localhost'),
        port: getDatabasePort(configService),
        username: getFirstConfigValue(
          configService,
          ['DB_USERNAME', 'PGUSER', 'POSTGRES_USER'],
          'postgres',
        ),
        password: getFirstConfigValue(
          configService,
          ['DB_PASSWORD', 'PGPASSWORD', 'POSTGRES_PASSWORD'],
          'postgres',
        ),
        database: getFirstConfigValue(
          configService,
          ['DB_NAME', 'PGDATABASE', 'POSTGRES_DB'],
          'control_gastos',
        ),
        ssl: shouldUseDatabaseSsl(configService)
          ? { rejectUnauthorized: false }
          : false,
        entities: ['dist/**/*.entity{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    CategoriasModule,
    SubcategoriasModule,
    EntidadesFinancierasModule,
    TipoEntidadModule,
    TipoProductoModule,
    FormasPagoModule,
    ParticipantesModule,
    UsuariosModule,
    EstadosTransaccionModule,
    NotificacionesModule,
    InteresesModule,
    TransaccionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
