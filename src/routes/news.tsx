import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/news")({
  beforeLoad: () => {
    throw redirect({ to: "/market-bulletin", hash: "news" });
  },
});
