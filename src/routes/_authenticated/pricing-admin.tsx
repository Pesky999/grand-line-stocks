import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { TerminalShell } from "@/components/TerminalShell";
import { PricingPreviewPanel } from "@/components/admin/PricingPreviewPanel";
import { amIAdmin, listCharacters } from "@/lib/api/market.functions";

const charsQO = queryOptions({ queryKey: ["characters"], queryFn: () => listCharacters() });

export const Route = createFileRoute("/_authenticated/pricing-admin")({
  head: () => ({
    meta: [
      { title: "Market Pricing Preview - Berry Street" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const { isAdmin } = await amIAdmin();
    if (!isAdmin) throw redirect({ to: "/" });
    await context.queryClient.ensureQueryData(charsQO);
  },
  component: PricingAdmin,
  errorComponent: ({ error }) => (
    <TerminalShell>
      <div className="p-8 text-bear">{error.message}</div>
    </TerminalShell>
  ),
  notFoundComponent: () => null,
});

function PricingAdmin() {
  const { data: characters } = useSuspenseQuery(charsQO);

  return (
    <TerminalShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PricingPreviewPanel characters={characters} />
      </div>
    </TerminalShell>
  );
}
