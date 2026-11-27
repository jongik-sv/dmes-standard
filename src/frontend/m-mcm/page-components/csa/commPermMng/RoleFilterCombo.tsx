"use client";

/**
 * commPermMng 조회 조건 「역할」 — 입력해서 찾는 콤보(z2 F4) + 값이 있을 때 「지우기」 단추(z2fix2 F4b).
 * shared ComboBox 는 clearable 을 받지 않아 글자를 지우고 나가면 앞 선택으로 돌아간다 — 지우기 단추로 「전체」(빈 값)로 돌린다.
 * 목록 맨 위 「전체」 항목은 그대로 둔다.
 */
import { memo, type CSSProperties } from "react";
import { IconX } from "@tabler/icons-react";
import { Button, ComboBox } from "@dk-oasis/shared/form";
import type { RoleFilterOption } from "./role-filter";

const WRAP: CSSProperties = { display: "flex", alignItems: "center", gap: 4, width: "100%" };
const COMBO: CSSProperties = { flex: 1, minWidth: 0 };

export interface RoleFilterComboProps {
  options: readonly RoleFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export const RoleFilterCombo = memo(function RoleFilterCombo({ options, value, onChange }: RoleFilterComboProps) {
  return (
    <div style={WRAP}>
      <ComboBox
        data={options as RoleFilterOption[]}
        value={value}
        onChange={(v) => onChange(v)}
        placeholder="역할 이름 · ROLE_ID 찾기"
        aria-label="역할"
        style={COMBO}
      />
      {value && (
        <Button size="mini" ariaLabel="역할 조건 지우기" title="역할 조건 지우기(전체)" onClick={() => onChange("")}>
          <IconX size={12} stroke={2.2} aria-hidden />
        </Button>
      )}
    </div>
  );
});
