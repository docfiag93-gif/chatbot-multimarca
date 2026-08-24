# Las migraciones, tal como están aplicadas

Este directorio es el **registro fiel** de lo que le pasó a la base, exportado
desde Supabase (`supabase_migrations.schema_migrations`). Cada archivo es una
migración ya aplicada, con su fecha en el nombre para que el orden sea el orden
real en que corrieron.

## Por qué existe

Durante un tiempo la base fue por delante del repositorio: quince migraciones
aplicadas, tres archivos guardados. Doce cambios vivían únicamente dentro de
Supabase. Eso significa que el repositorio **no podía reconstruir la base** —
ni para levantar un segundo ambiente, ni para recuperarse de un accidente, ni
para entregarle el proyecto a alguien más.

Un repositorio que no puede reproducir su propia base de datos no es un
respaldo: es un archivo de texto con buenas intenciones.

## Cómo se usa

- **Para rearmar la base desde cero:** correr los archivos en orden de nombre.
- **Al agregar una migración nueva:** aplicarla en Supabase y exportarla aquí.
  Si solo se hace lo primero, vuelve la deuda que este directorio vino a pagar.
- **Después de cualquier migración:** correr `../99-probar-aislamiento.sql`.
  Los negocios separados son la promesa que se le vende a un colega, y esa
  promesa se comprueba, no se supone.

## Qué NO está aquí

Los archivos sueltos de `db/` (`01-esquema.sql`, `02-reportes.sql`,
`03-modo-del-bot.sql`) son los borradores escritos a mano antes de aplicarlos.
Se conservan por su prosa, pero **manda este directorio**: es lo que la base
de verdad tiene.
