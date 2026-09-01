import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cart, CartDocument } from './schemas/cart.schema.js';
import { UpsertCartDto } from './dto/upsert-cart.dto.js';

@Injectable()
export class CartService {
  constructor(@InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>) {}

  async find(cartId: string): Promise<Cart | null> {
    return this.cartModel.findOne({ cartId }).lean();
  }

  async upsert(cartId: string, dto: UpsertCartDto): Promise<Cart> {
    return this.cartModel
      .findOneAndUpdate(
        { cartId },
        { $set: { items: dto.items } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean();
  }

  async clear(cartId: string): Promise<void> {
    await this.cartModel.findOneAndUpdate({ cartId }, { $set: { items: [] } }, { upsert: true });
  }
}
