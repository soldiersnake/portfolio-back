import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { OrdersService } from './orders.service.js';
import { StripeService } from './stripe.service.js';
import { MercadoPagoService } from './mercadopago.service.js';
import { CreateTiendaMuebleOrderDto } from '../dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { TiendaMuebleAuthUser } from '../auth/auth.service.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

// Body que manda Mercado Pago a la webhook URL (ver
// https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/notifications/webhooks).
// Solo tipamos lo que efectivamente usamos: el resto (api_version, live_mode,
// user_id, etc.) no nos interesa acá.
interface MercadoPagoWebhookBody {
  type?: string;
  data?: { id?: string };
}

// El carrito en sí vive en el navegador (React state + localStorage, mismo
// patrón que GuitarTypercript), pero acá sí exigimos login: solo se llega a
// "Finalizar compra" logueado con Google, así el pedido queda asociado a un
// email verificado.
@Controller('tienda-mueble/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly stripeService: StripeService,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  // Crea el pedido (pending) + la Checkout Session de Stripe y devuelve la
  // URL a la que el frontend redirige (window.location.href). No hay
  // Stripe.js de por medio: es el checkout hospedado por Stripe.
  @Post('checkout-session')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  createCheckoutSession(@Body() dto: CreateTiendaMuebleOrderDto, @CurrentUser() user: TiendaMuebleAuthUser) {
    return this.ordersService.createCheckoutSession(dto, user);
  }

  // Misma idea que createCheckoutSession pero contra Mercado Pago Checkout
  // Pro (ver MercadoPagoService.createPreference).
  @Post('checkout-session/mercadopago')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  createMercadoPagoCheckout(@Body() dto: CreateTiendaMuebleOrderDto, @CurrentUser() user: TiendaMuebleAuthUser) {
    return this.ordersService.createMercadoPagoCheckout(dto, user);
  }

  // Usado por /pedido-confirmado (frontend) al volver de Stripe, para mostrar
  // el resumen del pedido. Ver OrdersService.findBySessionForUser para el
  // detalle de por qué se busca por session_id y se valida el dueño.
  @Get('by-session/:sessionId')
  @UseGuards(JwtAuthGuard)
  async getBySession(@Param('sessionId') sessionId: string, @CurrentUser() user: TiendaMuebleAuthUser) {
    const order = await this.ordersService.findBySessionForUser(sessionId, user.email);
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return order;
  }

  // Contraparte de getBySession para la vuelta de Mercado Pago: ver
  // OrdersService.findByIdForUser para el porqué de buscar por id en vez de
  // session id acá.
  @Get('by-id/:orderId')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('orderId') orderId: string, @CurrentUser() user: TiendaMuebleAuthUser) {
    const order = await this.ordersService.findByIdForUser(orderId, user.email);
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return order;
  }

  // Endpoint público (sin JwtAuthGuard): lo llama Stripe, no el usuario
  // logueado. La seguridad acá no es el login sino la verificación de firma
  // contra el body *sin parsear* — de ahí el @Req() en vez de @Body(),
  // necesitamos los bytes crudos (ver rawBody: true en main.ts).
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

    await this.ordersService.handleStripeWebhookEvent(event);
    return { received: true };
  }

  // Endpoint público (sin JwtAuthGuard): lo llama Mercado Pago, no el usuario
  // logueado. A diferencia de Stripe, la firma de Mercado Pago no se calcula
  // sobre el body sino sobre id/ts (ver MercadoPagoService.verifyWebhookSignature
  // y WebhookSignatureValidator del SDK), así que acá sí podemos usar @Body()
  // parseado en vez de necesitar los bytes crudos.
  @Post('webhook/mercadopago')
  @HttpCode(200)
  async handleMercadoPagoWebhook(
    @Body() body: MercadoPagoWebhookBody,
    @Query('data.id') dataIdQuery: string | undefined,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    // Mercado Pago manda el id del payment tanto en el body (data.id) como en
    // el query string (?data.id=...) — usamos el que haya, priorizando el
    // body porque es el que efectivamente entra en la firma junto al resto.
    const dataId = body?.data?.id ?? dataIdQuery;
    if (!dataId) {
      throw new BadRequestException('Falta el id del pago en la notificación de Mercado Pago.');
    }

    try {
      this.mercadoPagoService.verifyWebhookSignature({ xSignature, xRequestId, dataId });
    } catch (error) {
      throw new BadRequestException(`Firma de Mercado Pago inválida: ${(error as Error).message}`);
    }

    // Mercado Pago manda notificaciones de otros tipos además de "payment"
    // (merchant_order, point_integration_wh, etc.) — solo nos interesan los
    // pagos, el resto se ignora sin error para no generar reintentos.
    if (body?.type && body.type !== 'payment') {
      return { received: true };
    }

    await this.ordersService.handleMercadoPagoPaymentNotification(dataId);
    return { received: true };
  }
}
