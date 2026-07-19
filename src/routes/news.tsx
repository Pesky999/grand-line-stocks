import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/news")({
  beforeLoad: () => {
    throw redirect({ to: "/market-bulletin", search: { feed: "news" }, hash: "wire" });
  },
});
