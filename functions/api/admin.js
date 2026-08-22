// Envoltorio de Cloudflare Pages para el panel. Ver functions/api/bot.js.
import { manejar } from '../../servidor/admin.mjs';
import { ponerEntorno } from '../../servidor/nucleo/entorno.mjs';

export async function onRequest(context) {
  ponerEntorno(context.env);
  return manejar(context.request, { waitUntil: (p) => context.waitUntil(p) });
}
