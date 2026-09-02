"use client";

import React, { type ButtonHTMLAttributes, type ReactNode } from "react";

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

  return (
    <button
      type={type}
      className={`form-button ${variantClass} ${sizeClass} ${className}`.replace(/\s+/g, " ").trim()}
      onClick={onClick}
      disabled={disabled}
      style={style}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </button>
  );
}
