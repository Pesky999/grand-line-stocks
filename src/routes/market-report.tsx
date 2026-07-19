import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/market-report")({
  beforeLoad: () => {
    throw redirect({ to: "/market-bulletin", search: { feed: "reports" }, hash: "wire" });
  },
});
