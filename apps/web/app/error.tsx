"use client";

import { ErrorState } from "@/components/states";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="This page could not load its data."
      message={
        process.env.NODE_ENV === "development"
          ? error.message
          : "The Assay API did not answer as expected. Check that it is running, then retry."
      }
      onRetry={reset}
    />
  );
}
