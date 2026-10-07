import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type Stripe from 'stripe';
import { EmailService } from '../../email/email.service.js';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { expireMembershipIfNeeded } from '../common/membership-expiration.util.js';
import { GymBillingCycle, GymMembershipPlan, type GymMembershipPlanDocument } from '../schemas/gym-membership-plan.schema.js';
import {
  GymMembershipEvent,
  type GymMembershipEventCategory,
  type GymMembershipEventDocument,
} from '../schemas/gym-membership-event.schema.js';
import { GymPayment, type GymPaymentDocument, type GymPaymentStatus } from '../schemas/gym-payment.schema.js';
import { GymPaymentSettings, type GymPaymentSettingsDocument } from '../schemas/gym-payment-settings.schema.js';
import { GymUser, type GymPaymentMethod, type GymUserDocument } from '../schemas/gym-user.schema.js';
import type { CreateGymCheckoutDto } from './dto/create-checkout.dto.js';
import type { RecordManualPaymentDto } from './dto/record-manual-payment.dto.js';
import type { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto.js';
import { GymMercadoPagoService } from './gym-mercadopago.service.js';
import { GymStripeService } from './gym-stripe.service.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymPaymentSummary {
  id: string;
  membershipPlanId: string;
  membershipPlanName?: string;
  provider: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: GymPaymentStatus;
  periodStart?: string;
  periodEnd?: string;
  createdAt: string;
  // Solo presente en pagos 'manual' — nombre de quien lo registró (ver
  // recordManualPayment). Se resuelve con un populate aparte en toSummary,
  // no viene del populate de membershipPlanId.
  processedByName?: string;
}

@Injectable()
export class GymPaymentsService {
  private readonly logger = new Logger(GymPaymentsService.name);

  constructor(
    @InjectModel(GymPayment.name, GYM_DB_CONNECTION) private readonly paymentModel: Model<GymPaymentDocument>,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymMembershipPlan.name, GYM_DB_CONNECTION) private readonly planModel: Model<GymMembershipPlanDocument>,
    @InjectModel(GymMembershipEvent.name, GYM_DB_CONNECTION) private readonly eventModel: Model<GymMembershipEventDocument>,
    @InjectModel(GymPaymentSettings.name, GYM_DB_CONNECTION) private readonly settingsModel: Model<GymPaymentSettingsDocument>,
    private readonly stripeService: GymStripeService,
    private readonly mercadoPagoService: GymMercadoPagoService,
    private readonly emailService: EmailService,
  ) {}

  // Expuesto al frontend (cualquier socio autenticado) para que sepa qué
  // botones de pago mostrar sin tener que adivinar a partir de un 503 al
  // intentar el checkout. La gestión de estos flags desde una UI de admin
  // queda para Fase 4 (ver PLANNING.md sección 4) — por ahora son solo env
  // vars leídas en runtime.
  getProvidersConfig(): { stripeEnabled: boolean; mercadopagoEnabled: boolean } {
    return {
      stripeEnabled: this.stripeService.isConfigured,
      mercadopagoEnabled: this.mercadoPagoService.isConfigured,
    };
  }

  // Settings de negocio sobre pagos (a diferencia de getProvidersConfig,
  // que son env vars de solo lectura) — hoy solo el flag de pagos manuales
  // por admin, pensado para crecer sin tener que tocar el shape del
  // endpoint. Cualquier admin/superadmin puede leerlo (lo necesita el
  // frontend para decidir si mostrar el botón "Registrar pago manual"),
  // solo superadmin puede escribirlo (ver GymPaymentsController).
  async getSettings(): Promise<{ allowAdminManualPayments: boolean }> {
    const settings = await this.getOrCreateSettings();
    return { allowAdminManualPayments: settings.allowAdminManualPayments };
  }

  async updateSettings(dto: UpdatePaymentSettingsDto): Promise<{ allowAdminManualPayments: boolean }> {
    const settings = await this.getOrCreateSettings();
    settings.allowAdminManualPayments = dto.allowAdminManualPayments;
    await settings.save();
    return { allowAdminManualPayments: settings.allowAdminManualPayments };
  }

  async createStripeCheckout(user: GymRequestUser, dto: CreateGymCheckoutDto): Promise<{ url: string }> {
    if (!this.stripeService.isConfigured) {
      throw new BadRequestException('Stripe payments are not enabled on this server.');
    }
    const plan = await this.resolvePlanForCheckout(dto.membershipPlanId, user);
    const payment = await this.createPendingPayment(user, plan, 'stripe');

    const session = await this.stripeService.createCheckoutSession({
      id: payment._id.toString(),
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency,
    });

    payment.providerPaymentId = session.sessionId;
    await payment.save();

    return { url: session.url };
  }

  async createMercadoPagoCheckout(user: GymRequestUser, dto: CreateGymCheckoutDto): Promise<{ url: string }> {
    if (!this.mercadoPagoService.isConfigured) {
      throw new BadRequestException('Mercado Pago payments are not enabled on this server.');
    }
    const plan = await this.resolvePlanForCheckout(dto.membershipPlanId, user);
    const payment = await this.createPendingPayment(user, plan, 'mercadopago');

    const preference = await this.mercadoPagoService.createPreference({
      id: payment._id.toString(),
      planName: plan.name,
      amount: plan.price,
      currency: plan.currency,
    });

    payment.providerPaymentId = preference.preferenceId;
    await payment.save();

    return { url: preference.url };
  }

  // Pago registrado a mano por un admin/superadmin (efectivo, transferencia,
  // etc.) — para socios sin Stripe/Mercado Pago configurados, o que
  // simplemente pagan en persona. Se marca `paid` al instante (no hay
  // proveedor externo que confirme después) y reusa markPaymentPaid para
  // extender la membresía, auditar el evento y mandar el mail de
  // confirmación, igual que un pago online. A propósito NO pasa por
  // resolvePlanForCheckout: el límite de "un cambio de plan por mes" solo
  // rige el autoservicio del socio, el admin no tiene esa restricción.
  async recordManualPayment(
    admin: GymRequestUser,
    targetUserId: string,
    dto: RecordManualPaymentDto,
  ): Promise<GymPaymentSummary> {
    if (admin.role === 'admin') {
      const settings = await this.getOrCreateSettings();
      if (!settings.allowAdminManualPayments) {
        throw new ForbiddenException('Manual payments are disabled for admins on this server.');
      }
    }

    const member = await this.userModel.findById(targetUserId);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    if (admin.role === 'admin') {
      if (!member.centerId) {
        throw new ForbiddenException('You do not have access to this member.');
      }
      assertCenterAccess(admin, member.centerId);
    }

    const plan = await this.planModel.findById(dto.membershipPlanId);
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Membership plan not found.');
    }

    const payment = await this.paymentModel.create({
      userId: member._id,
      membershipPlanId: plan._id,
      provider: 'manual' as GymPaymentMethod,
      amount: dto.amount ?? plan.price,
      currency: plan.currency,
      status: 'pending',
      processedByUserId: admin.id,
    });

    await this.markPaymentPaid(payment);
    await payment.populate([
      { path: 'membershipPlanId', select: 'name' },
      { path: 'processedByUserId', select: 'firstName lastName' },
    ]);
    return this.toSummary(payment);
  }

  async listPaymentsForMember(userId: Types.ObjectId): Promise<GymPaymentSummary[]> {
    // Sin generic en populate(): el generic devuelve un tipo de documento
    // distinto de GymPaymentDocument (incompatible con toSummary), y no hace
    // falta — toSummary ya castea membershipPlanId/processedByUserId a mano
    // para cubrir tanto el caso poblado como el ObjectId crudo (o undefined).
    const payments = await this.paymentModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .populate('membershipPlanId', 'name')
      .populate('processedByUserId', 'firstName lastName');
    return payments.map((payment) => this.toSummary(payment as unknown as GymPaymentDocument));
  }

  // Para PagoConfirmadoPage: buscar un pago puntual por id tras volver del
  // checkout de Stripe/Mercado Pago (ver gym-stripe.service.ts y
  // gym-mercadopago.service.ts, que ahora mandan `payment_id` en la URL de
  // retorno). Scoping estricto por dueño — cualquier socio autenticado podría
  // adivinar un id ajeno si no se validara esto.
  async getReceiptForMember(user: GymRequestUser, paymentId: string): Promise<GymPaymentSummary> {
    if (!Types.ObjectId.isValid(paymentId)) {
      throw new NotFoundException('Payment not found.');
    }
    const payment = await this.paymentModel
      .findById(paymentId)
      .populate('membershipPlanId', 'name')
      .populate('processedByUserId', 'firstName lastName');
    if (!payment || !payment.userId.equals(user.id)) {
      throw new NotFoundException('Payment not found.');
    }
    return this.toSummary(payment as unknown as GymPaymentDocument);
  }

  // Para la ficha de un socio en "Gestión de afiliados" (ver PLANNING.md
  // sección 4) — un admin solo puede ver el historial de socios de sus
  // propios centros, superadmin no tiene restricción.
  async listPaymentsForAdmin(admin: GymRequestUser, targetUserId: string): Promise<GymPaymentSummary[]> {
    const member = await this.userModel.findById(targetUserId);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    if (admin.role === 'admin') {
      if (!member.centerId) {
        throw new ForbiddenException('You do not have access to this member.');
      }
      assertCenterAccess(admin, member.centerId);
    }
    return this.listPaymentsForMember(member._id);
  }

  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentId = session.metadata?.gymPaymentId;
        if (!paymentId) {
          this.logger.warn(`checkout.session.completed sin metadata.gymPaymentId (session ${session.id})`);
          return;
        }

        const payment = await this.paymentModel.findById(paymentId);
        if (!payment) {
          this.logger.warn(`GymPayment ${paymentId} no encontrado (checkout.session.completed)`);
          return;
        }

        payment.providerPaymentId = session.id;
        if (session.payment_status === 'paid') {
          await this.markPaymentPaid(payment);
        } else {
          await payment.save();
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentId = session.metadata?.gymPaymentId;
        if (paymentId) {
          await this.paymentModel.findOneAndUpdate({ _id: paymentId, status: 'pending' }, { status: 'failed' });
        }
        break;
      }
      default:
        break;
    }
  }

  async handleMercadoPagoNotification(dataId: string): Promise<void> {
    const mpPayment = await this.mercadoPagoService.getPayment(dataId);
    const paymentId = mpPayment.external_reference;
    if (!paymentId) {
      this.logger.warn(`Payment ${dataId} de Mercado Pago sin external_reference`);
      return;
    }

    const payment = await this.paymentModel.findById(paymentId).catch(() => null);
    if (!payment) {
      this.logger.warn(`GymPayment ${paymentId} no encontrado (Mercado Pago payment ${dataId})`);
      return;
    }

    payment.providerPaymentId = String(mpPayment.id ?? dataId);

    if (mpPayment.status === 'approved') {
      await this.markPaymentPaid(payment);
    } else if (mpPayment.status === 'rejected' || mpPayment.status === 'cancelled') {
      if (payment.status !== 'paid') {
        payment.status = 'failed';
      }
      await payment.save();
    } else {
      // in_process, pending, etc. (medios offline) — se mantiene pending,
      // el webhook vuelve a llegar cuando cambie de verdad.
      await payment.save();
    }
  }

  // --- internals ---

  private async resolvePlanForCheckout(
    membershipPlanId: string,
    user: GymRequestUser,
  ): Promise<GymMembershipPlanDocument> {
    const plan = await this.planModel.findById(membershipPlanId);
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Membership plan not found.');
    }

    const member = await this.userModel.findById(user.id);

    // Recalcula el vencimiento antes de decidir nada acá: si la membresía ya
    // venció (pasó membershipEndDate) pero nadie disparó todavía el chequeo
    // perezoso (ver membership-expiration.util.ts), member.membershipStatus
    // puede seguir diciendo 'active' por un rato — no queremos bloquear un
    // pago legítimo de renovación por ese desfasaje.
    if (member) {
      await expireMembershipIfNeeded(this.eventModel, member);
    }

    // Bloqueo de negocio: no tiene sentido volver a cobrar el mismo plan que
    // ya está activo y vigente (no venció) — a diferencia del límite de
    // cambio de plan de abajo, esto no es "una vez por mes" sino "mientras
    // sigue pagado no hace falta pagar de nuevo". Mismo criterio que ya
    // aplicaba el frontend ocultando el botón (isPaidAndCurrent en
    // MembresiaPage.tsx) — este chequeo lo respalda también del lado del
    // servidor, para no depender solo de la UI.
    if (member?.membershipPlanId && member.membershipPlanId.equals(plan._id) && member.membershipStatus === 'active') {
      const formattedEndDate = member.membershipEndDate?.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      throw new BadRequestException(
        `Tu plan "${plan.name}" ya está activo${formattedEndDate ? ` hasta el ${formattedEndDate}` : ''}. No hace falta pagar de nuevo hasta que venza.`,
      );
    }

    // Límite de negocio: el socio solo puede cambiar a un plan distinto del
    // que ya tenía una vez por mes calendario (evita ida y vuelta entre
    // planes para aprovechar features puntuales) — volver a pagar el mismo
    // plan (renovación normal) nunca cuenta como "cambio". Este chequeo es
    // exclusivo del autoservicio: no se llama desde recordManualPayment, así
    // que un admin puede cambiarle el plan a un socio sin esta restricción.
    if (member?.membershipPlanId && !member.membershipPlanId.equals(plan._id) && member.lastPlanChangeAt) {
      const now = new Date();
      const last = member.lastPlanChangeAt;
      const sameCalendarMonth = last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth();
      if (sameCalendarMonth) {
        throw new BadRequestException(
          'Ya cambiaste de plan este mes. Podés volver a hacerlo a partir del mes que viene (renovar tu plan actual sí está permitido en cualquier momento).',
        );
      }
    }

    return plan;
  }

  private async createPendingPayment(
    user: GymRequestUser,
    plan: GymMembershipPlanDocument,
    provider: 'stripe' | 'mercadopago',
  ): Promise<GymPaymentDocument> {
    return this.paymentModel.create({
      userId: user.id,
      membershipPlanId: plan._id,
      provider,
      amount: plan.price,
      currency: plan.currency,
      status: 'pending',
    });
  }

  // Confirma el pago, extiende la membresía y audita el cambio de estado.
  // Idempotente a propósito: tanto Stripe como Mercado Pago pueden
  // reintentar la entrega del webhook, así que si el pago ya estaba `paid`
  // no se vuelve a extender el período ni se manda un segundo mail.
  private async markPaymentPaid(payment: GymPaymentDocument): Promise<void> {
    if (payment.status === 'paid') {
      await payment.save();
      return;
    }

    const plan = await this.planModel.findById(payment.membershipPlanId);
    if (!plan) {
      this.logger.error(`GymPayment ${payment._id.toString()} paid pero su plan ${payment.membershipPlanId} ya no existe.`);
      payment.status = 'paid';
      await payment.save();
      return;
    }

    const member = await this.userModel.findById(payment.userId);
    if (!member) {
      this.logger.error(`GymPayment ${payment._id.toString()} paid pero el socio ${payment.userId} ya no existe.`);
      payment.status = 'paid';
      await payment.save();
      return;
    }

    // Si la membresía ya venció sin que nadie lo notara (nadie hizo
    // check-in desde el vencimiento), primero se refleja eso — así la
    // categoría del evento de auditoría sale correcta (reactivación, no un
    // alta "de la nada").
    await expireMembershipIfNeeded(this.eventModel, member);

    const now = new Date();
    const periodEnd = addBillingCycle(now, plan.billingCycle);

    payment.status = 'paid';
    payment.periodStart = now;
    payment.periodEnd = periodEnd;
    await payment.save();

    const previousStatus = member.membershipStatus;
    // Un "cambio de plan" real es que ya tuviera uno y sea distinto del
    // nuevo — la primera alta (sin plan previo) no cuenta. Se registra sin
    // importar quién pagó (socio o admin, ver recordManualPayment): el
    // límite de una vez por mes que lee este campo solo se valida en el
    // autoservicio del socio (resolvePlanForCheckout), no acá.
    const isPlanChange = Boolean(member.membershipPlanId) && !member.membershipPlanId!.equals(plan._id as Types.ObjectId);
    member.membershipPlanId = plan._id as Types.ObjectId;
    member.membershipStatus = 'active';
    member.membershipStartDate = now;
    member.membershipEndDate = periodEnd;
    member.preferredPaymentMethod = payment.provider;
    if (isPlanChange) {
      member.lastPlanChangeAt = now;
    }
    await member.save();

    // Una renovación mientras la membresía seguía activa (pagó antes de que
    // venciera) no es un cambio de estado real — no se audita como
    // alta/reactivación para no ensuciar las métricas del dashboard con
    // "altas" que en realidad son renovaciones normales.
    if (previousStatus !== 'active') {
      const category: GymMembershipEventCategory =
        previousStatus === 'expired' || previousStatus === 'cancelled' || previousStatus === 'frozen'
          ? 'reactivacion'
          : 'alta';

      await this.eventModel.create({
        userId: member._id,
        previousStatus,
        newStatus: 'active',
        category,
        reason: `Pago confirmado (${payment.provider}) — plan "${plan.name}".`,
      });
    }

    const sent = await this.emailService.sendGymPaymentConfirmationEmail({
      email: member.email,
      firstName: member.firstName,
      planName: plan.name,
      amount: payment.amount,
      currency: payment.currency,
      periodEnd,
    });
    if (!sent) {
      this.logger.warn(`Payment confirmation email could not be sent to ${member.email} (payment confirmed regardless).`);
    }

    // Trazabilidad de pagos cobrados a mano: Stripe/Mercado Pago los paga el
    // propio socio (no hace falta avisarle a nadie más), pero un pago manual
    // lo cobra un admin/superadmin en persona — el resto de los superadmins
    // no se enteran si no se les avisa. No bloquea ni revierte el pago si
    // falla el envío, mismo criterio que el mail de arriba.
    if (payment.provider === 'manual') {
      await this.notifySuperadminsOfManualPayment(payment, member, plan);
    }
  }

  private async notifySuperadminsOfManualPayment(
    payment: GymPaymentDocument,
    member: GymUserDocument,
    plan: GymMembershipPlanDocument,
  ): Promise<void> {
    const [processedBy, superadmins] = await Promise.all([
      payment.processedByUserId ? this.userModel.findById(payment.processedByUserId) : null,
      this.userModel.find({ role: 'superadmin' }),
    ]);
    if (superadmins.length === 0) {
      return;
    }

    const processedByName = processedBy ? `${processedBy.firstName} ${processedBy.lastName}` : 'un administrador';
    const memberName = `${member.firstName} ${member.lastName}`;

    const results = await Promise.all(
      superadmins.map((superadmin) =>
        this.emailService.sendGymManualPaymentRecordedEmail({
          email: superadmin.email,
          memberName,
          planName: plan.name,
          amount: payment.amount,
          currency: payment.currency,
          processedByName,
        }),
      ),
    );
    if (results.some((wasSent) => !wasSent)) {
      this.logger.warn(`Manual payment admin notification could not be sent to all superadmins (payment ${payment._id.toString()}).`);
    }
  }

  // Singleton get-or-create: no hay UI de alta para esta colección, siempre
  // hay a lo sumo un documento. Se crea con los defaults del schema la
  // primera vez que se lee o escribe.
  private async getOrCreateSettings(): Promise<GymPaymentSettingsDocument> {
    const existing = await this.settingsModel.findOne();
    if (existing) {
      return existing;
    }
    return this.settingsModel.create({});
  }

  private toSummary(payment: GymPaymentDocument): GymPaymentSummary {
    const populatedPlan = payment.membershipPlanId as unknown as GymMembershipPlanDocument | Types.ObjectId;
    const isPopulated = populatedPlan && typeof populatedPlan === 'object' && 'name' in populatedPlan;

    const populatedProcessedBy = payment.processedByUserId as unknown as
      | { firstName: string; lastName: string }
      | Types.ObjectId
      | undefined;
    const processedByIsPopulated =
      populatedProcessedBy && typeof populatedProcessedBy === 'object' && 'firstName' in populatedProcessedBy;

    return {
      id: payment._id.toString(),
      membershipPlanId: isPopulated
        ? (populatedPlan as GymMembershipPlanDocument)._id.toString()
        : (populatedPlan as Types.ObjectId).toString(),
      membershipPlanName: isPopulated ? (populatedPlan as GymMembershipPlanDocument).name : undefined,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      periodStart: payment.periodStart?.toISOString(),
      periodEnd: payment.periodEnd?.toISOString(),
      createdAt: (payment as unknown as { createdAt: Date }).createdAt.toISOString(),
      processedByName: processedByIsPopulated
        ? `${(populatedProcessedBy as { firstName: string }).firstName} ${(populatedProcessedBy as { lastName: string }).lastName}`
        : undefined,
    };
  }
}

function addBillingCycle(date: Date, cycle: GymBillingCycle): Date {
  const result = new Date(date);
  switch (cycle) {
    case 'mensual':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'trimestral':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'anual':
      result.setFullYear(result.getFullYear() + 1);
      break;
  }
  return result;
}
