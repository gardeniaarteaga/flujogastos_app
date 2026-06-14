import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { InteresesService } from './intereses.service';

@Injectable()
export class InteresesSchedulerService implements OnModuleInit, OnModuleDestroy {
  private static readonly BUSINESS_TIME_ZONE = 'America/El_Salvador';

  private readonly logger = new Logger(InteresesSchedulerService.name);
  private intervalRef: NodeJS.Timeout | null = null;
  private lastExecutedDateKey: string | null = null;
  private isRunning = false;

  constructor(private readonly interesesService: InteresesService) {}

  onModuleInit(): void {
    this.intervalRef = setInterval(() => {
      void this.handleTick();
    }, 30_000);

    void this.handleTick();
  }

  onModuleDestroy(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private async handleTick(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const now = this.getBusinessNowParts();
    const dateKey = `${now.year}-${now.month}-${now.day}`;

    if (now.hour !== '23' || now.minute !== '59' || this.lastExecutedDateKey === dateKey) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.interesesService.calculateDailyIntereses('scheduler');
      this.lastExecutedDateKey = dateKey;
      this.logger.log(
        `Calculo diario ejecutado ${result.fecha_calculo}: ${result.registros_procesados} registros, total $${result.total_intereses_generados.toFixed(2)}.`,
      );
    } catch (error) {
      this.logger.error('No se pudo ejecutar el calculo automatico de intereses.', error);
    } finally {
      this.isRunning = false;
    }
  }

  private getBusinessNowParts(): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: InteresesSchedulerService.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(new Date());
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute'),
    };
  }
}
