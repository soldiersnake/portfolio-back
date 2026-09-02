import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export const PRODUCT_CATEGORIES = ['oficina', 'hogar', 'cocina', 'dormitorio'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

// A diferencia de GuitarTypercript (catálogo estático en el frontend), acá
// el catálogo sí vive en MongoDB: el admin (Mariano, ver AdminGuard) da de
// alta/edita/elimina productos desde el panel /admin del frontend.
@Schema({ timestamps: true, collection: 'tienda_mueble_products' })
export class Product {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true, unique: true })
  slug!: string;

  @Prop({ type: String, required: true, enum: PRODUCT_CATEGORIES })
  category!: ProductCategory;

  @Prop({ type: String, required: true, trim: true })
  tagline!: string;

  @Prop({ type: String, required: true, trim: true })
  description!: string;

  @Prop({ type: Number, required: true, min: 0 })
  price!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  stock!: number;

  // URLs absolutas: para los 6 productos originales del sitio estático son
  // rutas relativas servidas desde /img/productos/* (frontend público); para
  // los productos que se den de alta desde el CRUD son URLs de ImageKit
  // (ver ImageKitService), ya que Render no tiene disco persistente.
  @Prop({ type: [String], required: true, default: [] })
  images!: string[];

  @Prop({ type: Boolean, default: false })
  featured!: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
