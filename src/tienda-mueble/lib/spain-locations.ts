// Espejo del mapa de provincias que usa el frontend de TiendaMueble
// (TiendaMueble/src/lib/spainLocations.ts). Se duplica acá (en vez de
// compartir un paquete) porque son proyectos separados; son datos fijos y
// públicos del INE que no cambian, así que el mantenimiento manual es
// mínimo. Se usa para derivar provincia/comunidad autónoma del código
// postal ya validado por el DTO, y guardarlas en el pedido — nunca se
// confía en un valor de provincia mandado por el cliente.
const SPAIN_PROVINCES: Record<string, { provincia: string; comunidadAutonoma: string }> = {
  '01': { provincia: 'Álava', comunidadAutonoma: 'País Vasco' },
  '02': { provincia: 'Albacete', comunidadAutonoma: 'Castilla-La Mancha' },
  '03': { provincia: 'Alicante', comunidadAutonoma: 'Comunidad Valenciana' },
  '04': { provincia: 'Almería', comunidadAutonoma: 'Andalucía' },
  '05': { provincia: 'Ávila', comunidadAutonoma: 'Castilla y León' },
  '06': { provincia: 'Badajoz', comunidadAutonoma: 'Extremadura' },
  '07': { provincia: 'Balears (Illes)', comunidadAutonoma: 'Islas Baleares' },
  '08': { provincia: 'Barcelona', comunidadAutonoma: 'Cataluña' },
  '09': { provincia: 'Burgos', comunidadAutonoma: 'Castilla y León' },
  '10': { provincia: 'Cáceres', comunidadAutonoma: 'Extremadura' },
  '11': { provincia: 'Cádiz', comunidadAutonoma: 'Andalucía' },
  '12': { provincia: 'Castellón', comunidadAutonoma: 'Comunidad Valenciana' },
  '13': { provincia: 'Ciudad Real', comunidadAutonoma: 'Castilla-La Mancha' },
  '14': { provincia: 'Córdoba', comunidadAutonoma: 'Andalucía' },
  '15': { provincia: 'Coruña (A)', comunidadAutonoma: 'Galicia' },
  '16': { provincia: 'Cuenca', comunidadAutonoma: 'Castilla-La Mancha' },
  '17': { provincia: 'Girona', comunidadAutonoma: 'Cataluña' },
  '18': { provincia: 'Granada', comunidadAutonoma: 'Andalucía' },
  '19': { provincia: 'Guadalajara', comunidadAutonoma: 'Castilla-La Mancha' },
  '20': { provincia: 'Guipúzcoa', comunidadAutonoma: 'País Vasco' },
  '21': { provincia: 'Huelva', comunidadAutonoma: 'Andalucía' },
  '22': { provincia: 'Huesca', comunidadAutonoma: 'Aragón' },
  '23': { provincia: 'Jaén', comunidadAutonoma: 'Andalucía' },
  '24': { provincia: 'León', comunidadAutonoma: 'Castilla y León' },
  '25': { provincia: 'Lleida', comunidadAutonoma: 'Cataluña' },
  '26': { provincia: 'Rioja (La)', comunidadAutonoma: 'La Rioja' },
  '27': { provincia: 'Lugo', comunidadAutonoma: 'Galicia' },
  '28': { provincia: 'Madrid', comunidadAutonoma: 'Comunidad de Madrid' },
  '29': { provincia: 'Málaga', comunidadAutonoma: 'Andalucía' },
  '30': { provincia: 'Murcia', comunidadAutonoma: 'Región de Murcia' },
  '31': { provincia: 'Navarra', comunidadAutonoma: 'Comunidad Foral de Navarra' },
  '32': { provincia: 'Ourense', comunidadAutonoma: 'Galicia' },
  '33': { provincia: 'Asturias', comunidadAutonoma: 'Principado de Asturias' },
  '34': { provincia: 'Palencia', comunidadAutonoma: 'Castilla y León' },
  '35': { provincia: 'Palmas (Las)', comunidadAutonoma: 'Canarias' },
  '36': { provincia: 'Pontevedra', comunidadAutonoma: 'Galicia' },
  '37': { provincia: 'Salamanca', comunidadAutonoma: 'Castilla y León' },
  '38': { provincia: 'Santa Cruz de Tenerife', comunidadAutonoma: 'Canarias' },
  '39': { provincia: 'Cantabria', comunidadAutonoma: 'Cantabria' },
  '40': { provincia: 'Segovia', comunidadAutonoma: 'Castilla y León' },
  '41': { provincia: 'Sevilla', comunidadAutonoma: 'Andalucía' },
  '42': { provincia: 'Soria', comunidadAutonoma: 'Castilla y León' },
  '43': { provincia: 'Tarragona', comunidadAutonoma: 'Cataluña' },
  '44': { provincia: 'Teruel', comunidadAutonoma: 'Aragón' },
  '45': { provincia: 'Toledo', comunidadAutonoma: 'Castilla-La Mancha' },
  '46': { provincia: 'Valencia', comunidadAutonoma: 'Comunidad Valenciana' },
  '47': { provincia: 'Valladolid', comunidadAutonoma: 'Castilla y León' },
  '48': { provincia: 'Vizcaya', comunidadAutonoma: 'País Vasco' },
  '49': { provincia: 'Zamora', comunidadAutonoma: 'Castilla y León' },
  '50': { provincia: 'Zaragoza', comunidadAutonoma: 'Aragón' },
  '51': { provincia: 'Ceuta', comunidadAutonoma: 'Ceuta' },
  '52': { provincia: 'Melilla', comunidadAutonoma: 'Melilla' },
};

/**
 * Provincia + comunidad autónoma para un código postal español válido de 5
 * dígitos, o undefined si el código no matchea ninguna provincia (no
 * debería pasar en la práctica, porque el DTO ya valida el formato antes
 * de llegar acá, pero se devuelve undefined en vez de tirar error por las
 * dudas).
 */
export function getSpanishLocationFromPostalCode(
  value: string,
): { provincia: string; comunidadAutonoma: string } | undefined {
  if (!/^\d{5}$/.test(value)) return undefined;
  return SPAIN_PROVINCES[value.slice(0, 2)];
}
