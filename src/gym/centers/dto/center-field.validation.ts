import { Transform } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

// Teléfono español: 9 dígitos que empiezan por 6, 7 (móviles), 8 o 9
// (fijos), con prefijo internacional opcional (+34 o 0034). Antes de validar
// se sacan espacios, puntos, guiones y paréntesis, así "+34 623 91 28 47" o
// "623-912-847" se guardan normalizados como "+34623912847" / "623912847".
// Mismo regex que el frontend (AdminSedesPage) para que ambos lados
// coincidan.
export const SPANISH_PHONE_REGEX = /^(?:\+34|0034)?[6789]\d{8}$/;

export function IsSpanishPhone() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.\-()]/g, '') : value)),
    Matches(SPANISH_PHONE_REGEX, { message: 'phone must be a valid Spanish phone number' }),
  );
}

// Link de Google Maps: acepta los formatos que genera "Compartir" en Maps
// (maps.app.goo.gl/..., goo.gl/maps/...) y los links largos
// (google.com/maps/..., google.es/maps/..., maps.google.com/...). Mismo
// regex que el frontend (AdminSedesPage).
export const GOOGLE_MAPS_URL_REGEX =
  /^https?:\/\/(?:(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?\/maps|maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?|maps\.app\.goo\.gl|goo\.gl\/maps)(?:[/?#]\S*)?$/i;

export function IsGoogleMapsUrl() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    Matches(GOOGLE_MAPS_URL_REGEX, { message: 'googleMapsUrl must be a Google Maps link' }),
  );
}
