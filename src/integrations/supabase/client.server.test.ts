/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  SUPABASE_SERVER_SECRET_VARIABLES,
  resolveSupabaseServerConfiguration,
  selectSupabaseServerSecretVariable,
} from "./server-secret.server.ts";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(path)
        ? [path]
        : [];
  });
}

test("custom Lovable server secret takes precedence over compatibility variables", () => {
  const environment = {
    SUPABASE_URL: "https://example.invalid",
    BERRY_STREET_SUPABASE_SERVER_SECRET: "custom-secret",
    SUPABASE_SECRET_KEY: "secret-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };

  assert.equal(
    resolveSupabaseServerConfiguration(environment).serverSecretVariable,
    "BERRY_STREET_SUPABASE_SERVER_SECRET",
  );
});

test("server secret selection preserves both compatibility fallbacks", () => {
  assert.equal(
    selectSupabaseServerSecretVariable({
      SUPABASE_SECRET_KEY: "secret-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    }),
    "SUPABASE_SECRET_KEY",
  );
  assert.equal(
    selectSupabaseServerSecretVariable({
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    }),
    "SUPABASE_SERVICE_ROLE_KEY",
  );
});

test("missing server secret selection remains explicit and safe", () => {
  assert.equal(selectSupabaseServerSecretVariable({}), null);
  let missingSecretError: unknown;
  try {
    resolveSupabaseServerConfiguration({
      SUPABASE_URL: "https://example.invalid",
    });
    assert.fail("missing server secret should reject configuration");
  } catch (error) {
    missingSecretError = error;
  }
  assert.ok(missingSecretError instanceof Error);
  assert.match(missingSecretError.message, /Missing Supabase server configuration/);
  for (const variableName of SUPABASE_SERVER_SECRET_VARIABLES) {
    assert.match(missingSecretError.message, new RegExp(variableName));
  }
  assert.doesNotMatch(missingSecretError.message, /https:\/\/example\.invalid/);

  const source =
    read("src/integrations/supabase/client.server.ts") +
    read("src/integrations/supabase/server-secret.server.ts");
  for (const variableName of SUPABASE_SERVER_SECRET_VARIABLES) {
    assert.match(source, new RegExp(variableName));
  }
  assert.match(source, /Missing Supabase server configuration/);
  assert.match(source, /Accepted server secret variables, in priority order/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\(/);
});

test("server secrets remain out of browser-safe source and Vite variables", () => {
  const serverModule = join(process.cwd(), "src/integrations/supabase/client.server.ts");
  const serverSecretModule = join(
    process.cwd(),
    "src/integrations/supabase/server-secret.server.ts",
  );
  const testModule = join(process.cwd(), "src/integrations/supabase/client.server.test.ts");
  const browserSafeSources = sourceFiles(join(process.cwd(), "src")).filter(
    (path) =>
      path !== serverModule &&
      path !== serverSecretModule &&
      path !== testModule &&
      !path.endsWith(".test.ts") &&
      !path.endsWith(".test.tsx"),
  );

  for (const path of browserSafeSources) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /BERRY_STREET_SUPABASE_SERVER_SECRET/);
    assert.doesNotMatch(source, /VITE_(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/);
  }

  for (const browserDirectory of ["src/routes", "src/components", "src/hooks"]) {
    for (const path of sourceFiles(join(process.cwd(), browserDirectory)).filter(
      (sourcePath) => !sourcePath.endsWith(".test.ts") && !sourcePath.endsWith(".test.tsx"),
    )) {
      const source = readFileSync(path, "utf8");
      assert.doesNotMatch(source, /(?:client|server-secret)\.server/);
    }
  }
});
