"use client";

import React, { type ErrorInfo, type ReactNode } from "react";
import { CopyTextButton } from "./copy-text-button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  /** 문의·보고용 오류 내용 — 화면 주소·시각·메시지·컴포넌트 스택. */
  errorReport = (): string => {
    const { error, errorInfo } = this.state;
    return [
      `URL: ${typeof window !== "undefined" ? window.location.href : ""}`,
      `시각: ${new Date().toLocaleString("ko-KR")}`,
      `오류: ${error?.toString() ?? ""}`,
      error?.stack ? `\n${error.stack}` : "",
      errorInfo?.componentStack ? `\n컴포넌트 스택:${errorInfo.componentStack}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV === "development";

      return (
        <div
          style={{
            padding: "20px",
            margin: "10px",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            backgroundColor: "#fafafa",
            textAlign: "center",
          }}
        >
          <h3 style={{ color: "#d32f2f", marginBottom: "12px" }}>오류가 발생했습니다</h3>
          <p style={{ color: "#666", marginBottom: "16px" }}>화면을 표시하는 중 문제가 발생했습니다.</p>
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 20px",
              backgroundColor: "var(--color-primary, #0b62d6)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            다시 시도
          </button>
          {this.state.error && (
            <CopyTextButton
              label="오류 내용 복사"
              text={this.errorReport}
              style={{ marginLeft: 8, verticalAlign: "top" }}
            />
          )}
          {isDev && this.state.error && (
            <details style={{ marginTop: "16px", textAlign: "left" }}>
              <summary style={{ cursor: "pointer", color: "#999" }}>에러 상세 (개발 모드)</summary>
              <pre
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "4px",
                  fontSize: "12px",
                  overflow: "auto",
                  maxHeight: "300px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
