// m-mdm 공용 컬럼 정보 팝오버. 화면은 "@/column-info" 로 가져온다(MDM 컬럼 사전 데이터에 묶여 shared 로 올리지 않는다 —
// 껍데기 팝오버는 shared `DetailPopover`).
export {
  ColumnInfoCard,
  ColumnInfoPopover,
  ColumnInfoTable,
  ColumnPhysName,
  domainTypeLabel,
  termsLabel,
  type ColumnInfoPopoverProps,
} from "./ColumnInfoPopover";
export {
  clearColumnInfoCache,
  descriptionFormat,
  loadColumnInfo,
  type ColumnInfo,
  type ColumnInfoColumn,
  type ColumnInfoDomain,
  type ColumnInfoSystem,
  type ColumnInfoTerm,
} from "./api";
