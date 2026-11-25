/**
 * mqc 시연 화면 19개의 이름·위치. 메뉴 시드(ModuleMenuSeeder#seedMqcMenus)와 같은 값이다. 정본 지침: docs/mqc/demo/README.md §2.
 * 화면 제목·breadcrumb 은 여기서 읽는다(화면마다 문자열을 다시 쓰지 않는다).
 */

export type ScreenFolder =
  "qdm" | "qdf" | "qdr" | "qcd" | "qdb" | "qjd" | "qpr";

export interface ScreenMeta {
  /** 화면 objectId(= OASIS 권한 대상, 화면 전용 서비스의 serviceId). */
  objectId: string;
  /** 메뉴 폴더(pages/{folder}/{objectId}/page.tsx). */
  folder: ScreenFolder;
  /** 메뉴·화면 제목. */
  title: string;
  /** 화면 머리 위치 표시. */
  breadcrumb: string;
}

/** 폴더 → 메뉴 경로(화면 이름 앞까지). */
const FOLDER_PATH: Record<ScreenFolder, string> = {
  qdm: "품질관리 > 품질설계 > 모듈관리",
  qdf: "품질관리 > 품질설계 > 생산가부관리",
  qdr: "품질관리 > 품질설계 > 설계결과관리",
  qcd: "품질관리 > 품질설계",
  qdb: "품질관리 > 품질설계 > 기준정보관리",
  qjd: "품질관리 > 품질판정",
  qpr: "품질관리 > 출력물관리",
};

const LIST: [objectId: string, folder: ScreenFolder, title: string][] = [
  ["qualitySpec", "qdm", "품질사양 관리"],
  ["rawMaterialGrade", "qdm", "원자재강종관리"],
  ["specCode", "qdm", "규격약호관리"],
  ["rollingThicknessSet", "qdm", "압연두께Set보정관리"],
  ["processRouting", "qdm", "공정라우팅관리"],
  ["lineWidthShrinkage", "qdm", "폭수축량관리"],
  ["lineWidthMargin", "qdm", "폭마진량관리"],
  ["orderWeightError", "qdf", "주문단중에러관리"],
  ["orderConsistency", "qdf", "주문정합성관리"],
  ["productionFeasibility", "qdf", "생산가부관리"],
  ["qualityDesignResult", "qdr", "품질설계결과"],
  ["designSimulation", "qcd", "시뮬레이션"],
  ["masterCode", "qdb", "마스터코드"],
  ["colorSubmaterial", "qdb", "칼라부재료관리"],
  ["colorBom", "qdb", "칼라BOM관리"],
  ["qualityJudgment", "qjd", "품질판정"],
  ["qualityCertificate", "qpr", "품질보증서관리"],
  ["inspectionCertificate", "qpr", "검사증명서관리"],
  ["tagManagement", "qpr", "Tag관리"],
];

export const SCREENS: Record<string, ScreenMeta> = Object.fromEntries(
  LIST.map(([objectId, folder, title]) => [
    objectId,
    {
      objectId,
      folder,
      title,
      breadcrumb: `${FOLDER_PATH[folder]} > ${title}`,
    },
  ]),
);

/** 화면 메타. 모르는 objectId 면 이름을 objectId 로 둔다(화면이 깨지지 않게). */
export function screenMeta(objectId: string): ScreenMeta {
  return (
    SCREENS[objectId] ?? {
      objectId,
      folder: "qcd",
      title: objectId,
      breadcrumb: `${FOLDER_PATH.qcd} > ${objectId}`,
    }
  );
}
