"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button as MantineButton } from "@mantine/core";

export type ButtonVariant = "default" | "primary" | "danger";

/** 버튼 크기 — 좁은 컨테이너(트리 툴바·드로워·컨텍스트 메뉴)용 sm/mini 제공. */
export type ButtonSize = "default" | "sm" | "mini";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  ariaLabel?: string;
}

const MANTINE_VARIANT: Record<ButtonVariant, { variant: "default" | "filled"; color?: string }> = {
  default: { variant: "default" },
  primary: { variant: "filled", color: "dmes" },
  danger: { variant: "filled", color: "danger" },
};

const MANTINE_SIZE: Record<ButtonSize, string> = {
  default: "sm",
  sm: "xs",
  mini: "compact-xs",
};

export function Button({
  children,
  onClick,
  disabled = false,
  type = "button",
  variant = "default",
  size = "default",
  className = "",
  style,
  ariaLabel,
  ...rest
}: ButtonProps) {
  const variantClass = variant !== "default" ? `form-button-${variant}` : "";
  const sizeClass = size !== "default" ? `form-button-${size}` : "";
  const mantineVariant = MANTINE_VARIANT[variant];

  return (
    <MantineButton
      type={type}
      variant={mantineVariant.variant}
      color={mantineVariant.color}
      size={MANTINE_SIZE[size]}
      className={`form-button ${variantClass} ${sizeClass} ${className}`.replace(/\s+/g, " ").trim()}
      onClick={onClick}
      disabled={disabled}
      style={style}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </MantineButton>
  );
}
