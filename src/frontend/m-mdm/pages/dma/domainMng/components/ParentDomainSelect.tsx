"use client";

/** 「부모 도메인」 선택(D-003) — 기본 속성 폼과 부모 연결 대화상자가 함께 쓴다. 후보는 호출자가 `parentCandidates` 로 거른다. */
import { Select } from "@dk-oasis/shared/form";
import type { DomainRow } from "../types";

export interface ParentDomainSelectProps {
  value: number | null;
  options: DomainRow[];
  placeholder: string;
  disabled: boolean;
  onChange: (parentDomainId: number | null) => void;
}

export function ParentDomainSelect({ value, options, placeholder, disabled, onChange }: ParentDomainSelectProps) {
  return (
    <Select aria-label="부모 도메인" value={value ?? ""} placeholder={placeholder}
      options={options.map((r) => ({ value: String(r.DOMAIN_ID), label: `${r.DOMAIN_NAME} (${r.STD_NAME})` }))}
      disabled={disabled}
      onChange={(v) => onChange(v === "" ? null : Number(v))} />
  );
}
