// Envoltorio de Cloudflare Pages para WhatsApp.
//
// Meta llama a esta ruta de dos formas: un GET para verificar el webhook al
// darlo de alta, y un POST por cada mensaje que entra. Las dos las atiende
// el mismo manejador, que no sabe en qué plataforma corre.
import { manejar } from '../../servidor/whatsapp.mjs';
import { ponerEntorno } from '../../servidor/nucleo/entorno.mjs';

export async function onRequest(context) {
  ponerEntorno(context.env);
  return manejar(context.request, { waitUntil: (p) => context.waitUntil(p) });
}
