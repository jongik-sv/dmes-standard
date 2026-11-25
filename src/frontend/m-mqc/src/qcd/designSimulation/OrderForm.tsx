"use client";

/**
 * 주문 입력 — OMS 주문 불러오기, 핵심 항목 입력(★ = 설계 전용 항목, * = 필수), 나머지 항목(접힘).
 * 빈칸 = 미입력(NULL) · 0 은 0 으로 평가된다. 고친 항목은 라벨 색이 바뀌고, 실행 때 고친 주문으로 돌린다(저장은 따로).
 */
import { memo } from "react";

import { Input, Select } from "@dk-oasis/shared/form";

import { extraFields } from "./logic";
import { DESIGN_ONLY_FIELDS, type OrderFields } from "./types";

export interface OrderOption {
  value: string;
  label: string;
}

export interface OrderFormProps {
  order: OrderFields;
  labels: Record<string, string>;
  coreFields: string[];
  requiredFields: string[];
  dirty: string[];
  source: "oms" | "manual";
  orderOptions: OrderOption[];
  disabled: boolean;
  onChange: (field: string, value: string) => void;
  onLoadOrder: (orderKey: string) => void;
}

function Field({
  name,
  label,
  value,
  required,
  dirty,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  value: string | null;
  required: boolean;
  dirty: boolean;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  const star = DESIGN_ONLY_FIELDS.includes(name) ? " ★" : "";
  const cls = ["mqc-qd-field"];
  if (required) cls.push("req");
  if (dirty) cls.push("dirty");
  return (
    <div className={cls.join(" ")}>
      <label title={`${name}${star ? " — 설계 전용 항목" : ""}`}>
        {label}
        {star}
      </label>
      <Input value={value ?? ""} onChange={(v) => onChange(name, v)} disabled={disabled} aria-label={label} />
    </div>
  );
}

export const OrderForm = memo(function OrderForm(props: OrderFormProps) {
  const { order, labels, coreFields, requiredFields, dirty, source, orderOptions, disabled, onChange, onLoadOrder } = props;
  const extras = extraFields(order, coreFields, labels);
  const dirtySet = new Set(dirty);
  const req = new Set(requiredFields);
  return (
    <div className="mqc-qd-pane">
      <div className="mqc-qd-row">
        <b>주문 입력</b>
        <span className="mqc-qd-muted">({source === "oms" ? "OMS 수신" : "직접 입력"})</span>
      </div>
      <Select
        aria-label="OMS 주문 불러오기"
        value=""
        options={[{ value: "", label: "OMS 주문 불러오기" }, ...orderOptions]}
        onChange={(v) => {
          if (v) onLoadOrder(v);
        }}
        disabled={disabled}
      />
      <div className="mqc-qd-form">
        {coreFields.map((f) => (
          <Field
            key={f}
            name={f}
            label={labels[f] ?? f}
            value={order[f] ?? null}
            required={req.has(f)}
            dirty={dirtySet.has(f)}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
      <details className="mqc-qd-details">
        <summary>추가 항목 {extras.length}개</summary>
        <div className="mqc-qd-form">
          {extras.map((f) => (
            <Field
              key={f}
              name={f}
              label={labels[f] ?? f}
              value={order[f] ?? null}
              required={req.has(f)}
              dirty={dirtySet.has(f)}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
        </div>
      </details>
      <div className="mqc-qd-muted">빈칸 = 미입력(NULL) · 0 은 0 으로 평가됩니다.{dirty.length ? ` · 고친 항목 ${dirty.length}개` : ""}</div>
    </div>
  );
});
