import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { Order, OrderSchema } from './schemas/order.schema.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class GuitarsModule {}
