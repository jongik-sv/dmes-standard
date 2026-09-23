/**
 * MDM 메뉴 그룹 코드 → 폴더 이름(TSK-01-03 U1).
 *
 * 백엔드 계약 MdmScreenGroup.menuFolderName()·docs/mdm/screens/README §2·mcm DataInitializer.seedMdmMenus()
 * 의 폴더 이름과 글자까지 같아야 한다(불변 규칙 I20). 하나를 바꾸면 셋을 함께 바꾼다.
 */
export const MDM_GROUPS = {
  dma: "용어·도메인",
  dmb: "레이아웃",
  dmc: "마스터코드",
  dmd: "마스터데이터",
  dme: "업무기준",
} as const;

export type MdmGroupCode = keyof typeof MDM_GROUPS;

/** 사이드바 루트 폴더 이름(DataInitializer insertMpnFld("mdm", …)). */
export const MDM_MENU_ROOT_NAME = "마루 MDM";
