export {
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  toFieldErrors,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  getJson,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  postJsonNoRedirect,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  redirectToLoginOn401,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiRequest,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiQuery,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiQueryService,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiService,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiLovMaster,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiLovQuery,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  apiLovService,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  HttpError,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  type BackendErrorDetail,
  /** @deprecated `@dk-oasis/shared/http` 에서 가져온다. */
  type FieldErrorItem,
} from "./http";

export {
  /** @deprecated `@dk-oasis/shared/secure-storage` 에서 가져온다. */
  readSecureJson,
  /** @deprecated `@dk-oasis/shared/secure-storage` 에서 가져온다. */
  writeSecureJson,
  /** @deprecated `@dk-oasis/shared/secure-storage` 에서 가져온다. */
  removeSecureValue,
} from "./secure-storage";

export {
  /** @deprecated `@dk-oasis/shared/snapshot` 에서 가져온다. */
  cloneSnapshot,
  /** @deprecated `@dk-oasis/shared/snapshot` 에서 가져온다. */
  isSnapshotEqual,
} from "./snapshot";

export {
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  PortalShell,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalShellProps,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  FavoriteFolderPickerModal,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type FavoriteFolderChoice,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type FavoriteFolderOption,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  resolvePortalHomePageId,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  DEFAULT_PORTAL_HOME_PAGE_NAME_BY_MODULE,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  usePortalMenu,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalMenuState,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalMenuEndpoint,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  usePortalFavorites,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalFavoritePagesState,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalFavoritesEndpoint,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  usePortalStartPages,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  adaptStartPageRow,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalStartPagesState,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalStartPagesEndpoint,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  planStartPageOpen,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  getTabCloseTargets,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  hasOpenedStartPages,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  markStartPagesOpened,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  clearStartPagesOpened,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type PortalStartPageRecord,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type TabCloseScope,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  peekLastUserId,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  useUserButtonRbac,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  canDoButton,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type ButtonRbacRow,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type ButtonRbacState,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  useTabPage,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  useTabService,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type TabPageContextValue,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  TabPageContext,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  toUsagePageId,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  createUsageSegmentId,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageStartKind,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageSegment,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageEmitReason,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageTarget,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_IDLE_MS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_MAX_SEGMENT_MS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_MIN_SEGMENT_MS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_TICK_MS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageEventTarget,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageDocumentLike,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageTrackerOptions,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  UsageTracker,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  createUsageSender,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  bindUsageSender,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageSenderOptions,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageSender,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageExitTargets,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageExitBinding,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  isUsageBusinessRequest,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  isWithinUsageInputWindow,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  installUsageActivity,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_INPUT_WINDOW_MS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_BUSINESS_PATH_PATTERN,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_EXCLUDED_PATH_PATTERNS,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  USAGE_PORTAL_PATH_PREFIXES,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageFetchTarget,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageActivityEventTarget,
  /** @deprecated `@dk-oasis/shared/portal-shell` 에서 가져온다. */
  type UsageActivityOptions,
} from "./portal-shell";

export {
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  toPhysName,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  resolveCaption,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  mdmCaption,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  requestColumns,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  requestDomains,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  peekColumn,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  peekDomain,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  isModuleDisabled,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  resetMdmMetaStore,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MDM_META_TTL_MS,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MDM_META_BATCH_MS,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MdmMetaProvider,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  useMdmColumn,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  useMdmColumns,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  useMdmCaptionPriority,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  useMdmMetaScope,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  resolveMdmPhysName,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmMetaProviderProps,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmColumnInfo,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmMetaScope,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MdmMetaCard,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  formatMdmDataType,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  mdmCardHasHtml,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  mdmCardSafeHtml,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MDM_META_CARD_MAX_CODES,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MDM_META_CARD_HTML_MAX_WIDTH,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MDM_META_CARD_HTML_MAX_HEIGHT,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmMetaCardProps,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  MdmFieldLabel,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmFieldLabelProps,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  validateMdmValue,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  codePointLength,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  useMdmValidation,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmValueIssue,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmValueIssueCode,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmRowIssue,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmDomainRef,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmExpr,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmCodeRef,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmAllowedCode,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmScreenColumn,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmDomainMeta,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmCaptionKind,
  /** @deprecated `@dk-oasis/shared/mdm-meta` 에서 가져온다. */
  type MdmCaptionPriority,
} from "./mdm-meta";
