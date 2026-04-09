import { OutputFormat } from "./types";

// Borderless inline glyphs at 14×14 — same visual weight as NodeKindIcon.
// Brand colors are used for the letter fills so each format stays recognizable.
export function OutputFormatIcon({ format }: { format: OutputFormat }) {
  if (format === "word") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <text
          x="7"
          y="11"
          fontSize="11"
          fontWeight="800"
          fill="#2B579A"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
        >
          W
        </text>
      </svg>
    );
  }
  if (format === "powerpoint") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <text
          x="7"
          y="11"
          fontSize="11"
          fontWeight="800"
          fill="#D24726"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
        >
          P
        </text>
      </svg>
    );
  }
  if (format === "excel") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <text
          x="7"
          y="11"
          fontSize="11"
          fontWeight="800"
          fill="#107C41"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
        >
          X
        </text>
      </svg>
    );
  }
  if (format === "figma") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="0.5" width="4" height="4" rx="2" fill="#F24E1E" />
        <rect x="2" y="5" width="4" height="4" fill="#A259FF" />
        <rect x="2" y="9.5" width="4" height="4" rx="2" fill="#0ACF83" />
        <rect x="6.5" y="5" width="4" height="4" rx="2" fill="#FF7262" />
        <rect x="6.5" y="0.5" width="4" height="4" rx="2" fill="#1ABCFE" />
      </svg>
    );
  }
  if (format === "json") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <text
          x="7"
          y="11"
          fontSize="11"
          fontWeight="700"
          fill="currentColor"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
        >
          {"{}"}
        </text>
      </svg>
    );
  }
  // markdown
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <text
        x="7"
        y="11"
        fontSize="9"
        fontWeight="800"
        fill="currentColor"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
      >
        MD
      </text>
    </svg>
  );
}
