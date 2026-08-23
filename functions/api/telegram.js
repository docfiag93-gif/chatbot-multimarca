// Envoltorio de Cloudflare Pages para Telegram.
import { manejar } from '../../servidor/telegram.mjs';
import { ponerEntorno } from '../../servidor/nucleo/entorno.mjs';

export async function onRequest(context) {
  ponerEntorno(context.env);
  return manejar(context.request, { waitUntil: (p) => context.waitUntil(p) });
}
