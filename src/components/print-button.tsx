"use client";

import { Button } from "@/components/ui";

/** Prints the page with the print stylesheet, which drops the app chrome. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="no-print"
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
