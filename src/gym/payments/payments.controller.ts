import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { GymPaymentsService } from './payments.service.js';
import { GymStripeService } from './gym-stripe.service.js';
import { GymMercadoPagoService } from './gym-mercadopago.service.js';
import { CreateGymCheckoutDto } from './dto/create-checkout.dto.js';
import { RecordManualPaymentDto } from './dto/record-manual-payment.dto.js';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

// Mismo body que tienda-mueble/orders/orders.controller.ts — solo se tipa lo
// que efectivamente se usa del payload de Mercado Pago.
interface MercadoPagoWebhookBody {
  type?: string;
  data?: { id?: string };
}

// A diferencia de GymMembershipsController, acá los guards van por endpoint
// (no a nivel de controller): los dos webhooks (Stripe/Mercado Pago) los
// llama el proveedor de pagos, no un socio logueado, y un @UseGuards a nivel
// de clase se aplicaría igual a esas dos rutas sin forma de excluirlas (no
// hay un @Public()/reflector bypass en este proyecto) — eso fue exactamente
// el bug del 401 en el webhook de Stripe (ver TESTING_LOCAL.md, sección 23).
// Mismo patrón que tienda-mueble/orders/orders.controller.ts.
@Controller('gym/payments')
export class GymPaymentsController {
  constructor(
    private readonly paymentsService: GymPaymentsService,
    private readonly stripeService: GymStripeService,
    private readonly mercadoPagoService: GymMercadoPagoService,
  ) {}

  // Cualquier socio autenticado puede consultar qué proveedores están
  // activos, para decidir qué botones de pago mostrar.
  @Get('config')
  @UseGuards(JwtAuthGuard)
  getConfig() {
    return this.paymentsService.getProvidersConfig();
  }

  @Post('checkout-session/stripe')
  @UseGuards(JwtAuthGuard)
  createStripeCheckout(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymCheckoutDto) {
    return this.paymentsService.createStripeCheckout(user, dto);
  }

  @Post('checkout-session/mercadopago')
  @UseGuards(JwtAuthGuard)
  createMercadoPagoCheckout(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymCheckoutDto) {
    return this.paymentsService.createMercadoPagoCheckout(user, dto);
  }

  // Historial de pagos propio (para "Mi membresía" en el front).
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getOwnPayments(@CurrentUser() user: GymRequestUser) {
    return this.paymentsService.listPaymentsForMember(user.id);
  }

  // Comprobante de un pago puntual — lo usa PagoConfirmadoPage tras volver
  // del checkout de Stripe/Mercado Pago (ver gym-stripe.service.ts /
  // gym-mercadopago.service.ts, que mandan `payment_id` en la URL de
  // retorno). Va antes de `users/:userId` en la lectura del archivo pero no
  // colisiona con esa ruta (dos segmentos distintos) ni con `config`/`me`/
  // `settings` (declaradas antes, mismo shape de un segmento).
  @Get('receipt/:paymentId')
  @UseGuards(JwtAuthGuard)
  getReceipt(@CurrentUser() user: GymRequestUser, @Param('paymentId') paymentId: string) {
    return this.paymentsService.getReceiptForMember(user, paymentId);
  }

  // Historial de pagos de un socio puntual, para la ficha de "Gestión de
  // afiliados" — scoping por centro lo valida el service.
  @Get('users/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  getMemberPayments(@CurrentUser() admin: GymRequestUser, @Param('userId') userId: string) {
    return this.paymentsService.listPaymentsForAdmin(admin, userId);
  }

  // Registrar un pago en efectivo/transferencia desde la ficha del socio —
  // se marca `paid` al instante, sin depender de Stripe/Mercado Pago. El
  // service valida el flag `allowAdminManualPayments` para role='admin'
  // (superadmin nunca está restringido) y el scoping por centro.
  @Post('users/:userId/manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  recordManualPayment(
    @CurrentUser() admin: GymRequestUser,
    @Param('userId') userId: string,
    @Body() dto: RecordManualPaymentDto,
  ) {
    return this.paymentsService.recordManualPayment(admin, userId, dto);
  }

  // Cualquier admin/superadmin puede leer el flag (lo necesita el frontend
  // para decidir si mostrar "Registrar pago manual"); solo superadmin puede
  // cambiarlo.
  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  getSettings() {
    return this.paymentsService.getSettings();
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  updateSettings(@Body() dto: UpdatePaymentSettingsDto) {
    return this.paymentsService.updateSettings(dto);
  }

  // Endpoint público (sin guards): lo llama Stripe, no un socio logueado.
  // Mismo motivo que tienda-mueble/orders — necesita el body crudo para
  // verificar la firma (rawBody: true, ver main.ts).
  @Post('webhook/stripe')
  @HttpCode(200)
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Falta el body crudo o la firma de Stripe.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch (error) {
      throw new BadRequestException(`Firma de Stripe inválida: ${(error as Error).message}`);
    }

    await this.paymentsService.handleStripeWebhookEvent(event);
    return { received: true };
  }

  // Endpoint público (sin guards): lo llama Mercado Pago. La firma se
  // calcula sobre id/ts, no sobre el body, así que acá sí alcanza con
  // @Body() parseado (ver GymMercadoPagoService.verifyWebhookSignature).
  @Post('webhook/mercadopago')
  @HttpCode(200)
  async handleMercadoPagoWebhook(
    @Body() body: MercadoPagoWebhookBody,
    @Query('data.id') dataIdQuery: string | undefined,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    const dataId = body?.data?.id ?? dataIdQuery;
    if (!dataId) {
      throw new BadRequestException('Falta el id del pago en la notificación de Mercado Pago.');
    }

    try {
      this.mercadoPagoService.verifyWebhookSignature({ xSignature, xRequestId, dataId });
    } catch (error) {
      throw new BadRequestException(`Firma de Mercado Pago inválida: ${(error as Error).message}`);
    }

    // Igual que tienda-mueble: solo interesan las notificaciones de tipo
    // "payment", el resto se ignora sin error para no generar reintentos.
    if (body?.type && body.type !== 'payment') {
      return { received: true };
    }

    await this.paymentsService.handleMercadoPagoNotification(dataId);
    return { received: true };
  }
}
