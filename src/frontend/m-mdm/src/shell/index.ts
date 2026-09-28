// TSK-01-03 U6 — m-mdm 공통 화면 셸. 화면은 "@/shell" 로 가져온다.
export { MDM_GROUPS, MDM_MENU_ROOT_NAME, type MdmGroupCode } from "./mdm-groups";
export { MdmPageLayout, type MdmPageLayoutProps } from "./MdmPageLayout";
export { badgeStyle, type MdmBadgeTone } from "./badge-style";
export { VersionStatusBadge, type VersionStatusBadgeProps, type MdmVersionStatus } from "./VersionStatusBadge";
export { DraftLockBadge, type DraftLockBadgeProps } from "./DraftLockBadge";
export { openMdmPage, takeMdmPageParams, useMdmPageParams, type MdmPageParams } from "./page-handoff";
export { HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT } from "./handover";
