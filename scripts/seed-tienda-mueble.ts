/**
 * Carga los 6 productos originales del sitio estático de TiendaMueble en
 * MongoDB. Sus imágenes NO pasan por Cloudinary: son archivos estáticos
 * servidos por el frontend en /img/productos/*, así que acá solo guardamos
 * esas rutas relativas.
 *
 * Es idempotente: si un producto con el mismo slug ya existe, lo actualiza
 * en vez de duplicarlo — se puede correr de nuevo sin miedo.
 *
 * Uso: npm run seed:tienda-mueble   (desde portfolio-app/backend)
 * Requiere MONGODB_URI en .env (mismo que usa el resto del backend).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ProductSchema } from '../src/tienda-mueble/schemas/product.schema.js';

const products = [
  {
    name: 'Aparador Nórdico Roble',
    slug: 'aparador-nordico-roble',
    category: 'hogar' as const,
    tagline: 'Almacenamiento con líneas escandinavas y patas en ángulo.',
    description:
      'Aparador de dos cuerpos en roble y madera oscura, con un cajón amplio y un compartimento abierto ideal para lucir objetos de decoración. Sus patas finas en ángulo le dan ese aire escandinavo atemporal que combina con living y comedor por igual.',
    price: 549,
    stock: 8,
    images: ['/img/productos/producto1.jpg'],
    featured: true,
  },
  {
    name: 'Set de Living Artesanal',
    slug: 'set-de-living-artesanal',
    category: 'hogar' as const,
    tagline: 'Sofá modular profundo + mesas ratona de madera maciza.',
    description:
      'Sofá modular de gran profundidad tapizado en tela gris topo, pensado para hundirse un domingo entero. Se completa con un dúo de mesas ratona de madera maciza que se acomodan una junto a la otra o se separan según lo necesites.',
    price: 899,
    stock: 5,
    images: ['/img/productos/producto2.jpg'],
    featured: true,
  },
  {
    name: 'Sofá Capitoné Gris Perla',
    slug: 'sofa-capitone-gris-perla',
    category: 'hogar' as const,
    tagline: 'Tres cuerpos con respaldo capitoné y apoyabrazos rectos.',
    description:
      'Sofá de tres cuerpos tapizado en pana gris perla, con respaldo capitoné y apoyabrazos rectos que le dan un perfil clásico renovado. Estructura de madera maciza y patas torneadas en tono nogal.',
    price: 749,
    stock: 6,
    images: ['/img/productos/producto3.jpg'],
    featured: true,
  },
  {
    name: 'Mesa Bistró Redonda + Sillas',
    slug: 'mesa-bistro-redonda-sillas',
    category: 'cocina' as const,
    tagline: 'Mesa base blanca con tapa redonda + 2 sillas de madera curvada.',
    description:
      'Mesa redonda de estilo bistró con base metálica blanca y tapa lacada, acompañada de sillas de madera curvada tapizadas en cuero ecológico negro. Perfecta para desayunos o espacios reducidos que no quieren resignar estilo.',
    price: 429,
    stock: 12,
    images: ['/img/productos/producto4.jpg'],
    featured: true,
  },
  {
    name: 'Combo Dormitorio Confort',
    slug: 'combo-dormitorio-confort',
    category: 'dormitorio' as const,
    tagline: 'Cama tapizada + mesa de luz en madera clara.',
    description:
      'Cama con cabecera tapizada en gris topo y mesa de luz a juego en madera clara, con dos cajones para guardar lo esencial. Un combo pensado para dormitorios luminosos y con espíritu minimalista.',
    price: 649,
    stock: 4,
    images: ['/img/productos/producto5.jpg'],
    featured: true,
  },
  {
    name: 'Cabecera Iluminada Roble',
    slug: 'cabecera-iluminada-roble',
    category: 'dormitorio' as const,
    tagline: 'Panel de roble de pared a pared con luces empotradas.',
    description:
      'Panel de roble que cubre la pared del respaldo de punta a punta, con luces empotradas y dos mesitas flotantes integradas al mismo módulo. Transforma cualquier dormitorio en una suite con onda hotel boutique.',
    price: 699,
    stock: 3,
    images: ['/img/productos/producto6.jpg'],
    featured: true,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const ProductModel = mongoose.model('Product', ProductSchema, 'tienda_mueble_products');

  for (const product of products) {
    await ProductModel.updateOne({ slug: product.slug }, { $set: product }, { upsert: true });
    console.log(`Upserted: ${product.name}`);
  }

  await mongoose.disconnect();
  console.log(`Done — ${products.length} products seeded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
