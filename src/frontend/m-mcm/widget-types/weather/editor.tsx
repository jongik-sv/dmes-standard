"use client";

/**
 * 날씨 편집기 — 지점 목록 편집(이름·위도·경도), 빠른 추가 버튼(서울·인천·포항·당진·부산), 범위 검사.
 * 위도·경도 칸은 입력 도중("37.")의 글자를 지키려고 칸 안에 글자를 따로 들고, 값(숫자)은 숫자로 바꿔 올린다.
 * 숫자가 아니면 NaN 으로 올려 검사(validateWeatherConfig)가 저장을 막는다. 오류 문구는 관리 화면이 목록으로 보인다.
 */
import { useMemo, useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Button, FormGroup, Input } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import {
  addQuickLocation,
  coordText,
  parseCoord,
  patchConfig,
  QUICK_LOCATIONS,
  readWeatherConfig,
  sameCoord,
  validateWeatherConfig,
  type WeatherLocation,
} from "@/widget-types/_ext/config";
import { EXT_CSS, EXT_STYLE_HREF } from "@/widget-types/_ext/styles";
import { useReportErrors } from "@/widget-types/_ext/use-report-errors";

interface LocationRowProps {
  index: number;
  loc: WeatherLocation;
  onChange: (next: WeatherLocation) => void;
  onRemove: () => void;
}

function LocationRow({ index, loc, onChange, onRemove }: LocationRowProps) {
  // 입력 중인 글자 — 값(숫자)과 같은 뜻일 때만 보인다. 밖에서 값이 바뀌면(행 삭제로 밀림 등) 값 쪽 글자가 보인다.
  const [latDraft, setLatDraft] = useState<string | null>(null);
  const [lonDraft, setLonDraft] = useState<string | null>(null);
  const latText = latDraft !== null && sameCoord(latDraft, loc.lat) ? latDraft : coordText(loc.lat);
  const lonText = lonDraft !== null && sameCoord(lonDraft, loc.lon) ? lonDraft : coordText(loc.lon);
  const n = index + 1;

  return (
    <div className="mcm-extedit__row" data-testid={`widget-weather-loc-${index}`}>
      <Input value={loc.name} placeholder="이름" aria-label={`지점 ${n} 이름`} onChange={(v) => onChange({ ...loc, name: v })} />
      <Input
        value={latText}
        placeholder="위도"
        inputMode="decimal"
        aria-label={`지점 ${n} 위도`}
        onChange={(v) => {
          setLatDraft(v);
          onChange({ ...loc, lat: parseCoord(v) });
        }}
      />
      <Input
        value={lonText}
        placeholder="경도"
        inputMode="decimal"
        aria-label={`지점 ${n} 경도`}
        onChange={(v) => {
          setLonDraft(v);
          onChange({ ...loc, lon: parseCoord(v) });
        }}
      />
      <Button size="sm" ariaLabel={`지점 ${n} 삭제`} onClick={onRemove}>
        <IconTrash size={12} aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function WeatherEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = useMemo(() => readWeatherConfig(value), [value]);
  const errors = useMemo(() => validateWeatherConfig(value), [value]);
  useReportErrors(errors, onValidate);

  const update = (locations: WeatherLocation[]) => onChange(patchConfig(value, { locations }));

  return (
    <div className="mcm-extedit" data-testid="widget-editor-weather">
      <style href={EXT_STYLE_HREF} precedence="default">
        {EXT_CSS}
      </style>
      <FormGroup label="지점" labelWidth={80}>
        <div className="mcm-extedit">
          {cfg.locations.map((loc, i) => (
            <LocationRow
              key={i}
              index={i}
              loc={loc}
              onChange={(next) => update(cfg.locations.map((l, j) => (j === i ? next : l)))}
              onRemove={() => update(cfg.locations.filter((_, j) => j !== i))}
            />
          ))}
          <div>
            <Button size="sm" onClick={() => update([...cfg.locations, { name: "", lat: Number.NaN, lon: Number.NaN }])}>
              <IconPlus size={12} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
              지점 추가
            </Button>
          </div>
        </div>
      </FormGroup>
      <FormGroup label="빠른 추가" labelWidth={80}>
        <div className="mcm-extedit__quick">
          {QUICK_LOCATIONS.map((q) => (
            <Button
              key={q.name}
              size="sm"
              disabled={cfg.locations.some((l) => l.name === q.name)}
              onClick={() => update(addQuickLocation(cfg.locations, q))}
            >
              {q.name}
            </Button>
          ))}
        </div>
      </FormGroup>
      <p className="mcm-extedit__hint">위도는 -90~90, 경도는 -180~180 사이 숫자입니다. 예: 서울 37.5665, 126.978</p>
    </div>
  );
}
