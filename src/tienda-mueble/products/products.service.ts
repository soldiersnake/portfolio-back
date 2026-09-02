import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import { Product, ProductDocument, ProductCategory } from '../schemas/product.schema.js';
import { CreateProductDto } from '../dto/create-product.dto.js';
import { UpdateProductDto } from '../dto/update-product.dto.js';
import { ImageKitService } from './imagekit.service.js';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly imagekit: ImageKitService,
  ) {}

  findAll(category?: ProductCategory): Promise<Product[]> {
    const filter: QueryFilter<Product> = category ? { category } : {};
    return this.productModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productModel.findById(id).lean();
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  async create(dto: CreateProductDto, file?: Express.Multer.File): Promise<Product> {
    const images: string[] = [];
    if (file) images.push(await this.imagekit.uploadProductImage(file));

    const baseSlug = slugify(dto.name);
    let slug = baseSlug || 'producto';
    let attempt = 1;
    while (await this.productModel.exists({ slug })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const created = await this.productModel.create({
      name: dto.name,
      slug,
      category: dto.category,
      tagline: dto.tagline,
      description: dto.description,
      price: dto.price,
      stock: dto.stock,
      featured: dto.featured ?? false,
      images,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpdateProductDto, file?: Express.Multer.File): Promise<Product> {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('Product not found.');

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.category !== undefined) product.category = dto.category;
    if (dto.tagline !== undefined) product.tagline = dto.tagline;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.featured !== undefined) product.featured = dto.featured;

    // Subir una imagen nueva reemplaza la existente; si no se manda archivo,
    // se conserva la que ya tenía el producto.
    if (file) {
      product.images = [await this.imagekit.uploadProductImage(file)];
    }

    await product.save();
    return product.toObject();
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Product not found.');
  }
}
