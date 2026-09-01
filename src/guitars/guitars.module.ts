import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { Cart, CartSchema } from './schemas/cart.schema.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }])],
  controllers: [CartController],
  providers: [CartService],
})
export class GuitarsModule {}
