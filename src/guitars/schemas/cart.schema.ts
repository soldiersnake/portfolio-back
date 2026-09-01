import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

// Item embebido dentro de un carrito. No usa su propio _id de Mongo como
// identificador de negocio: 'guitarId' referencia el id de la guitarra en el
// catálogo estático del frontend (src/data/db.ts en GuitarTypercript).
@Schema({ _id: false })
export class CartItem {
  @Prop({ required: true })
  guitarId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  price!: number;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop()
  image?: string;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

// Carrito anónimo: no hay login, así que se identifica por un UUID que el
// frontend genera y guarda en localStorage (ver useCart en GuitarTypercript).
// Guardamos el carrito completo (upsert) en cada cambio en vez de items
// sueltos: es más simple de razonar y el volumen de datos es mínimo.
@Schema({ timestamps: true, collection: 'guitar_shop_carts' })
export class Cart {
  @Prop({ required: true, unique: true, index: true })
  cartId!: string;

  @Prop({ type: [CartItemSchema], default: [] })
  items!: CartItem[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);
