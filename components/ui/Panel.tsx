import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
  brassAccent?: boolean;
}

export default function Panel({
  elevated,
  noPadding,
  brassAccent,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  return (
    <div
      className={[
        "relative",
        noPadding ? "" : "p-5 md:p-6",
        className,
      ].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: brassAccent ? "1px solid var(--accent)" : "1px solid var(--border-default)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
        borderRadius: "2px",
        ...style,
      }}
      {...props}
    >
      {brassAccent && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: "var(--accent)" }}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
