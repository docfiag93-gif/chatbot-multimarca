// Envoltorio de Cloudflare Pages para el chat.
//
// Toda la lógica vive en chatbot/servidor/bot.mjs, que no sabe en qué
// plataforma corre. Aquí solo se traduce la forma de llamar:
//
//   Netlify:    (request, context)              y variables en process.env
//   Cloudflare: ({ request, env, waitUntil })   y variables en env
//
// Por eso este archivo es de diez líneas y no de cuatrocientas: mudarse de
// proveedor tiene que ser cambiar el enchufe, no rehacer la instalación.
import { manejar } from '../../servidor/bot.mjs';
import { ponerEntorno } from '../../publico/cerebro/entorno.mjs';

export async function onRequest(context) {
  ponerEntorno(context.env);
  // waitUntil se pasa con el nombre que espera el handler, para que los
  // avisos sigan corriendo después de haber respondido.
  return manejar(context.request, { waitUntil: (p) => context.waitUntil(p) });
}
