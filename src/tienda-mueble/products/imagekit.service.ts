import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';

/**
 * Almacenamiento de imágenes para productos dados de alta desde el CRUD.
 *
 * Se eligió ImageKit (plan gratuito, sin tarjeta) en vez de:
 *  - Guardar el binario en MongoDB: infla los documentos y degrada
 *    performance de lecturas del catálogo.
 *  - Disco local en Render: el plan free no tiene disco persistente, así
 *    que cualquier imagen subida se perdería en el próximo deploy/restart.
 *  - Cloudinary: reemplazado tras un bloqueo de cuenta sin causa clara.
 *
 * Las imágenes de los 6 productos originales del sitio estático NO pasan
 * por acá: siguen siendo archivos estáticos servidos por el frontend en
 * /img/productos/*, cargados una sola vez por el script de seed.
 */
@Injectable()
export class ImageKitService {
  private readonly logger = new Logger(ImageKitService.name);
  private readonly configured: boolean;
  private readonly imagekit?: ImageKit;

  constructor(private readonly config: ConfigService) {
    const publicKey = this.config.get<string>('IMAGEKIT_PUBLIC_KEY');
    const privateKey = this.config.get<string>('IMAGEKIT_PRIVATE_KEY');
    const urlEndpoint = this.config.get<string>('IMAGEKIT_URL_ENDPOINT');
    this.configured = Boolean(publicKey && privateKey && urlEndpoint);

    if (this.configured) {
      this.imagekit = new ImageKit({ publicKey: publicKey!, privateKey: privateKey!, urlEndpoint: urlEndpoint! });
    } else {
      this.logger.warn(
        'IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT are not set — product image uploads will fail until configured.',
      );
    }
  }

  async uploadProductImage(file: Express.Multer.File): Promise<string> {
    if (!this.configured || !this.imagekit) {
      throw new InternalServerErrorException('Image storage is not configured on the server.');
    }

    try {
      const result = await this.imagekit.upload({
        file: file.buffer,
        fileName: file.originalname || `product-${Date.now()}`,
        folder: '/tienda-mueble/products',
        useUniqueFileName: true,
      });
      return result.url;
    } catch (error) {
      this.logger.error('ImageKit upload failed', error as Error);
      throw new InternalServerErrorException('Failed to upload image.');
    }
  }
}
