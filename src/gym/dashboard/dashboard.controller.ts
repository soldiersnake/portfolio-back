import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GymDashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

// Métricas para el dashboard admin (ver PLANNING.md sección 4, "Dashboard*").
// Sin query params: un `admin` ve la suma de sus propios centros
// (managedCenterIds), `superadmin` ve todos los centros juntos. Con
// `?centerId=...`: se acota a ese único centro (validando que el admin lo
// administre). `?month=YYYY-MM` filtra las altas/bajas de ese mes (default:
// mes calendario actual). `?periodDays=N` define la ventana de la métrica de
// frecuencia de visitas (default: 30 días).
@Controller('gym/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class GymDashboardController {
  constructor(private readonly dashboardService: GymDashboardService) {}

  @Get('metrics')
  getMetrics(
    @CurrentUser() user: GymRequestUser,
    @Query('centerId') centerId?: string,
    @Query('month') month?: string,
    @Query('periodDays') periodDaysRaw?: string,
  ) {
    const periodDays = periodDaysRaw !== undefined ? Number(periodDaysRaw) : undefined;
    return this.dashboardService.getMetrics(user, { centerId, month, periodDays });
  }
}
