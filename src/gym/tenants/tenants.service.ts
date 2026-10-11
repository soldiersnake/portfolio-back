import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GYM_PLATFORM_CONNECTION } from '../gym-db.constants.js';
import { GymTenant, type GymTenantDocument } from './gym-tenant.schema.js';

// Acceso al directorio de gimnasios (`gymbro_platform.tenants`).
//
// Hasta la Fase D del roadmap la app sigue atendiendo a un solo gimnasio:
// `getCurrent()` devuelve el tenant cuyo slug está en GYM_TENANT_SLUG
// (ej. "okinawa"). En la Fase D se resuelve por el subdominio de cada request.
@Injectable()
export class GymTenantsService {
  constructor(
    @InjectModel(GymTenant.name, GYM_PLATFORM_CONNECTION)
    private readonly tenantModel: Model<GymTenantDocument>,
    private readonly config: ConfigService,
  ) {}

  findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug: slug.toLowerCase() }).exec();
  }

  findByStripeAccountId(accountId: string) {
    return this.tenantModel.findOne({ 'stripe.accountId': accountId }).exec();
  }

  async getCurrent(): Promise<GymTenantDocument> {
    const slug = this.config.get<string>('GYM_TENANT_SLUG');
    if (!slug) {
      throw new NotFoundException('GYM_TENANT_SLUG is not configured.');
    }
    const tenant = await this.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException(`Tenant "${slug}" not found in gymbro_platform.tenants.`);
    }
    return tenant;
  }
}
