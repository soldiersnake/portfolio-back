import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';

/**
 * Almacenamiento de imágenes de GymBro (foto de perfil del socio, foto de
 * clase, fotos de sede). Mismo criterio que ImageKitService de
 * tienda-mueble/products (ver ese archivo para el porqué de ImageKit sobre
 * Mongo/disco local/Cloudinary): reutiliza la MISMA cuenta de ImageKit (las
 * credenciales IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT ya configuradas
 * para tienda-mueble), solo cambia la carpeta de destino según el recurso.
 * Se duplica el servicio en vez de importar el de tienda-mueble porque cada
 * módulo de GymBro se mantiene independiente (mismo criterio que el resto
 * del backend compartido, ver auth/users de gym vs tienda-mueble). Vive en
 * gym/users/ por motivos históricos (nació solo para la foto de perfil) pero
 * ya es un provider compartido de todo GymModule (ver gym.module.ts) —
 * classes/centers lo inyectan igual que users.
 */
@Injectable()
export class GymImageKitService {
  private readonly logger = new Logger(GymImageKitService.name);
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
        'IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT are not set — gym image uploads (profile/class/center) will fail until configured.',
      );
    }
  }

  async uploadProfilePhoto(file: Express.Multer.File): Promise<string> {
    return this.upload(file, '/gymbro/profile-photos', 'gym-profile');
  }

  async uploadClassImage(file: Express.Multer.File): Promise<string> {
    return this.upload(file, '/gymbro/class-images', 'gym-class');
  }

  async uploadCenterPhoto(file: Express.Multer.File): Promise<string> {
    return this.upload(file, '/gymbro/center-photos', 'gym-center');
  }

  private async upload(file: Express.Multer.File, folder: string, fileNamePrefix: string): Promise<string> {
    if (!this.configured || !this.imagekit) {
      throw new InternalServerErrorException('Image storage is not configured on the server.');
    }

    try {
      const result = await this.imagekit.upload({
        file: file.buffer,
        fileName: file.originalname || `${fileNamePrefix}-${Date.now()}`,
        folder,
        useUniqueFileName: true,
      });
      return result.url;
    } catch (error) {
      this.logger.error('ImageKit upload failed', error as Error);
      throw new InternalServerErrorException('Failed to upload image.');
    }
  }
}
