/**
 * noticeMgmt 목록 그리드 열(§3.2). 화면 파일에서 떼어 낸 정의라 단위 시험이 열 모양(MDM 캡션을 쓰는 칸의 대체 header, 파생 열의 meta:false 등)을 바로 본다.
 *
 * MDM 캡션: 화면(page.tsx)이 `MdmMetaProvider captionPriority="mdm"` 으로 감싸므로 MDM 컬럼 사전에 있는 열(`TITLE`)은 MDM 캡션이 이기고, MDM 이 없거나
 * 받지 못하면 적어 둔 header 가 보인다. 그래서 header 를 지우지 않는다 — 지우면 MDM 을 받지 못할 때 열 key("TITLE")가 머리글로 보인다.
 * 사전에 없는 표시용 파생 열(*_LABEL 등)은 `meta: false` 로 MDM 연결을 끈다(우선순위가 mdm 이라, 사전에 우연히 같은 이름이 생겨도 머리글이 바뀌지 않게).
 */
import { GridBadge, type GridColumn } from "@dk-oasis/shared/grid";

import { formatPeriodShort } from "./notice-logic";
import { NOTICE_STATUS } from "./types";

const CATEGORY_BADGE: Record<
  string,
  { bg?: string; color?: string; muted?: boolean }
> = {
  URGENT: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  MAINT: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  NORMAL: { muted: true },
};

const STATUS_BADGE: Record<
  string,
  { bg?: string; color?: string; muted?: boolean }
> = {
  [NOTICE_STATUS.POSTED]: {
    bg: "var(--color-success-soft)",
    color: "var(--color-success)",
  },
  [NOTICE_STATUS.STOPPED]: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  [NOTICE_STATUS.DRAFT]: { muted: true },
};

/**
 * §3.2 목록 열. 표시용 파생 칸(*_LABEL 등)은 gridRows 에서 만든다 — 툴팁은 그 값(전체 글자)을 보인다.
 * columnSizing="fit" 에서 width 는 픽셀이 아니라 비율 가중치다(ag-data-grid.md). 그래서 짧은 열은 가중치 1 에
 * 내용 폭만큼 minWidth 를 주어 거의 그 폭에 머물게 하고, 제목만 큰 가중치로 남는 폭을 모두 가져가게 한다.
 * 칸 안쪽 여백은 좌우 8px(grid.css .ag-cell)이다. 열 합이 목록 폭보다 크면 그리드가 가로로 스크롤한다.
 * 최소 폭 합 552px — 포털 1300px·상세 460 기본 배치의 목록 폭(약 570px)에 맞춘다. 등록일은 상세·홈 미리보기에서 본다.
 */
const NARROW = 1;
export const NOTICE_COLUMNS: GridColumn[] = [
  {
    key: "CATEGORY_LABEL",
    header: "분류",
    meta: false,
    width: NARROW,
    minWidth: 60,
    align: "center",
    render: (v, row) => (
      <GridBadge
        label={String(v ?? "")}
        {...CATEGORY_BADGE[String(row.NOTICE_CATEGORY_CODE)]}
      />
    ),
  },
  {
    key: "FORMAT_LABEL",
    header: "형식",
    meta: false,
    width: NARROW,
    minWidth: 52,
    align: "center",
  },
  // 이 칸만 MDM 물리명과 같다 — MDM 이 있으면 표준 캡션(labelShort)·머리글 툴팁이 이기고(화면의 captionPriority="mdm"), 없으면 "제목"(상세 라벨과 같다).
  { key: "TITLE", header: "제목", width: 100, minWidth: 180, align: "left" },
  {
    key: "STATUS_LABEL",
    header: "게시상태",
    meta: false,
    width: NARROW,
    minWidth: 74,
    align: "center",
    render: (v, row) => (
      <GridBadge
        label={String(v ?? "")}
        {...STATUS_BADGE[String(row.NOTICE_STATUS)]}
      />
    ),
  },
  {
    key: "POST_PERIOD",
    header: "게시기간",
    meta: false,
    width: NARROW,
    minWidth: 100,
    align: "center",
    // 칸에는 "MM-dd~MM-dd", 툴팁(값)에는 연도까지 보인다.
    render: (_v, row) =>
      formatPeriodShort(
        row.POST_START_DT as string | null,
        row.POST_END_DT as string | null,
      ),
  },
  {
    key: "PIN_LABEL",
    header: "고정",
    meta: false,
    width: NARROW,
    minWidth: 42,
    align: "center",
    render: (v) => (v ? "●" : ""),
  },
  {
    key: "TARGET_LABEL",
    header: "대상",
    meta: false,
    width: NARROW,
    minWidth: 66,
    align: "left",
    render: (_v, row) => String(row.TARGET_SHORT ?? ""),
  },
];
