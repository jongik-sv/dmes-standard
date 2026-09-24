package com.dongkuk.dmes.mdm.dmc.codeCateEdit.service;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.same;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateChecks;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateIssueCode;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateMemberProjection;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateProjection;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.Resolution;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.ResolvedRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRejections;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRows;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCatePreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * 카테고리 편집({@code codeCateEdit}) OASIS 진입 서비스(TSK-06-04 design.md §1·§2).
 *
 * <p>BPMN {@code services/dmc/codeCateEdit.bpmn} 의 {@code actionGateway} 6 분기와 1:1이다: {@code search}·
 * {@code view}·{@code compare}(→ {@link #preview}, READ)와 {@code validate}·{@code save}·{@code restore}(→
 * {@link #revert}, EDIT).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다.</b>(F9, {@code CodeItemEditService} 관례 그대로) 저장은 요청 두 그리드
 * (categories·members)를 메모리에서 V 모습에 먼저 적용해 검사하고, 통과했을 때만 {@code beginDraftWrite} → 선분 조작
 * 순으로 쓴다(거부된 저장은 ROW_VERSION 을 건드리지 않는다).
 */
@Service("codeCateEditService")
public class CodeCateEditService {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int VER_SCALE = VersionTarget.MASTER_CODE.versionScale();
    private static final Set<String> UNAPPLIED_BLOCKING = Set.of(VersionStatus.DRAFT.name(),
            VersionStatus.REQUESTED.name(), VersionStatus.APPROVED.name());

    private final MasterCodeRows rows;
    private final MasterCodeSegmentService segments;
    private final VersionWriteGuard versionWriteGuard;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public CodeCateEditService(MasterCodeRows rows, MasterCodeSegmentService segments,
                               VersionWriteGuard versionWriteGuard, MdmCurrentUser currentUser, Clock clock) {
        this.rows = rows;
        this.segments = segments;
        this.versionWriteGuard = versionWriteGuard;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ── action: search ────────────────────────────────────────────────────

    public Map<String, Object> search(CodeCateSearchRequest request) {
        String keyword = request == null || request.getKeyword() == null ? ""
                : request.getKeyword().trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> codes = new ArrayList<>();
        for (MdmCode code : rows.codes()) {
            if (!keyword.isEmpty() && !code.getMaruCodeId().toLowerCase(Locale.ROOT).contains(keyword)
                    && !code.getMaruCodeName().toLowerCase(Locale.ROOT).contains(keyword)) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("maruCodeId", code.getMaruCodeId());
            m.put("maruCodeName", code.getMaruCodeName());
            m.put("sourceKind", code.getSourceKind());
            m.put("status", code.getStatus());
            codes.add(m);
        }
        return Map.of("codes", codes);
    }

    // ── action: view ──────────────────────────────────────────────────────

    public Map<String, Object> view(CodeCateViewRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        List<MdmCodeVer> versions = rows.versions(code.getMaruCodeId()).stream()
                .sorted(Comparator.comparing(MdmCodeVer::getVer).reversed()).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("header", headerMap(code));
        result.put("versions", versions.stream().map(CodeCateEditService::versionMap).toList());

        Optional<MdmCodeVer> chosen = isBlank(request.getVer()) ? defaultVersion(versions)
                : Optional.of(version(versions, parseVer(request.getVer())));
        if (chosen.isEmpty()) {
            result.put("selected", null);
            result.put("categories", List.of());
            result.put("items", List.of());
            result.put("cateItems", List.of());
            return result;
        }
        MdmCodeVer selected = chosen.get();
        BigDecimal v = selected.getVer();
        boolean mdm = MasterCodeSourceKind.MDM.name().equals(code.getSourceKind());
        long unapplied = versions.stream().filter(this::isUnapplied).count();
        boolean draft = VersionStatus.DRAFT.name().equals(selected.getStatus());
        Map<String, Object> sel = new LinkedHashMap<>();
        sel.put("ver", str(v));
        sel.put("display", display(v));
        sel.put("status", selected.getStatus());
        sel.put("ownerId", selected.getOwnerId());
        sel.put("rowVersion", selected.getRowVersion());
        sel.put("editable", draft && mdm && unapplied <= 1 && selected.getOwnerId() != null
                && selected.getOwnerId().equals(currentUser.userId()));
        sel.put("warning", unapplied >= 2 ? "MULTIPLE_UNAPPLIED" : null);
        result.put("selected", sel);

        MasterCodeVersionView view = segments.viewAt(ref(code.getMaruCodeId(), v));
        result.put("categories", view.categories().stream().map(CodeCateEditService::categoryMap).toList());
        result.put("items", view.items().stream().map(CodeCateEditService::itemMap).toList());
        result.put("cateItems", view.cateItems().stream()
                .sorted(Comparator.comparing(MasterCodeCateItemRow::cateId).thenComparing(MasterCodeCateItemRow::code))
                .map(ci -> Map.<String, Object>of("cateId", ci.cateId(), "code", ci.code())).toList());
        return result;
    }

    // ── action: compare ───────────────────────────────────────────────────

    /** REGEX 전용 미리보기 — 저장 전 후보 defExpr·defTarget 을 서버 {@code Pattern} 으로만 재해석한다(원천 04:183). */
    public Map<String, Object> preview(CodeCatePreviewRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        version(rows.versions(code.getMaruCodeId()), v);
        MasterCodeVersionView view = segments.viewAt(ref(code.getMaruCodeId(), v));
        CategoryDefinition candidate = new CategoryDefinition(text(request.getCateId()), null, CategoryKind.REGEX,
                request.getDefExpr(), parseTarget(request.getDefTarget()), null);
        Resolution r = MasterCodeCategoryResolver.resolve(view.items(), new MasterCodeCateRow(candidate, null, null),
                view.cateItems());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cateId", candidate.cateId());
        result.put("ver", str(v));
        result.put("defKind", r.defKind());
        result.put("defTarget", r.defTarget());
        result.put("defExpr", r.defExpr());
        result.put("hitCount", r.hitCount());
        result.put("total", r.total());
        result.put("invalidExpression", r.invalidExpression());
        result.put("warnings", r.warnings().stream().map(CodeCateEditService::issueMap).toList());
        List<Map<String, Object>> list = new ArrayList<>();
        for (ResolvedRow row : r.rows()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", row.code());
            m.put("name", row.name());
            m.put("seq", row.seq());
            m.put("lvls", row.lvls());
            m.put("hit", row.hit());
            m.put("reason", row.reason().name());
            m.put("targetValue", row.targetValue());
            list.add(m);
        }
        result.put("rows", list);
        return result;
    }

    // ── action: validate ──────────────────────────────────────────────────

    public Map<String, Object> validate(CodeCateSaveRequest request, List<Map<String, Object>> categories,
                                        List<Map<String, Object>> members) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        version(rows.versions(code.getMaruCodeId()), v);
        Projected projected = project(code.getMaruCodeId(), v, categories == null ? List.of() : categories,
                members == null ? List.of() : members);
        return Map.of("issues", projected.issues().stream().map(CodeCateEditService::issueMap).toList());
    }

    // ── action: save ──────────────────────────────────────────────────────

    public Map<String, Object> save(CodeCateSaveRequest request, List<Map<String, Object>> categories,
                                    List<Map<String, Object>> members) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        requireVersionExists(code.getMaruCodeId(), v);
        boolean noCategories = categories == null || categories.isEmpty();
        boolean noMembers = members == null || members.isEmpty();
        if (noCategories && noMembers) {
            throw invalid("저장할 변경이 없습니다");
        }
        if (request.getRowVersion() == null) {
            throw invalid("rowVersion 이 없습니다");
        }
        Projected projected = project(code.getMaruCodeId(), v, noCategories ? List.of() : categories,
                noMembers ? List.of() : members);
        if (!projected.issues().isEmpty()) {
            throw MasterCodeRejections.saveRejected(projected.issues());
        }
        // 여기까지 쓰기가 없다. BASE 는 그리드에 섞여 와도 여기서 미리 거른다(rowVersion 증가 전).
        if (projected.categoryChanges().stream().anyMatch(c -> CategoryConventions.BASE_CATE_ID.equals(c.cateId()))
                || projected.memberChanges().stream()
                        .anyMatch(c -> CategoryConventions.BASE_CATE_ID.equals(c.cateId()))) {
            throw MdmErrors.of(MdmErrorCode.RESERVED_CATEGORY);
        }
        VersionRef ref = ref(code.getMaruCodeId(), v);
        long rowVersion = versionWriteGuard.beginDraftWrite(ref, request.getRowVersion(), currentUser.userId());
        for (MasterCodeCateProjection.Change c : projected.categoryChanges()) {
            switch (c.status()) {
                case DELETED -> segments.closeCategory(ref, c.cateId());
                case CHANGED -> segments.changeCategory(ref, c.definition());
                case ADDED -> segments.addCategory(ref, c.definition());
            }
        }
        Map<String, Set<String>> toRemove = new LinkedHashMap<>();
        Map<String, Set<String>> toAdd = new LinkedHashMap<>();
        for (MasterCodeCateMemberProjection.Change c : projected.memberChanges()) {
            Map<String, Set<String>> bucket = c.status() == MasterCodeCateMemberProjection.RowStatus.DELETED
                    ? toRemove : toAdd;
            bucket.computeIfAbsent(c.cateId(), k -> new LinkedHashSet<>()).add(c.code());
        }
        toRemove.forEach((cateId, codes) -> segments.removeCategoryMembers(ref, cateId, codes));
        toAdd.forEach((cateId, codes) -> segments.addCategoryMembers(ref, cateId, codes));
        return Map.of("rowVersion", rowVersion);
    }

    // ── action: restore ───────────────────────────────────────────────────

    public Map<String, Object> revert(CodeCateRevertRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        requireVersionExists(code.getMaruCodeId(), v);
        if (request.getRowVersion() == null || isBlank(request.getTable()) || isBlank(request.getCateId())) {
            throw invalid("rowVersion·table·cateId 가 필요합니다");
        }
        MasterCodeSegmentTable table = parseTable(request.getTable());
        if (table == MasterCodeSegmentTable.CATE_ITEM && isBlank(request.getCode())) {
            throw invalid("code 가 필요합니다");
        }
        VersionRef ref = ref(code.getMaruCodeId(), v);
        long rowVersion = versionWriteGuard.beginDraftWrite(ref, request.getRowVersion(), currentUser.userId());
        String memberCode = table == MasterCodeSegmentTable.CATE_ITEM ? request.getCode() : null;
        segments.revert(ref, new MasterCodeSegmentKey(table, request.getCateId(), memberCode));
        return Map.of("rowVersion", rowVersion);
    }

    // ── 공통 ────────────────────────────────────────────────────────────

    private record Projected(List<MdmCheckIssue> issues, List<MasterCodeCateProjection.Change> categoryChanges,
                             List<MasterCodeCateMemberProjection.Change> memberChanges) {
    }

    /** V 모습에 두 그리드를 메모리로 적용하고 touched 카테고리·소속 행을 검사한다 — validate·save 공용(design.md §1.4). */
    private Projected project(String maruCodeId, BigDecimal v, List<Map<String, Object>> categoryRows,
                              List<Map<String, Object>> memberRows) {
        MasterCodeVersionView viewAtV = segments.viewAt(ref(maruCodeId, v));
        List<CategoryDefinition> cateDefs = viewAtV.categories().stream().map(MasterCodeCateRow::definition).toList();
        MasterCodeCateProjection.Result catResult = MasterCodeCateProjection.apply(cateDefs, categoryRows);
        List<MdmCheckIssue> issues = new ArrayList<>(catResult.issues());
        for (CategoryDefinition def : catResult.viewAfter()) {
            if (catResult.touched().contains(def.cateId())) {
                issues.addAll(MasterCodeCateChecks.checkDefinition(def));
            }
        }

        Map<String, CategoryDefinition> catAfterById = new LinkedHashMap<>();
        for (CategoryDefinition def : catResult.viewAfter()) {
            catAfterById.put(def.cateId(), def);
        }
        Set<String> validCodes = viewAtV.items().stream().map(MasterCodeItemRow::code)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<MasterCodeCateMemberProjection.Change> memberChanges = MasterCodeCateMemberProjection.parse(memberRows);
        for (MasterCodeCateMemberProjection.Change c : memberChanges) {
            CategoryDefinition target = catAfterById.get(c.cateId());
            if (target == null) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.CATE_NOT_FOUND.name(), "이 버전에 없는 카테고리다",
                        "cateId", c.cateId()));
                continue;
            }
            if (target.defKind() != CategoryKind.TABLE) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.DEF_KIND_IMMUTABLE.name(), "TABLE 카테고리가 아니다",
                        "cateId", c.cateId()));
                continue;
            }
            if (c.status() == MasterCodeCateMemberProjection.RowStatus.ADDED && !validCodes.contains(c.code())) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.MEMBER_CODE_NOT_FOUND.name(), "이 버전에 없는 코드다",
                        "code", c.code()));
            }
        }
        return new Projected(List.copyOf(issues), catResult.changes(), memberChanges);
    }

    private MdmCode header(String maruCodeId) {
        if (isBlank(maruCodeId)) {
            throw invalid("maruCodeId 가 필요합니다");
        }
        return rows.code(maruCodeId).orElseThrow(() -> invalid("마루 코드가 없습니다: " + maruCodeId));
    }

    private void requireVersionExists(String id, BigDecimal v) {
        if (rows.versions(id).stream().noneMatch(e -> same(e.getVer(), v))) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }

    private static MdmCodeVer version(List<MdmCodeVer> versions, BigDecimal v) {
        return versions.stream().filter(e -> same(e.getVer(), v)).findFirst()
                .orElseThrow(() -> invalid("버전이 없습니다: " + str(v)));
    }

    /** DRAFT → 없으면 CANCELLED 가 아닌 가장 큰 버전(versions 는 내림차순). */
    private static Optional<MdmCodeVer> defaultVersion(List<MdmCodeVer> versions) {
        Optional<MdmCodeVer> draft = versions.stream()
                .filter(e -> VersionStatus.DRAFT.name().equals(e.getStatus())).findFirst();
        return draft.isPresent() ? draft : versions.stream()
                .filter(e -> !VersionStatus.CANCELLED.name().equals(e.getStatus())).findFirst();
    }

    private boolean isUnapplied(MdmCodeVer ver) {
        String status = ver.getStatus();
        if (UNAPPLIED_BLOCKING.contains(status)) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        return VersionStatus.RELEASED.name().equals(status) && ver.getApplyFrom() != null
                && ver.getApplyFrom().isAfter(now);
    }

    private static Map<String, Object> headerMap(MdmCode code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("maruCodeId", code.getMaruCodeId());
        m.put("maruCodeName", code.getMaruCodeName());
        m.put("sourceKind", code.getSourceKind());
        m.put("status", code.getStatus());
        m.put("lvlCnt", code.getLvlCnt());
        return m;
    }

    private static Map<String, Object> versionMap(MdmCodeVer ver) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ver", str(ver.getVer()));
        m.put("display", display(ver.getVer()));
        m.put("status", ver.getStatus());
        m.put("verKind", ver.getVerKind());
        m.put("ownerId", ver.getOwnerId());
        m.put("applyFrom", ver.getApplyFrom() == null ? null : DATE_TIME.format(ver.getApplyFrom()));
        m.put("applyTo", ver.getApplyTo() == null ? null : DATE_TIME.format(ver.getApplyTo()));
        return m;
    }

    private static Map<String, Object> categoryMap(MasterCodeCateRow r) {
        CategoryDefinition d = r.definition();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("cateId", d.cateId());
        m.put("cateName", d.cateName());
        m.put("defKind", d.defKind() == null ? null : d.defKind().name());
        m.put("defExpr", d.defExpr());
        m.put("defTarget", d.defTarget() == null ? null : d.defTarget().name());
        m.put("description", d.description());
        return m;
    }

    private static Map<String, Object> itemMap(MasterCodeItemRow r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", r.code());
        m.put("name", r.values().name());
        m.put("seq", r.values().seq());
        m.put("lvls", r.values().lvls());
        return m;
    }

    private static Map<String, Object> issueMap(MdmCheckIssue i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", i.code());
        m.put("message", i.message());
        m.put("field", i.field());
        m.put("itemKey", i.itemKey());
        return m;
    }

    private static VersionRef ref(String id, BigDecimal v) {
        return new VersionRef(VersionTarget.MASTER_CODE, id, v);
    }

    private static CategoryDefTarget parseTarget(String raw) {
        if (isBlank(raw)) {
            return null;
        }
        try {
            return CategoryDefTarget.valueOf(raw.trim());
        } catch (IllegalArgumentException e) {
            throw invalid("defTarget 형식이 올바르지 않습니다: " + raw);
        }
    }

    private static MasterCodeSegmentTable parseTable(String raw) {
        try {
            return MasterCodeSegmentTable.valueOf(raw.trim());
        } catch (IllegalArgumentException e) {
            throw invalid("table 형식이 올바르지 않습니다: " + raw);
        }
    }

    /** 요청·응답의 버전은 문자열이다(JS number 는 2.000 의 소수 자릿수를 잃는다). */
    private static BigDecimal parseVer(String raw) {
        if (isBlank(raw)) {
            throw invalid("ver 가 필요합니다");
        }
        try {
            return new BigDecimal(raw.trim()).setScale(VER_SCALE);
        } catch (NumberFormatException | ArithmeticException e) {
            throw invalid("ver 형식이 올바르지 않습니다: " + raw);
        }
    }

    private static String str(BigDecimal v) {
        return v == null ? null : v.setScale(VER_SCALE).toPlainString();
    }

    private static String display(BigDecimal v) {
        return "v" + str(v);
    }

    private static String text(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }
}
