export const SUPABASE_SERVER_SECRET_VARIABLES = [
  "BERRY_STREET_SUPABASE_SERVER_SECRET",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function selectSupabaseServerSecretVariable(environment: NodeJS.ProcessEnv = process.env) {
  return (
    SUPABASE_SERVER_SECRET_VARIABLES.find((variableName) => Boolean(environment[variableName])) ??
    null
  );
}

export function resolveSupabaseServerConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = environment.SUPABASE_URL;
  const serverSecretVariable = selectSupabaseServerSecretVariable(environment);

  if (!supabaseUrl || !serverSecretVariable) {
    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!serverSecretVariable ? ["a Supabase server secret"] : []),
    ];
    const acceptedSecretVariables = SUPABASE_SERVER_SECRET_VARIABLES.join(", ");
    throw new Error(
      `Missing Supabase server configuration: ${missing.join(", ")}. ` +
        `Accepted server secret variables, in priority order: ${acceptedSecretVariables}.`,
    );
  }

  return { supabaseUrl, serverSecretVariable };
}
