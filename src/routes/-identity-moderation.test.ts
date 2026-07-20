import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const authSource = read("src/routes/auth.tsx");
const profileSource = read("src/routes/_authenticated/profile.tsx");
const adminRouteSource = read("src/routes/_authenticated/admin.tsx");
const moderationRouteSource = read("src/routes/_authenticated/identity-moderation-admin.tsx");
const apiSource = read("src/lib/api/identity-moderation.functions.ts");
const walletApiSource = read("src/lib/api/wallet.functions.ts");
const routeTreeSource = read("src/routeTree.gen.ts");

test("signup requires an explicitly valid username and runs a server precheck before auth signup", () => {
  const signupBlock = sourceBetween(
    authSource,
    'if (mode === "signup") {',
    '} else if (mode === "forgot")',
  );

  assert.match(authSource, /checkPublicUsernameAvailability/);
  assert.match(authSource, /validateUsernameFormat/);
  assert.match(signupBlock, /const usernameFormat = validateUsernameFormat\(normalizedUsername\)/);
  assert.match(signupBlock, /await checkPublicUsernameAvailability/);
  assert.match(signupBlock, /if \(!usernameCheck\.available\)/);
  assert.match(signupBlock, /data: \{ username: usernameFormat\.value \}/);
  assert.doesNotMatch(signupBlock, /email\.split\("@"\)\[0\]/);
  assert.doesNotMatch(signupBlock, /toLowerCase/);
  assert.doesNotMatch(authSource, /replace\(\/\[\^a-z0-9_\]\/g, ""\)/);
  assert.match(authSource, /required/);
  assert.match(authSource, /pattern="\[a-z0-9\]\(\?:\[a-z0-9_\]\{1,18\}\[a-z0-9\]\)"/);
  assert.match(authSource, /lowercase letters, numbers, and single underscores/);
});

test("signup accepts valid usernames containing digits without client-side rewriting", () => {
  assert.match(authSource, /validateUsernameFormat\(normalizedUsername\)/);
  assert.match(authSource, /data: \{ username: usernameFormat\.value \}/);
  assert.doesNotMatch(authSource, /replaceConfusables|leet|identity_moderation_normalize/);
});

test("profile display-name editing validates locally and through the server API", () => {
  assert.match(profileSource, /validateDisplayNameFormat/);
  assert.match(profileSource, /const validation = validateDisplayNameFormat\(displayName\)/);
  assert.match(profileSource, /updateProfile\(\{ data: \{ display_name: validation\.value \} \}\)/);
  assert.match(profileSource, /Usernames are permanent public handles/);
  assert.match(
    profileSource,
    /Display names are public and must follow Berry Street identity rules/,
  );

  assert.match(walletApiSource, /evaluateDisplayNameOnServer/);
  assert.match(walletApiSource, /That display name is not allowed\./);
  assert.match(walletApiSource, /\.eq\("id", context\.userId\)/);
  assert.doesNotMatch(profileSource, /updateProfile\(\{ data: \{ username/);
  assert.doesNotMatch(walletApiSource, /z\.object\(\{ username/);
});

test("identity moderation admin console is admin-only and linked from the admin console", () => {
  assert.match(adminRouteSource, /to="\/identity-moderation-admin"/);
  assert.match(
    moderationRouteSource,
    /createFileRoute\("\/_authenticated\/identity-moderation-admin"\)/,
  );
  assert.match(moderationRouteSource, /Identity Moderation - Berry Street/);
  assert.match(moderationRouteSource, /robots", content: "noindex"/);
  assert.match(moderationRouteSource, /const \{ isAdmin \} = await amIAdmin\(\)/);
  assert.match(
    moderationRouteSource,
    /if \(!isAdmin\) throw redirect\(\{ to: "\/", search: \{ page: 1, q: "" \} \}\)/,
  );
  assert.match(moderationRouteSource, /Back to Admin Console/);
  assert.match(moderationRouteSource, /Profile Review/);
  assert.match(moderationRouteSource, /Flag Status/);
  assert.match(moderationRouteSource, /Search username, display name, or profile ID/);
  assert.match(moderationRouteSource, /Add Supplemental Rule/);
  assert.match(moderationRouteSource, /Rescan Profiles/);
  assert.match(moderationRouteSource, /Reset Username/);
  assert.match(moderationRouteSource, /Reset Display/);
  assert.match(moderationRouteSource, /Reset Both/);
  assert.match(moderationRouteSource, /window\.confirm/);
  assert.match(moderationRouteSource, /Actor:/);
  assert.match(moderationRouteSource, /new Date\(action\.created_at\)\.toLocaleString\(\)/);
  assert.match(
    moderationRouteSource,
    /disabled=\{rule\.is_core \|\| ruleActiveMutation\.isPending\}/,
  );
  assert.doesNotMatch(moderationRouteSource, /supabaseAdmin|client\.server|\bdb\.from\(/);
});

test("identity moderation server functions keep public precheck generic and admin writes protected", () => {
  const publicCheck = sourceBetween(
    apiSource,
    "export const checkPublicUsernameAvailability",
    "export const getIdentityModerationOverview",
  );

  assert.match(publicCheck, /createServerFn\(\{ method: "POST" \}\)/);
  assert.doesNotMatch(publicCheck, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(publicCheck, /return \{ available: result\.available \} as const/);
  assert.match(publicCheck, /return \{ available: false \} as const/);
  assert.doesNotMatch(publicCheck, /normalizedUsername|code:|message:/);
  assert.doesNotMatch(publicCheck, /identity_moderation_terms|identity_moderation_flags/);
  assert.match(apiSource, /import\("@\/lib\/moderation\/public-identity\.server"\)/);
  assert.doesNotMatch(
    apiSource,
    /from "@\/lib\/moderation\/public-identity\.server"/,
    "server-only policy must be dynamically imported",
  );

  const profileSearch = sourceBetween(
    apiSource,
    "export const searchIdentityModerationProfiles",
    "export const listIdentityModerationFlags",
  );
  assert.match(profileSearch, /z\.string\(\)\.uuid\(\)\.safeParse\(query\)/);
  assert.match(profileSearch, /\.eq\("id", profileId\.data\)/);
  assert.match(profileSearch, /\.ilike\("username", escaped\)/);
  assert.match(profileSearch, /\.ilike\("display_name", escaped\)/);

  const flagList = sourceBetween(
    apiSource,
    "export const listIdentityModerationFlags",
    "export const listIdentityModerationRules",
  );
  assert.match(
    apiSource,
    /status: z\.enum\(\["open", "reviewed", "resolved", "dismissed", "all"\]\)/,
  );
  assert.match(
    flagList,
    /if \(data\.status !== "all"\) request = request\.eq\("status", data\.status\)/,
  );
  assert.doesNotMatch(flagList, /identity_moderation_terms\(/);

  const ruleList = sourceBetween(
    apiSource,
    "export const listIdentityModerationRules",
    "export const listIdentityModerationActions",
  );
  assert.match(ruleList, /\.or\("is_core\.eq\.false,kind\.neq\.blocked"\)/);

  const addRule = sourceBetween(
    apiSource,
    "export const addIdentityModerationRule",
    "export const setIdentityModerationRuleActive",
  );
  assert.match(addRule, /if \(data\.kind === "allow"\)/);
  assert.match(addRule, /evaluatePublicIdentity/);
  assert.match(addRule, /mapIdentityModerationRule/);
  assert.match(
    addRule,
    /\.select\("id,term,normalized_term,kind,category,match_mode,severity,is_core,active"\)/,
  );
  assert.match(addRule, /\.eq\("is_core", true\)/);
  assert.match(addRule, /\.eq\("kind", "blocked"\)/);
  assert.match(addRule, /\.in\("category", \[\.\.\.ACTIVE_IDENTITY_MODERATION_CATEGORIES\]\)/);
  assert.doesNotMatch(addRule, /\.eq\("normalized_term", normalized\)/);
  assert.match(addRule, /Allowlist entry conflicts with a protected core rule/);
  assert.match(apiSource, /function isAllowedSupplementalRule/);
  assert.match(apiSource, /data\.kind === "blocked" && isActiveIdentityModerationCategory/);
  assert.match(apiSource, /Only profanity and slur categories can be enforced\./);
  assert.match(apiSource, /normalizeTermForMatchMode/);
  assert.match(apiSource, /case "exact":[\s\S]*return forms\.leetNormalized/);

  const rescan = sourceBetween(
    apiSource,
    "export const rescanIdentityModerationProfiles",
    "return { scanned: profiles?.length ?? 0, flagged, activeRules: rules.length }",
  );
  assert.match(rescan, /\.in\("status", \["open", "reviewed"\]\)/);
  assert.match(rescan, /\.eq\("term_id", result\.matchedRule\.id\)/);
  assert.match(rescan, /\.is\("term_id", null\)/);
  assert.match(rescan, /if \(\(existingFlags \?\? \[\]\)\.length > 0\) continue/);
  assert.match(rescan, /\.from\("identity_moderation_flags"\)\.insert/);
  assert.doesNotMatch(rescan, /\.from\("profiles"\)\.update/);
  assert.doesNotMatch(rescan, /adminResetProfileIdentity|admin_reset_profile_identity/);

  for (const adminFunction of [
    "getIdentityModerationOverview",
    "searchIdentityModerationProfiles",
    "listIdentityModerationFlags",
    "listIdentityModerationRules",
    "listIdentityModerationActions",
    "markIdentityModerationFlagReviewed",
    "adminResetProfileIdentity",
    "addIdentityModerationRule",
    "setIdentityModerationRuleActive",
    "rescanIdentityModerationProfiles",
  ]) {
    const start = `export const ${adminFunction}`;
    const nextExport = apiSource.indexOf(
      "\nexport const ",
      apiSource.indexOf(start) + start.length,
    );
    const block =
      nextExport === -1
        ? apiSource.slice(apiSource.indexOf(start))
        : apiSource.slice(apiSource.indexOf(start), nextExport);
    assert.match(block, /middleware\(\[requireSupabaseAuth\]\)/, `${adminFunction} requires auth`);
    assert.match(
      block,
      /requireAdmin\(context\.userId, context\.supabase\)/,
      `${adminFunction} checks admin`,
    );
  }
});

test("browser routes do not import the server-only moderation policy loader", () => {
  for (const [name, source] of [
    ["auth", authSource],
    ["profile", profileSource],
    ["admin route", moderationRouteSource],
  ] as const) {
    assert.doesNotMatch(source, /public-identity\.server/, `${name} must not import server policy`);
  }
  assert.doesNotMatch(walletApiSource, /from "@\/lib\/moderation\/public-identity\.server"/);
  assert.match(walletApiSource, /import\("@\/lib\/moderation\/public-identity\.server"\)/);
});

test("signup and moderation admin UI avoid policy-leaking public messages", () => {
  assert.match(authSource, /That username is unavailable\. Choose another\./);
  assert.doesNotMatch(authSource, /usernameCheck\.message/);
  assert.match(moderationRouteSource, /\{rule\.term\}/);
  assert.match(moderationRouteSource, /rule\.is_core \? " \/ core" : ""/);
  assert.match(moderationRouteSource, /Core moderation rules cannot be changed here|rule\.is_core/);
});

test("route tree registers the protected identity moderation admin route", () => {
  assert.match(routeTreeSource, /AuthenticatedIdentityModerationAdminRouteImport/);
  assert.match(
    routeTreeSource,
    /'\/identity-moderation-admin': typeof AuthenticatedIdentityModerationAdminRoute/,
  );
  assert.match(routeTreeSource, /'\/_authenticated\/identity-moderation-admin'/);
  assert.match(routeTreeSource, /AuthenticatedIdentityModerationAdminRoute:/);
});
