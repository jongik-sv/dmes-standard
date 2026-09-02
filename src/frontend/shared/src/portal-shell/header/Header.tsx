"use client";

import { useRef, useState } from "react";
import "./Header.css";

export interface HeaderProps {
  appName: string;
  userName: string;
  loginId: string;
  onLogout: () => void;
  onGoHome?: () => void;
}

export function Header({ appName, userName, loginId, onLogout, onGoHome }: HeaderProps) {
  const [showUserInfo, setShowUserInfo] = useState(false);
  const userInfoBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="portal-header">
      <div className="portal-header__left">
        <img className="portal-header__logo" src="/images/dmes_logo_w.png" alt={appName} onClick={onGoHome} style={{ cursor: onGoHome ? "pointer" : undefined }} />
      </div>
      <div className="portal-header__right">
        <span className="portal-header__user-name">{userName} 님</span>
        <span className="portal-header__divider">|</span>
        <button
          ref={userInfoBtnRef}
          type="button"
          className="portal-header__icon-btn"
          onClick={() => setShowUserInfo(!showUserInfo)}
          title="개인 정보"
          aria-label="개인 정보"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button
          type="button"
          className="portal-header__icon-btn"
          onClick={onLogout}
          title="로그아웃"
          aria-label="로그아웃"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      {showUserInfo && (
        <>
          <div className="portal-header__overlay" onClick={() => setShowUserInfo(false)} />
          <div className="portal-header__user-popup">
            <div className="portal-header__popup-header">
              <span className="portal-header__popup-title">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                개인 정보
              </span>
              <button
                type="button"
                className="portal-header__popup-close"
                onClick={() => setShowUserInfo(false)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="portal-header__popup-body">
              <div className="portal-header__popup-field">
                <label>사용자명</label>
                <input type="text" value={userName} readOnly />
              </div>
              <div className="portal-header__popup-field">
                <label>로그인 ID</label>
                <input type="text" value={loginId} readOnly />
              </div>
            </div>
            <div className="portal-header__popup-footer">
              <button type="button" onClick={() => setShowUserInfo(false)}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
