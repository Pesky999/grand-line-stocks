/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function executableSql(source: string) {
  return source.replace(/--.*$/gm, "");
}

const migrationPath = "supabase/migrations/20260727010000_public_trading_profile_privacy.sql";
const migration = read(migrationPath);
const executableMigration = executableSql(migration);
const legendarySource = read("src/lib/api/legendary.functions.ts");
const walletSource = read("src/lib/api/wallet.functions.ts");
const publicProfileRoute = read("src/routes/u.$username.tsx");
const privateProfileRoute = read("src/routes/_authenticated/profile.tsx");
const typesSource = read("src/integrations/supabase/types.ts");
const migrationHistory = readdirSync(join(process.cwd(), "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => read(`supabase/migrations/${file}`))
  .join("\n");

test("public trading profile setting is stored on profiles with a default-public value", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(
    migration,
    /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS public_trading_profile boolean NOT NULL DEFAULT true;/,
  );
  assert.match(
    migration,
    /COMMENT ON COLUMN public\.profiles\.public_trading_profile IS\s+'Controls whether the player public profile exposes trading details\./,
  );
  assert.doesNotMatch(migration, /CREATE TABLE public\..*privacy|profile_privacy|tombstone/i);
});

test("authenticated privacy RPC updates only the caller profile and is not anonymous", () => {
  const rpc = between(
    migration,
    "CREATE OR REPLACE FUNCTION public.set_my_public_trading_profile(_is_public boolean)",
    "CREATE OR REPLACE FUNCTION public.get_public_investor_profile(_username text)",
  );

  assert.match(rpc, /RETURNS boolean/);
  assert.match(rpc, /SECURITY DEFINER/);
  assert.match(rpc, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(rpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpc, /WHERE id = v_user_id/);
  assert.match(rpc, /RETURNING public_trading_profile INTO v_setting/);
  assert.doesNotMatch(
    rpc.slice(rpc.indexOf("set_my_public_trading_profile"), rpc.indexOf("RETURNS boolean")),
    /_user_id|user_id uuid|profile_id/i,
  );
  assert.doesNotMatch(rpc, /auth\.users|supabaseAdmin/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.set_my_public_trading_profile\(boolean\) FROM PUBLIC;/,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.set_my_public_trading_profile\(boolean\) FROM anon;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.set_my_public_trading_profile\(boolean\) TO authenticated, service_role;/,
  );
});

test("public investor profile RPC returns missing, private, and public states without sensitive fields", () => {
  const rpc = between(
    migration,
    "CREATE OR REPLACE FUNCTION public.get_public_investor_profile(_username text)",
    "CREATE OR REPLACE FUNCTION public.get_public_leaderboard(",
  );
  const privateBranch = between(
    rpc,
    "IF v_profile.public_trading_profile IS NOT TRUE THEN",
    "END IF;",
  );

  assert.match(rpc, /RETURNS jsonb/);
  assert.match(rpc, /STABLE/);
  assert.match(rpc, /SECURITY DEFINER/);
  assert.match(rpc, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(rpc, /WHERE p\.username = v_username/);
  assert.match(rpc, /RETURN jsonb_build_object\('found', false\)/);
  assert.match(privateBranch, /'is_public', false/);
  assert.match(privateBranch, /'stats', NULL/);
  assert.match(privateBranch, /'cash', NULL/);
  assert.match(privateBranch, /'equity', NULL/);
  assert.match(privateBranch, /'net_worth', NULL/);
  assert.match(privateBranch, /'holdings', '\[\]'::jsonb/);
  assert.match(privateBranch, /'achievements', '\[\]'::jsonb/);
  assert.match(privateBranch, /'snapshots', '\[\]'::jsonb/);
  assert.match(rpc, /FROM public\.user_wallets AS w/);
  assert.match(rpc, /SUM\(h\.shares \* c\.current_price\)/);
  assert.match(rpc, /'avgCost', h\.avg_cost/);
  assert.match(rpc, /'currentPrice', c\.current_price/);
  assert.match(rpc, /'value', h\.shares \* c\.current_price/);
  assert.match(rpc, /FROM public\.user_achievements AS ua/);
  assert.match(rpc, /FROM public\.net_worth_snapshots/);
  assert.doesNotMatch(rpc, /auth\.users|email|raw_app_meta_data|user_roles|moderation/i);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_public_investor_profile\(text\) TO anon, authenticated, service_role;/,
  );
});

test("public list RPCs exclude deleted profiles at the query level without synthetic anon rows", () => {
  for (const [name, signature] of [
    ["leaderboard", "CREATE OR REPLACE FUNCTION public.get_public_leaderboard("],
    ["top holders", "CREATE OR REPLACE FUNCTION public.get_public_character_top_holders("],
    ["movers", "CREATE OR REPLACE FUNCTION public.get_public_leaderboard_movers("],
    ["legacy", "CREATE OR REPLACE FUNCTION public.get_public_legacy_records("],
  ] as const) {
    const next = "REVOKE ALL ON FUNCTION";
    const block = migration.slice(migration.indexOf(signature));
    const functionBlock = block.slice(
      0,
      block.indexOf(next) === -1 ? undefined : block.indexOf(next),
    );
    assert.match(functionBlock, /JOIN public\.profiles AS p ON p\.id = /, name);
    assert.doesNotMatch(
      functionBlock,
      /LEFT JOIN public\.profiles|COALESCE\([^)]*'anon'|'anon'/i,
      name,
    );
    assert.ok(
      functionBlock.indexOf("JOIN public.profiles AS p") < functionBlock.indexOf("LIMIT v_limit"),
      `${name} should apply pagination after profile join deletion exclusion`,
    );
  }

  const legacy = between(
    migration,
    "CREATE OR REPLACE FUNCTION public.get_public_legacy_records(",
    "REVOKE ALL ON FUNCTION public.set_my_public_trading_profile",
  );
  assert.match(legacy, /WHERE p\.public_trading_profile IS TRUE/);
});

test("application public reads use public clients and keep app-level profile existence filtering", () => {
  const getPublicProfile = between(
    legendarySource,
    "export const getPublicProfile",
    "export const setMyPublicTradingProfile",
  );
  const privacyUpdate = between(
    legendarySource,
    "export const setMyPublicTradingProfile",
    "export const listLegacy",
  );
  const helper = between(
    legendarySource,
    "async function filterRowsWithExistingPublicProfiles",
    "export const listLeaderboard",
  );

  assert.match(getPublicProfile, /const db = getPublicSupabaseClient\(\)/);
  assert.match(getPublicProfile, /\.rpc\("get_public_investor_profile"/);
  assert.doesNotMatch(getPublicProfile, /await admin\(\)|supabaseAdmin|client\.server/);
  assert.match(privacyUpdate, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(privacyUpdate, /context\.supabase\.rpc\("set_my_public_trading_profile"/);
  assert.doesNotMatch(privacyUpdate, /await admin\(\)|supabaseAdmin|client\.server|_user_id/);
  assert.match(helper, /\.from\("profiles"\)[\s\S]*\.select\("username"\)/);
  assert.match(helper, /existingUsernames\.has\(row\.username\)/);
});

test("owner profile uses authenticated own-account data and saves the public/private toggle", () => {
  assert.match(
    walletSource,
    /\.select\("id,username,display_name,created_at,public_trading_profile"\)/,
  );
  assert.match(walletSource, /\.from\("user_wallets"\)/);
  assert.match(walletSource, /\.from\("user_holdings"\)/);
  assert.match(walletSource, /\.from\("user_stats"\)/);
  assert.match(walletSource, /\.from\("leaderboard_cache"\)/);
  assert.match(walletSource, /\.from\("user_achievements"\)/);
  assert.match(privateProfileRoute, /PUBLIC TRADING PROFILE/);
  assert.match(privateProfileRoute, /When enabled, other players can view your cash/);
  assert.match(privateProfileRoute, /PUBLIC/);
  assert.match(privateProfileRoute, /PRIVATE/);
  assert.match(privateProfileRoute, /setMyPublicTradingProfile\(\{ data: \{ isPublic \} \}\)/);
  assert.doesNotMatch(privateProfileRoute, /getPublicProfile|pub\.data/);
});

test("public profile route distinguishes private active accounts from missing deleted accounts", () => {
  assert.match(publicProfileRoute, /INVESTOR NOT FOUND/);
  assert.match(publicProfileRoute, /q\.isError \|\| !q\.data \|\| !q\.data\.found/);
  assert.match(publicProfileRoute, /TRADING PROFILE PRIVATE/);
  assert.match(publicProfileRoute, /!d\.is_public \? \(/);
  assert.match(publicProfileRoute, /d\.cash != null &&/);
  assert.match(publicProfileRoute, /d\.equity != null &&/);
  assert.match(publicProfileRoute, /d\.net_worth != null &&/);
  assert.match(publicProfileRoute, /d\.holdings\.length > 0 &&/);
  assert.match(publicProfileRoute, /h\.shares \* h\.currentPrice/);
  assert.doesNotMatch(publicProfileRoute, /\/u\/anon|username:\s*"anon"|\?\?\s*"anon"/);
});

test("generated types expose the privacy column and RPCs without broad type regeneration", () => {
  assert.match(typesSource, /public_trading_profile: boolean/);
  const publicProfileRpc = between(
    typesSource,
    "get_public_investor_profile:",
    "get_public_leaderboard:",
  );
  const privacyRpc = between(
    typesSource,
    "set_my_public_trading_profile:",
    "submit_trivia_answer:",
  );

  assert.match(publicProfileRpc, /Args: \{ _username: string \}/);
  assert.match(publicProfileRpc, /Returns: Json/);
  assert.match(privacyRpc, /Args: \{ _is_public: boolean \}/);
  assert.match(privacyRpc, /Returns: boolean/);
});

test("deleted accounts leave no username tombstone and account-owned data still cascades", () => {
  assert.match(migrationHistory, /username\s+text\s+(?:unique\s+not null|not null\s+unique)/i);
  assert.doesNotMatch(
    executableMigration,
    /tombstone|reservation|deleted_profile|username_reservation/i,
  );

  for (const table of [
    "profiles",
    "user_wallets",
    "user_holdings",
    "transactions",
    "user_stats",
    "leaderboard_cache",
    "user_achievements",
    "legacy_records",
    "grand_line_guess_daily_puzzles",
    "grand_line_guess_stats",
    "daily_crew_submissions",
    "wallet_ledger_entries",
    "user_onboarding_progress",
    "user_onboarding_events",
  ]) {
    assert.match(
      migrationHistory,
      new RegExp(
        `CREATE TABLE(?: IF NOT EXISTS)? public\\.${table}[\\s\\S]*?REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE`,
        "i",
      ),
      `${table} remains account-owned cascade data`,
    );
  }
});

test("shared actor references remain anonymized instead of deleting shared records", () => {
  for (const [table, column] of [
    ["market_events", "created_by"],
    ["identity_moderation_terms", "created_by"],
    ["identity_moderation_flags", "reviewed_by"],
    ["identity_moderation_actions", "actor_user_id"],
  ] as const) {
    assert.match(
      migrationHistory,
      new RegExp(`${column}\\s+uuid\\s+REFERENCES auth\\.users\\(id\\) ON DELETE SET NULL`, "i"),
      `${table}.${column} should be anonymized`,
    );
  }

  for (const [constraint, column] of [
    ["character_pricing_ratings_created_by_fkey", "created_by"],
    ["character_pricing_ratings_updated_by_fkey", "updated_by"],
    ["character_pricing_ratings_approved_by_fkey", "approved_by"],
  ] as const) {
    const block = between(
      migrationHistory,
      `ADD CONSTRAINT ${constraint}`,
      `COMMENT ON CONSTRAINT ${constraint}`,
    );
    assert.match(block, new RegExp(`FOREIGN KEY \\(${column}\\)[\\s\\S]*ON DELETE SET NULL`, "i"));
  }
});
