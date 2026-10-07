import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GymCenter, type GymCenterDocument, type GymCenterScheduleSlot } from '../schemas/gym-center.schema.js';
import { GymImageKitService } from '../users/gym-imagekit.service.js';
import type { CreateGymCenterDto } from './dto/create-center.dto.js';
import type { UpdateGymCenterDto } from './dto/update-center.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymCenterSummary {
  id: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  schedule: GymCenterScheduleSlot[];
  amenities: string[];
  photos: string[];
  googleMapsUrl?: string;
  isActive: boolean;
}

@Injectable()
export class GymCentersService {
  constructor(
    @InjectModel(GymCenter.name, GYM_DB_CONNECTION) private readonly centerModel: Model<GymCenterDocument>,
    private readonly imageKitService: GymImageKitService,
  ) {}

  // Listado (dentro de la app, requiere sesión) de sedes activas — el socio
  // necesita ver horario/dirección/servicios para elegir dónde entrenar. Sin
  // filtro por admin: para el MVP cualquier socio autenticado ve las 3 sedes
  // hardcodeadas (ver PLANNING.md sección 2.3 y scripts/seed-gym-centers.ts).
  async listActive(): Promise<GymCenterSummary[]> {
    const centers = await this.centerModel.find({ isActive: true }).sort({ name: 1 });
    return centers.map((center) => this.toSummary(center));
  }

  async findById(id: string): Promise<GymCenterSummary> {
    const center = await this.centerModel.findById(id);
    if (!center) {
      throw new NotFoundException('Center not found.');
    }
    return this.toSummary(center);
  }

  // Panel admin "Gestión de sedes" (solo superadmin, ver centers.controller.ts)
  // — a diferencia de listActive(), incluye las desactivadas para que se
  // puedan reactivar.
  async listAllForAdmin(): Promise<GymCenterSummary[]> {
    const centers = await this.centerModel.find().sort({ name: 1 });
    return centers.map((center) => this.toSummary(center));
  }

  async create(dto: CreateGymCenterDto): Promise<GymCenterSummary> {
    const created = await this.centerModel.create({
      name: dto.name,
      address: dto.address,
      city: dto.city,
      phone: dto.phone,
      email: dto.email,
      schedule: dto.schedule ?? [],
      amenities: dto.amenities ?? [],
      photos: dto.photos ?? [],
      googleMapsUrl: dto.googleMapsUrl,
    });
    return this.toSummary(created);
  }

  async update(id: string, dto: UpdateGymCenterDto): Promise<GymCenterSummary> {
    const center = await this.centerModel.findById(id);
    if (!center) {
      throw new NotFoundException('Center not found.');
    }

    if (dto.name !== undefined) center.name = dto.name;
    if (dto.address !== undefined) center.address = dto.address;
    if (dto.city !== undefined) center.city = dto.city;
    if (dto.phone !== undefined) center.phone = dto.phone;
    if (dto.email !== undefined) center.email = dto.email;
    if (dto.schedule !== undefined) center.schedule = dto.schedule;
    if (dto.amenities !== undefined) center.amenities = dto.amenities;
    if (dto.photos !== undefined) center.photos = dto.photos;
    if (dto.googleMapsUrl !== undefined) center.googleMapsUrl = dto.googleMapsUrl;
    if (dto.isActive !== undefined) center.isActive = dto.isActive;

    await center.save();
    return this.toSummary(center);
  }

  // Sube una foto y la agrega al array `photos` (no reemplaza las existentes)
  // — a diferencia de la foto de perfil/clase, una sede puede tener varias.
  // Sin endpoint para borrar una foto puntual por ahora: se edita `photos` a
  // mano vía PATCH (pasando el array completo sin la URL que se quiere sacar)
  // igual que antes de sumar upload — alcanza para el volumen de fotos por
  // sede que se espera en el MVP.
  async addPhoto(id: string, file?: Express.Multer.File): Promise<GymCenterSummary> {
    if (!file) {
      throw new BadRequestException('No image file was provided.');
    }

    const center = await this.centerModel.findById(id);
    if (!center) {
      throw new NotFoundException('Center not found.');
    }

    const url = await this.imageKitService.uploadCenterPhoto(file);
    center.photos = [...center.photos, url];
    await center.save();
    return this.toSummary(center);
  }

  // Usado por otros módulos (memberships/classes/checkins) para validar que
  // un centerId recibido en un DTO realmente existe antes de asignarlo, sin
  // duplicar el findById + NotFoundException en cada lugar.
  async assertExists(id: Types.ObjectId): Promise<void> {
    const exists = await this.centerModel.exists({ _id: id });
    if (!exists) {
      throw new NotFoundException('Center not found.');
    }
  }

  private toSummary(center: GymCenterDocument): GymCenterSummary {
    return {
      id: center._id.toString(),
      name: center.name,
      address: center.address,
      city: center.city,
      phone: center.phone,
      email: center.email,
      schedule: center.schedule,
      amenities: center.amenities,
      photos: center.photos,
      googleMapsUrl: center.googleMapsUrl,
      isActive: center.isActive,
    };
  }
}
