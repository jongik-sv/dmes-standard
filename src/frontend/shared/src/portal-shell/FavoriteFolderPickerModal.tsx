"use client";

import { useEffect, useMemo, useState } from "react";

/** 즐겨찾기 추가 시 대상 폴더 선택 결과. 둘 중 하나만 채워진다. */
export interface FavoriteFolderChoice {
  /** 기존 폴더 선택 시 폴더 ID. */
  fvtFoldId?: string;
  /** 신규 폴더 생성 시 폴더명 (BE 가 FVT_FOLD_ID 채번). */
  fvtFoldNm?: string;
}

export interface FavoriteFolderOption {
  fvtFoldId: string;
  fvtFoldNm: string;
}

interface Props {
  open: boolean;
  /** 사용자의 기존 즐겨찾기 폴더 목록. */
  folders: FavoriteFolderOption[];
  /** 추가할 페이지 표시명 (안내 문구용, 선택). */
  pageLabel?: string;
  onConfirm: (choice: FavoriteFolderChoice) => void;
  onCancel: () => void;
}

const DEFAULT_NEW_FOLDER_NAME = "즐겨찾기";

/**
 * 마이메뉴(즐겨찾기) 추가 — 폴더 선택 팝업. mui {@code commonMyMenuAdd} 동등.
 *
 * <p>기존 폴더가 있으면 콤보 선택(기본) + "새 폴더" 토글. 폴더가 없으면 신규 폴더명 입력만
 * (기본값 "즐겨찾기"). 확정 시 {@link FavoriteFolderChoice} 를 반환한다.
 */
export function FavoriteFolderPickerModal({ open, folders, pageLabel, onConfirm, onCancel }: Props) {
  const hasFolders = folders.length > 0;
  const [mode, setMode] = useState<"existing" | "new">(hasFolders ? "existing" : "new");
  const [selectedFoldId, setSelectedFoldId] = useState<string>(folders[0]?.fvtFoldId ?? "");
  const [newFolderName, setNewFolderName] = useState<string>(DEFAULT_NEW_FOLDER_NAME);

  // 열릴 때마다 초기화 (폴더 목록/존재 여부 반영).
  useEffect(() => {
    if (!open) return;
    setMode(hasFolders ? "existing" : "new");
    setSelectedFoldId(folders[0]?.fvtFoldId ?? "");
    setNewFolderName(DEFAULT_NEW_FOLDER_NAME);
  }, [open, hasFolders, folders]);

  const canConfirm = useMemo(() => {
    if (mode === "existing") return !!selectedFoldId;
    return newFolderName.trim().length > 0;
  }, [mode, selectedFoldId, newFolderName]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (mode === "existing") {
      onConfirm({ fvtFoldId: selectedFoldId });
    } else {
      onConfirm({ fvtFoldNm: newFolderName.trim() });
    }
  };

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="마이메뉴 추가"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          fontFamily: "var(--font-family)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 600 }}>
          마이메뉴 추가
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#555" }}>
            {pageLabel ? `'${pageLabel}' 를(을) ` : ""}어느 폴더에 추가할까요?
          </div>

          {hasFolders && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="fav-folder-mode"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
              />
              <span style={{ minWidth: 64 }}>기존 폴더</span>
              <select
                value={selectedFoldId}
                disabled={mode !== "existing"}
                onChange={(e) => setSelectedFoldId(e.target.value)}
                style={{ flex: 1, height: 28, padding: "0 6px" }}
              >
                {folders.map((f) => (
                  <option key={f.fvtFoldId} value={f.fvtFoldId}>
                    {f.fvtFoldNm || f.fvtFoldId}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            {hasFolders && (
              <input
                type="radio"
                name="fav-folder-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
            )}
            <span style={{ minWidth: 64 }}>새 폴더</span>
            <input
              type="text"
              value={newFolderName}
              disabled={hasFolders && mode !== "new"}
              maxLength={30}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder="폴더명"
              style={{ flex: 1, height: 28, padding: "0 6px" }}
            />
          </label>
        </div>
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{ height: 30, padding: "0 14px", cursor: "pointer" }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              height: 30,
              padding: "0 14px",
              cursor: canConfirm ? "pointer" : "not-allowed",
              background: "var(--color-primary, #337ab7)",
              opacity: canConfirm ? 1 : 0.5,
              color: "#fff",
              border: "none",
              borderRadius: 4,
            }}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
