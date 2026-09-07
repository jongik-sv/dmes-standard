"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Group, NativeSelect, Radio, Stack, Text, TextInput } from "@mantine/core";
import { Modal } from "../components/modal";

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

/** 확정 버튼은 공통 primary 토큰을 그대로 쓴다(레거시 파랑 하드코딩 금지). */
const CONFIRM_BUTTON_STYLES = {
  root: { backgroundColor: "var(--color-primary, #337ab7)" },
} as const;

/**
 * 마이메뉴(즐겨찾기) 추가 — 폴더 선택 팝업. mui {@code commonMyMenuAdd} 동등.
 *
 * <p>기존 폴더가 있으면 콤보 선택(기본) + "새 폴더" 토글. 폴더가 없으면 신규 폴더명 입력만
 * (기본값 "즐겨찾기"). 확정 시 {@link FavoriteFolderChoice} 를 반환한다.
 */
export function FavoriteFolderPickerModal({
  open,
  folders,
  pageLabel,
  onConfirm,
  onCancel,
}: Props) {
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
    <Modal
      open={open}
      title="마이메뉴 추가"
      onClose={onCancel}
      size="sm"
      className="favorite-folder-picker"
      footer={
        <Group gap="xs" justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm} styles={CONFIRM_BUTTON_STYLES}>
            추가
          </Button>
        </Group>
      }
    >
      <Radio.Group
        value={mode}
        onChange={(value) => setMode(value as "existing" | "new")}
        name="fav-folder-mode"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {pageLabel ? `'${pageLabel}' 를(을) ` : ""}어느 폴더에 추가할까요?
          </Text>

          {hasFolders && (
            <Group gap="xs" wrap="nowrap" align="center">
              <Radio value="existing" label="기존 폴더" />
              <NativeSelect
                value={selectedFoldId}
                disabled={mode !== "existing"}
                onChange={(event) => setSelectedFoldId(event.currentTarget.value)}
                data={folders.map((folder) => ({
                  value: folder.fvtFoldId,
                  label: folder.fvtFoldNm || folder.fvtFoldId,
                }))}
                style={{ flex: 1 }}
              />
            </Group>
          )}

          <Group gap="xs" wrap="nowrap" align="center">
            {hasFolders ? <Radio value="new" label="새 폴더" /> : <Text size="sm">새 폴더</Text>}
            <TextInput
              value={newFolderName}
              disabled={hasFolders && mode !== "new"}
              maxLength={30}
              onChange={(event) => setNewFolderName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleConfirm();
              }}
              placeholder="폴더명"
              style={{ flex: 1 }}
            />
          </Group>
        </Stack>
      </Radio.Group>
    </Modal>
  );
}
