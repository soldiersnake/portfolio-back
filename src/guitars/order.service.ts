import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Injectable()
export class OrderService {
  constructor(@InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    // El total lo calculamos acá (no confiamos en un total mandado por el
    // cliente) a partir de los items ya validados por el DTO.
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const created = await this.orderModel.create({ items: dto.items, total });
    return created.toObject();
  }
}
