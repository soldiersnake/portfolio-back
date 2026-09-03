import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TiendaMuebleOrderDocument = HydratedDocument<TiendaMuebleOrder>;

@Schema({ _id: false })
export class TiendaMuebleOrderItem {
  @Prop({ type: String, required: true })
  productId!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: Number, required: true })
  price!: number;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  @Prop({ type: String })
  image?: string;
}

export const TiendaMuebleOrderItemSchema = SchemaFactory.createForClass(TiendaMuebleOrderItem);

// Único proveedor de pago soportado por ahora. Se deja como string (no enum
// de Mongoose) para poder sumar 'mercadopago' en una etapa siguiente sin
// tener que migrar documentos existentes.
export type TiendaMueblePaymentProvider = 'stripe';
export type TiendaMueblePaymentStatus = 'pending' | 'paid' | 'failed';

// A diferencia del pedido de GuitarTypercript (anónimo, sin login), acá el
// carrito exige estar logueado con Google (ver AuthModule), así que cada
// pedido queda asociado al email verificado del usuario.
//
// El pedido se crea en estado "pending" al mismo tiempo que se abre la
// sesión de pago (ver OrdersService.createCheckoutSession) y recién pasa a
// "paid" cuando llega la confirmación asíncrona por webhook de la pasarela
// (ver OrdersService.handleStripeWebhookEvent) — nunca se confía en el
// redirect del navegador como confirmación de pago real.
@Schema({ timestamps: true, collection: 'tienda_mueble_orders' })
export class TiendaMuebleOrder {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  userEmail!: string;

  @Prop({ type: String, trim: true })
  userName?: string;

  @Prop({ type: [TiendaMuebleOrderItemSchema], required: true })
  items!: TiendaMuebleOrderItem[];

  @Prop({ type: Number, required: true, min: 0 })
  total!: number;

  @Prop({ type: String, required: true, trim: true })
  shippingAddress!: string;

  @Prop({ type: String, required: true, trim: true })
  postalCode!: string;

  // Derivados del postalCode en el backend (ver lib/spain-locations.ts) al
  // crear el pedido, nunca mandados por el cliente. Opcionales porque los
  // pedidos creados antes de sumar este campo no lo tienen.
  @Prop({ type: String, trim: true })
  provincia?: string;

  @Prop({ type: String, trim: true })
  comunidadAutonoma?: string;

  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, required: true, default: 'stripe' })
  paymentProvider!: TiendaMueblePaymentProvider;

  @Prop({ type: String, required: true, default: 'pending' })
  paymentStatus!: TiendaMueblePaymentStatus;

  // Id de la Checkout Session de Stripe asociada a este pedido. Sirve tanto
  // para recuperar el pedido desde el webhook (via metadata.orderId, pero
  // esto queda como respaldo/trazabilidad) como para debug manual en el
  // dashboard de Stripe.
  @Prop({ type: String })
  paymentReference?: string;
}

export const TiendaMuebleOrderSchema = SchemaFactory.createForClass(TiendaMuebleOrder);
