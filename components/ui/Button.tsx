"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "brass";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    border: "1px solid var(--accent)",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)",
  },
  brass: {
    background: "transparent",
    color: "var(--accent)",
    border: "1px solid var(--accent)",
  },
  ghost: {
    background: "transparent",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  },
  danger: {
    background: "transparent",
    border: "1px solid var(--danger)",
    color: "var(--danger)",
  },
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[11px] font-mono",
  md: "px-5 py-2.5 text-[12px] font-sans",
  lg: "px-6 py-3 text-[14px] font-sans",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2",
          "font-medium tracking-[0.06em] uppercase transition-all duration-200",
          "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none",
          sizeStyles[size],
          className,
        ].join(" ")}
        style={{
          borderRadius: "1px",
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
