import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

// Item embebido dentro de un pedido. 'guitarId' referencia el id de la
// guitarra en el catálogo estático del frontend (src/data/db.ts en
// GuitarTypercript) — el catálogo en sí no vive en esta base de datos.
@Schema({ _id: false })
export class OrderItem {
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

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

// El carrito en sí vive solo en el navegador (React state + localStorage,
// ver useCart en GuitarTypercript) — el backend no se entera de nada hasta
// que el usuario finaliza la compra. En ese momento se guarda un snapshot
// del pedido como historial. No hay login, así que no queda asociado a
// ningún usuario; es solo un registro de "esto se compró".
@Schema({ timestamps: true, collection: 'guitar_shop_orders' })
export class Order {
  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  @Prop({ required: true, min: 0 })
  total!: number;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
