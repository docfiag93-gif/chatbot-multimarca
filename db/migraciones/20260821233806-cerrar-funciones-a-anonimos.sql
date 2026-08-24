-- Cierre de permisos sobre las funciones SECURITY DEFINER.
--
-- Por qué hace falta aunque ya se hizo "revoke ... from public":
-- Supabase tiene privilegios por omisión que otorgan EXECUTE a los roles
-- `anon` y `authenticated` sobre toda funcion nueva. El revoke a PUBLIC no
-- los quita, porque son concesiones directas a esos roles. Hay que nombrarlos.
--
-- handle_new_user() es lo grave: es una funcion de DISPARADOR y quedo expuesta
-- en /rest/v1/rpc/handle_new_user. Cualquiera sin cuenta podia invocarla.
-- No debe poder llamarla NADIE desde la API: el disparador la ejecuta con los
-- privilegios de su dueño, no del que llama.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Las otras tres SÍ las necesita `authenticated`, y no es opcional: las
-- políticas de RLS las invocan, y una política solo puede llamar una funcion
-- que el rol que consulta tenga permiso de ejecutar. Si se revocan, las
-- políticas dejan de evaluar y el panel se queda sin ver nada.
-- A `anon` en cambio no le sirven para nada: no tiene sesión, siempre le
-- devolverían nulo, y solo sirven para que alguien husmee la forma de la API.
revoke all on function public.mi_empresa()    from anon;
revoke all on function public.es_superadmin() from anon;
revoke all on function public.es_dueno()      from anon;

grant execute on function public.mi_empresa()    to authenticated;
grant execute on function public.es_superadmin() to authenticated;
grant execute on function public.es_dueno()      to authenticated;
