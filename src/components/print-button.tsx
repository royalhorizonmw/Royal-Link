"use client";
import { Icon } from "./icons";

export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
      <Icon name="print" size={16} /> {label}
    </button>
  );
}
