/**
 * `@dk-oasis/shared/mdm-meta` — MDM 화면 메타(캡션·툴팁) 공통(spec docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md §4).
 * 화면 값 검증(validate.ts, spec §5)도 여기서 내보낸다.
 */
export * from "./types";
export { toPhysName } from "./names";
export { resolveCaption, mdmCaption } from "./caption";
export {
  requestColumns,
  requestDomains,
  peekColumn,
  peekDomain,
  isModuleDisabled,
  resetMdmMetaStore,
  MDM_META_TTL_MS,
  MDM_META_BATCH_MS,
} from "./store";
export {
  MdmMetaProvider,
  useMdmColumn,
  useMdmColumns,
  useMdmCaptionPriority,
  useMdmMetaScope,
  resolveMdmPhysName,
  type MdmMetaProviderProps,
  type MdmColumnInfo,
  type MdmMetaScope,
} from "./context";
export {
  MdmMetaCard,
  formatMdmDataType,
  mdmCardHasHtml,
  MDM_META_CARD_MAX_CODES,
  MDM_META_CARD_HTML_MAX_WIDTH,
  MDM_META_CARD_HTML_MAX_HEIGHT,
  type MdmMetaCardProps,
} from "./MdmMetaCard";
export { MdmFieldLabel, type MdmFieldLabelProps } from "./MdmFieldLabel";
export {
  validateMdmValue,
  codePointLength,
  useMdmValidation,
  type MdmValueIssue,
  type MdmValueIssueCode,
  type MdmRowIssue,
} from "./validate";
