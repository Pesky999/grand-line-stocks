/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(workspacePath: string) {
  return readFileSync(join(process.cwd(), workspacePath), "utf8");
}

const routeSource = read("src/routes/games.daily-crew-builder.tsx");
const gamesIndexSource = read("src/routes/games.index.tsx");
const apiSource = read("src/lib/api/daily-crew-builder.functions.ts");

test("Daily Crew Builder route renders the mission, jobs, pool, and saved result sections", () => {
  assert.match(routeSource, /createFileRoute\("\/games\/daily-crew-builder"\)/);
  assert.match(routeSource, /Daily Crew Builder/);
  assert.match(routeSource, /mission\.title/);
  assert.match(routeSource, /mission\.brief/);
  assert.match(routeSource, /mission\?\.id/);
  assert.match(routeSource, /poolCount > 0 \? `\$\{poolCount\}-character pool` : "Daily mission pool"/);
  assert.match(routeSource, /jobCount > 0 \? `\$\{jobCount\}-job` : "mission-ready"/);
  assert.doesNotMatch(routeSource, /\$\{jobCount\}-\$\{jobWord\}/);
  assert.match(routeSource, /Crew Assignment/);
  assert.match(routeSource, /Character Pool/);
  assert.match(routeSource, /Saved Crew Result/);
  assert.match(routeSource, /role\.name/);
  assert.match(routeSource, /pool\.map/);
});

test("Daily Crew Builder route keeps hidden fixture data out of the browser-visible route module", () => {
  assert.match(routeSource, /getTodayDailyCrewBuilderMission/);
  assert.match(routeSource, /getMyTodayDailyCrewBuilderResult/);
  assert.match(routeSource, /submitDailyCrewBuilderPreview/);
  assert.doesNotMatch(routeSource, /DAILY_CREW_SAMPLE_FIXTURES/);
  assert.doesNotMatch(routeSource, /roleScores|roleRequirements|subtypeKey|subtypeLabel|synergyRules|perfectSolution/);
  assert.doesNotMatch(routeSource, /Hidden command profile|Hidden combat profile|Hidden route profile/i);
});

test("Daily Crew Builder route requires all jobs, prevents duplicates, and prompts signed-out users", () => {
  assert.match(routeSource, /useMe\(\)/);
  assert.match(routeSource, /Sign in to submit your crew/);
  assert.match(routeSource, /const allRolesAssigned = roles\.length > 0 && roles\.every/);
  assert.match(routeSource, /const assignmentGridClass = jobCount <= 3 \? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-5"/);
  assert.match(routeSource, /const submissionLocked = Boolean\(result\?\.submissionSaved\)/);
  assert.match(routeSource, /const canSubmit = Boolean\(user\) && allRolesAssigned && !missionQ\.isLoading && !savedResultQ\.isLoading && !submissionLocked/);
  assert.match(routeSource, /disabled=\{!canSubmit \|\| submitPreviewM\.isPending\}/);
  assert.match(routeSource, /assignedToAnotherRole/);
  assert.match(routeSource, /disabled=\{assignedToAnotherRole\}/);
  assert.match(routeSource, /Each character can only fill one job/);
  assert.match(routeSource, /Assign one unique character to every job before submitting/);
  assert.match(routeSource, /Clear/);
});

test("Daily Crew Builder result panel uses saved and payout-aware reward language", () => {
  assert.match(routeSource, /Your first submitted crew is saved for this mission/);
  assert.match(routeSource, /paid automatically/);
  assert.match(routeSource, /Reward paid/);
  assert.match(routeSource, /Reward already paid/);
  assert.match(routeSource, /Reward payout is pending\. Your saved result is safe/);
  assert.match(routeSource, /payoutErrorCode/);
  assert.match(routeSource, /Wallet balance/);
  assert.match(routeSource, /Your first submitted crew is saved for this mission/);
  assert.match(routeSource, /Crew Saved/);
  assert.match(routeSource, /Saved Result Locked/);
  assert.match(routeSource, /Reward/);
  assert.match(routeSource, /Perfect crew/);
  assert.match(routeSource, /Job breakdown/);
  assert.match(routeSource, /No synergy bonus earned/);
  assert.doesNotMatch(routeSource, /Preview reward only|Reward payout coming later|No Berries are paid|No Berries were paid/i);
  assert.doesNotMatch(routeSource, /Retry payout/i);
});

test("Daily Crew Builder route loads saved results for signed-in users and locks assignments", () => {
  assert.match(routeSource, /const savedResultEnabled = Boolean\(user && mission\?\.id\)/);
  assert.match(routeSource, /const savedResultKey = user\?\.id && mission\?\.id \? `\$\{user\.id\}:\$\{mission\.id\}` : null/);
  assert.match(routeSource, /queryKey: \["daily-crew-builder-saved-result", user\?\.id, mission\?\.id\]/);
  assert.match(routeSource, /getMyTodayDailyCrewBuilderResult\(\{/);
  assert.match(routeSource, /data: \{ missionId: mission\?\.id \}/);
  assert.match(routeSource, /enabled: savedResultEnabled/);
  assert.match(routeSource, /useEffect\(\(\) => \{/);
  assert.match(routeSource, /setResult\(savedResult\)/);
  assert.match(routeSource, /setSavedResultStateKey\(savedResultKey\)/);
  assert.match(routeSource, /savedResult\.roles\.map\(\(role\) => \[role\.role, role\.characterId\]\)/);
  assert.match(routeSource, /Checking for your saved crew result/);
  assert.match(routeSource, /Could not load your saved crew result/);
  assert.doesNotMatch(routeSource, /Retry payout/i);
});

test("Daily Crew Builder route clears stale saved result state on sign-out and user changes", () => {
  assert.match(routeSource, /const \[savedResultStateKey, setSavedResultStateKey\] = useState<string \| null>\(null\)/);
  assert.match(routeSource, /if \(!savedResultEnabled \|\| !savedResultKey\) \{/);
  assert.match(routeSource, /if \(result\?\.submissionSaved \|\| savedResultStateKey\) \{/);
  assert.match(routeSource, /setResult\(null\)/);
  assert.match(routeSource, /setAssignments\(\{\}\)/);
  assert.match(routeSource, /setSavedResultStateKey\(null\)/);
  assert.match(routeSource, /if \(savedResultStateKey && savedResultStateKey !== savedResultKey\) \{/);
});

test("Daily Crew Builder route clears previous saved result when the saved-result response is null", () => {
  assert.match(routeSource, /if \(!savedResultEnabled \|\| !savedResultKey \|\| !savedResultQ\.isSuccess\) return/);
  assert.match(routeSource, /const savedResult = savedResultQ\.data as DailyCrewBuilderPersistedResult \| null \| undefined/);
  assert.match(routeSource, /if \(!savedResult\) \{/);
  assert.match(routeSource, /savedResultStateKey === savedResultKey/);
  assert.match(routeSource, /setResult\(null\)/);
  assert.match(routeSource, /setAssignments\(\{\}\)/);
  assert.match(routeSource, /setSavedResultStateKey\(null\)/);
});

test("Daily Crew Builder saved-result query is signed-in and mission gated", () => {
  const savedResultQuery = routeSource.match(
    /const savedResultQ = useQuery\(\{[\s\S]*?\n\s{2}\}\);/,
  )?.[0];

  assert.ok(savedResultQuery, "saved-result query should be present");
  assert.match(savedResultQuery, /getMyTodayDailyCrewBuilderResult/);
  assert.match(savedResultQuery, /enabled: savedResultEnabled/);
  assert.doesNotMatch(savedResultQuery, /enabled: true/);
});

test("Games hub links to Daily Crew Builder without removing Grand Line Guess", () => {
  assert.match(gamesIndexSource, /to="\/games\/grand-line-guess"/);
  assert.match(gamesIndexSource, /to="\/games\/daily-crew-builder"/);
  assert.match(gamesIndexSource, /Daily Crew Builder/);
  assert.match(gamesIndexSource, /Available daily/);
  assert.doesNotMatch(gamesIndexSource, /reward payout coming later/i);
});

test("Daily Crew Builder UI and API save submissions and pay rewards without direct wallet writes", () => {
  const combined = `${routeSource}\n${apiSource}`;

  assert.match(combined, /record_daily_crew_builder_submission/);
  assert.match(combined, /award_daily_crew_builder_reward/);
  assert.match(combined, /missionId: mission\?\.id \?\? ""/);
  assert.match(combined, /alreadySubmitted/);
  assert.match(combined, /submissionSaved/);
  assert.doesNotMatch(combined, /user_wallets/i);
  assert.doesNotMatch(combined, /transactions/i);
  assert.doesNotMatch(combined, /Retry payout/i);
  assert.doesNotMatch(combined, /\.(insert|update|upsert|delete)\s*\(/);
});
