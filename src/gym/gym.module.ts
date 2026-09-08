import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from '../email/email.module.js';
import { GymUser, GymUserSchema } from './schemas/gym-user.schema.js';
import { GymWeightLog, GymWeightLogSchema } from './schemas/gym-weight-log.schema.js';
import { GymCenter, GymCenterSchema } from './schemas/gym-center.schema.js';
import { GymMembershipPlan, GymMembershipPlanSchema } from './schemas/gym-membership-plan.schema.js';
import { GymClass, GymClassSchema } from './schemas/gym-class.schema.js';
import { GymClassBooking, GymClassBookingSchema } from './schemas/gym-class-booking.schema.js';
import { GymAnnouncement, GymAnnouncementSchema } from './schemas/gym-announcement.schema.js';
import { GymPayment, GymPaymentSchema } from './schemas/gym-payment.schema.js';
import { GymPaymentSettings, GymPaymentSettingsSchema } from './schemas/gym-payment-settings.schema.js';
import { GymCheckIn, GymCheckInSchema } from './schemas/gym-checkin.schema.js';
import { GymMembershipEvent, GymMembershipEventSchema } from './schemas/gym-membership-event.schema.js';
import { GymAuthService } from './auth/gym-auth.service.js';
import { GymAuthController } from './auth/gym-auth.controller.js';
import { GymUsersService } from './users/users.service.js';
import { GymUsersController } from './users/users.controller.js';
import { GymImageKitService } from './users/gym-imagekit.service.js';
import { GymCentersService } from './centers/centers.service.js';
import { GymCentersController } from './centers/centers.controller.js';
import { GymMembershipsService } from './memberships/memberships.service.js';
import { GymMembershipsController } from './memberships/memberships.controller.js';
import { GymAnnouncementsService } from './announcements/announcements.service.js';
import { GymAnnouncementsController } from './announcements/announcements.controller.js';
import { GymCheckInsService } from './checkins/checkins.service.js';
import { GymCheckInsController } from './checkins/checkins.controller.js';
import { GymDashboardService } from './dashboard/dashboard.service.js';
import { GymDashboardController } from './dashboard/dashboard.controller.js';
import { GymPaymentsService } from './payments/payments.service.js';
import { GymPaymentsController } from './payments/payments.controller.js';
import { GymStripeService } from './payments/gym-stripe.service.js';
import { GymMercadoPagoService } from './payments/gym-mercadopago.service.js';
import { GymNotificationsService } from './notifications/notifications.service.js';
import { GymNotificationsController } from './notifications/notifications.controller.js';
import { GymWebPushService } from './notifications/gym-web-push.service.js';
import { GymClassesService } from './classes/classes.service.js';
import { GymClassesController } from './classes/classes.controller.js';
import { GymRemindersService } from './reminders/reminders.service.js';
import { GymRemindersController } from './reminders/reminders.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GymUser.name, schema: GymUserSchema },
      { name: GymWeightLog.name, schema: GymWeightLogSchema },
      { name: GymCenter.name, schema: GymCenterSchema },
      { name: GymMembershipPlan.name, schema: GymMembershipPlanSchema },
      { name: GymClass.name, schema: GymClassSchema },
      { name: GymClassBooking.name, schema: GymClassBookingSchema },
      { name: GymAnnouncement.name, schema: GymAnnouncementSchema },
      { name: GymPayment.name, schema: GymPaymentSchema },
      { name: GymPaymentSettings.name, schema: GymPaymentSettingsSchema },
      { name: GymCheckIn.name, schema: GymCheckInSchema },
      { name: GymMembershipEvent.name, schema: GymMembershipEventSchema },
    ]),
    EmailModule,
    // JWT propio de GymBro, separado del de tienda-mueble. Acá sí importa
    // la revocación/expiración porque hay roles admin/superadmin reales:
    // 7 días de vida, igual que tienda-mueble, revisable más adelante si
    // hace falta algo más corto para admins.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('GYM_JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [
    GymAuthController,
    GymUsersController,
    GymCentersController,
    GymMembershipsController,
    GymAnnouncementsController,
    GymCheckInsController,
    GymDashboardController,
    GymPaymentsController,
    GymClassesController,
    GymNotificationsController,
    GymRemindersController,
  ],
  // JwtAuthGuard y RolesGuard NO se listan acá: son @Injectable() y se
  // aplican directamente vía @UseGuards(...) en los controllers, igual que
  // JwtAuthGuard/AdminGuard en tienda-mueble — Nest los resuelve por DI sin
  // necesidad de declararlos como provider explícito.
  providers: [
    GymAuthService,
    GymUsersService,
    GymImageKitService,
    GymCentersService,
    GymMembershipsService,
    GymAnnouncementsService,
    GymCheckInsService,
    GymDashboardService,
    GymPaymentsService,
    GymStripeService,
    GymMercadoPagoService,
    // GymClassesService depende de GymNotificationsService (avisa cuando
    // alguien pasa de lista de espera a reservado, ver
    // classes.service.ts#cancelBooking) — sin dependencia inversa, así que
    // el orden acá no importa, Nest resuelve el grafo de DI solo.
    GymNotificationsService,
    GymWebPushService,
    GymClassesService,
    // Depende de GymNotificationsService (push + email), mismo motivo que
    // GymClassesService más arriba — sin dependencia inversa.
    GymRemindersService,
  ],
})
export class GymModule {}
