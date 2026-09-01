import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';

// A diferencia del viejo endpoint de carrito (que se llamaba en cada
// agregar/quitar/±cantidad), este solo se llama una vez, al finalizar la
// compra — mismo patrón de uso que /contact, así que sí le aplicamos el
// RateLimitGuard.
@Controller('guitars/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  async create(@Body() dto: CreateOrderDto) {
    const order = await this.orderService.create(dto);
    return order;
  }
}
