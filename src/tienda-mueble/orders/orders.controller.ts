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
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { OrdersService } from './orders.service.js';
import { StripeService } from './stripe.service.js';
import { CreateTiendaMuebleOrderDto } from '../dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { TiendaMuebleAuthUser } from '../auth/auth.service.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

// El carrito en sí vive en el navegador (React state + localStorage, mismo
// patrón que GuitarTypercript), pero acá sí exigimos login: solo se llega a
// "Finalizar compra" logueado con Google, así el pedido queda asociado a un
// email verificado.
@Controller('tienda-mueble/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly stripeService: StripeService,
  ) {}

  // Crea el pedido (pending) + la Checkout Session de Stripe y devuelve la
  // URL a la que el frontend redirige (window.location.href). No hay
  // Stripe.js de por medio: es el checkout hospedado por Stripe.
  @Post('checkout-session')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  createCheckoutSession(@Body() dto: CreateTiendaMuebleOrderDto, @CurrentUser() user: TiendaMuebleAuthUser) {
    return this.ordersService.createCheckoutSession(dto, user);
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
}
