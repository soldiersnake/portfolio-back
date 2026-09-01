import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { UpsertCartDto } from './dto/upsert-cart.dto.js';

// Sin RateLimitGuard a propósito: a diferencia de /contact o /recommendations
// (que disparan un email por request), este endpoint solo escribe en Mongo y
// el frontend lo llama en cada cambio de carrito (agregar, +/-, quitar) —
// aplicarle el mismo límite de 5 req/10min de esos endpoints cortaría un uso
// normal del carrito. El frontend además debounce los cambios antes de
// pegarle al backend, así que el volumen real de requests es bajo.
@Controller('guitars/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get(':cartId')
  async find(@Param('cartId', new ParseUUIDPipe({ version: '4' })) cartId: string) {
    const cart = await this.cartService.find(cartId);
    return { cartId, items: cart?.items ?? [] };
  }

  @Put(':cartId')
  async upsert(
    @Param('cartId', new ParseUUIDPipe({ version: '4' })) cartId: string,
    @Body() dto: UpsertCartDto,
  ) {
    const cart = await this.cartService.upsert(cartId, dto);
    return { cartId, items: cart.items };
  }

  @Delete(':cartId')
  async clear(@Param('cartId', new ParseUUIDPipe({ version: '4' })) cartId: string) {
    await this.cartService.clear(cartId);
    return { cartId, items: [] };
  }
}
