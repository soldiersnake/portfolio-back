import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema.js';
import { TiendaMuebleOrder, TiendaMuebleOrderSchema } from './schemas/order.schema.js';
import { TiendaMuebleContact, TiendaMuebleContactSchema } from './schemas/contact.schema.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { ProductsService } from './products/products.service.js';
import { ProductsController } from './products/products.controller.js';
import { ImageKitService } from './products/imagekit.service.js';
import { OrdersService } from './orders/orders.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { StripeService } from './orders/stripe.service.js';
import { TiendaMuebleContactService } from './contact/contact.service.js';
import { TiendaMuebleContactController } from './contact/contact.controller.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: TiendaMuebleOrder.name, schema: TiendaMuebleOrderSchema },
      { name: TiendaMuebleContact.name, schema: TiendaMuebleContactSchema },
    ]),
    EmailModule,
    // JWT propio de esta app (no confundir con el idToken de Google, que
    // solo se usa una vez, en /tienda-mueble/auth/google, para verificar
    // identidad). Vida corta porque el rol de admin depende de un solo
    // email hardcodeado y no hay revocación de tokens.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('TIENDA_MUEBLE_JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController, ProductsController, OrdersController, TiendaMuebleContactController],
  providers: [AuthService, ProductsService, ImageKitService, OrdersService, StripeService, TiendaMuebleContactService],
})
export class TiendaMuebleModule {}
