package com.dongkuk.dmes.mdm.dmc.codeItemEdit.service;

import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.same;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.valid;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateSaves;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.Resolution;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.ResolvedRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemChecks;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemEntry;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemIssueCode;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemSegmentOps;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRejections;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRows;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPatchRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.repository.MdmCodeItemRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * 코드 편집({@code codeItemEdit}) OASIS 진입 서비스(TSK-06-03 design.md §6.6).
 *
 * <p>BPMN {@code services/dmc/codeItemEdit.bpmn} 의 {@code actionGateway} 7 분기와 1:1 이다: {@code search}·{@code view}·
 * {@code compare}(→ {@link #preview}, READ)와 {@code validate}·{@code save}·{@code restore}(→ {@link #revert})·
 * {@code execute}(→ {@link #patch}, EDIT·CONFIRM, D6).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다.</b> 붙이면 CGLIB 프록시가 파라미터 이름을 지워 OASIS 이름 바인딩이
 * {@code ParameterName must not be null} 로 죽는다(F9). 트랜잭션은 OASIS 가 action 단위로 건다 — 적용 중 예외가 나면
 * {@code beginDraftWrite} 의 ROW_VERSION 증가분과 앞선 쓰기가 함께 롤백된다(불변 규칙 24).
 *
 * <p>저장은 요청 행을 메모리에서 V 모습에 먼저 적용해 검사하고({@link #validate} 와 같은 코드), 통과했을 때만
 * {@code beginDraftWrite} → 선분 서비스 순으로 쓴다. 그래서 거부된 저장은 ROW_VERSION 을 건드리지 않는다(불변 규칙 22).
 * 경미 수정은 DRAFT 경로와 분리한 별도 액션이고 ROW_VERSION·배포 순번을 올리지 않는다(D7).
 *
 * <p>2026-09-28 화면 합치기로 카테고리 편집이 이 화면에 들어왔다. validate·save 는 그리드 세 개({@code rows}·
 * {@code categories}·{@code members})를 파라미터 이름으로 받는다(F9 — 프런트는 빈 배열이라도 셋을 늘 보낸다). 카테고리 쪽
 * 판정·쓰기는 {@link MasterCodeCateSaves} 를 {@code CodeCateEditService} 와 함께 쓴다.
 */
@Service("codeItemEditService")
public class CodeItemEditService {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int VER_SCALE = VersionTarget.MASTER_CODE.versionScale();
    /** 경미 수정을 막는 확정 전 상태(D8). */
    private static final Set<String> PATCH_BLOCKING = Set.of(VersionStatus.DRAFT.name(),
            VersionStatus.REQUESTED.name(), VersionStatus.APPROVED.name());

    private final MasterCodeRows rows;
    private final MasterCodeSegmentService segments;
    private final MasterCodeItemSegmentOps itemOps;
    private final VersionWriteGuard versionWriteGuard;
    private final MdmCurrentUser currentUser;
    private final MdmCodeItemRepository itemRepository;
    private final Clock clock;
    private final MetaRevisionRecorder recorder;

    public CodeItemEditService(MasterCodeRows rows, MasterCodeSegmentService segments, MasterCodeItemSegmentOps itemOps,
                               VersionWriteGuard versionWriteGuard, MdmCurrentUser currentUser,
                               MdmCodeItemRepository itemRepository, Clock clock,
                               MetaRevisionRecorder recorder) {
        this.rows = rows;
        this.segments = segments;
        this.itemOps = itemOps;
        this.versionWriteGuard = versionWriteGuard;
        this.currentUser = currentUser;
        this.itemRepository = itemRepository;
        this.clock = clock;
        this.recorder = recorder;
    }

    // ── action: search ────────────────────────────────────────────────────

    /** 마루 코드 목록(ID 순). 방언별 LIKE 차이를 피하려고 Java 에서 거른다(ID·이름 부분 일치, 대소문자 무시). */
    public Map<String, Object> search(CodeItemSearchRequest request) {
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
            m.put("lvlCnt", code.getLvlCnt());
            codes.add(m);
        }
        return Map.of("codes", codes);
    }

    // ── action: view ──────────────────────────────────────────────────────

    public Map<String, Object> view(CodeItemViewRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        List<MdmCodeVer> versions = rows.versions(code.getMaruCodeId()).stream()
                .sorted(Comparator.comparing(MdmCodeVer::getVer).reversed()).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("header", headerMap(code));
        result.put("versions", versions.stream().map(CodeItemEditService::versionMap).toList());

        Optional<MdmCodeVer> chosen = isBlank(request.getVer()) ? defaultVersion(versions)
                : Optional.of(version(versions, parseVer(request.getVer())));
        if (chosen.isEmpty()) {
            result.put("selected", null);
            result.put("rows", List.of());
            result.put("closed", List.of());
            result.put("closedCateItems", List.of());
            result.put("categories", List.of());
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
        sel.put("patchable", mdm && VersionStatus.RELEASED.name().equals(selected.getStatus()));
        sel.put("warning", unapplied >= 2 ? "MULTIPLE_UNAPPLIED" : null);
        result.put("selected", sel);

        String id = code.getMaruCodeId();
        List<MdmCodeItem> items = rows.items(id);
        List<MdmCodeCateItem> cateItems = rows.cateItems(id);
        Map<String, String> statusByVer = new LinkedHashMap<>();
        versions.forEach(ver -> statusByVer.put(str(ver.getVer()), ver.getStatus()));
        Set<BigDecimal> blockingVers = new HashSet<>();
        versions.stream().filter(ver -> PATCH_BLOCKING.contains(ver.getStatus())).forEach(ver -> blockingVers.add(ver.getVer()));

        List<Map<String, Object>> rowMaps = new ArrayList<>();
        items.stream().filter(e -> valid(e.getFromVer(), e.getToVer(), v))
                .map(MasterCodeItemSegmentOps::row).sorted(MasterCodeCategoryResolver.ITEM_ORDER)
                .forEach(r -> {
                    Map<String, Object> m = rowMap(r);
                    Optional<MdmCodeItem> old = items.stream()
                            .filter(e -> e.getCode().equals(r.code()) && same(e.getToVer(), v)).findFirst();
                    if (same(r.fromVer(), v)) {
                        m.put("change", old.isPresent() ? "CHANGED" : "ADDED");
                        m.put("prev", old.map(o -> valueMap(MasterCodeItemSegmentOps.valuesOf(o))).orElse(null));
                    } else {
                        m.put("change", "NONE");
                        m.put("prev", null);
                    }
                    m.put("tableCategories", cateItems.stream()
                            .filter(ci -> ci.getCode().equals(r.code()) && valid(ci.getFromVer(), ci.getToVer(), v))
                            .map(MdmCodeCateItem::getCateId).sorted().toList());
                    boolean fromReleased = VersionStatus.RELEASED.name().equals(statusByVer.get(str(r.fromVer())));
                    m.put("patchBlocked", fromReleased && items.stream().anyMatch(e -> e.getCode().equals(r.code())
                            && blockingVers.stream().anyMatch(b -> same(b, e.getFromVer()))));
                    rowMaps.add(m);
                });
        result.put("rows", rowMaps);

        List<Map<String, Object>> closed = new ArrayList<>();
        items.stream().filter(e -> same(e.getToVer(), v))
                .filter(e -> items.stream().noneMatch(n -> n.getCode().equals(e.getCode()) && same(n.getFromVer(), v)))
                .map(MasterCodeItemSegmentOps::row).sorted(MasterCodeCategoryResolver.ITEM_ORDER)
                .forEach(r -> {
                    Map<String, Object> m = rowMap(r);
                    m.put("change", "REMOVED");
                    m.put("tableCategories", cateItems.stream()
                            .filter(ci -> ci.getCode().equals(r.code()) && same(ci.getToVer(), v))
                            .map(MdmCodeCateItem::getCateId).sorted().toList());
                    closed.add(m);
                });
        result.put("closed", closed);
        result.put("closedCateItems", cateItems.stream().filter(ci -> same(ci.getToVer(), v))
                .sorted(Comparator.comparing(MdmCodeCateItem::getCateId).thenComparing(MdmCodeCateItem::getCode))
                .map(ci -> Map.<String, Object>of("cateId", ci.getCateId(), "code", ci.getCode())).toList());
        result.put("categories", segments.viewAt(ref(id, v)).categories().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("cateId", c.definition().cateId());
            m.put("cateName", c.definition().cateName());
            m.put("defKind", c.definition().defKind().name());
            return m;
        }).toList());
        return result;
    }

    // ── action: compare ───────────────────────────────────────────────────

    /** 카테고리 미리보기 — 저장된 정의 기준, V 에 유효한 카테고리만(D11). */
    public Map<String, Object> preview(CodeItemPreviewRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        version(rows.versions(code.getMaruCodeId()), v);
        MasterCodeVersionView view = segments.viewAt(ref(code.getMaruCodeId(), v));
        MasterCodeCateRow cate = view.categories().stream()
                .filter(c -> c.definition().cateId().equals(request.getCateId())).findFirst()
                .orElseThrow(() -> invalid("이 버전에 없는 카테고리다: " + request.getCateId()));
        Resolution r = MasterCodeCategoryResolver.resolve(view.items(), cate, view.cateItems());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cateId", cate.definition().cateId());
        result.put("cateName", cate.definition().cateName());
        result.put("ver", str(v));
        result.put("defKind", r.defKind());
        result.put("defTarget", r.defTarget());
        result.put("defExpr", r.defExpr());
        result.put("hitCount", r.hitCount());
        result.put("total", r.total());
        result.put("invalidExpression", r.invalidExpression());
        result.put("warnings", r.warnings().stream().map(CodeItemEditService::issueMap).toList());
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

    /**
     * 저장 검사만 한다 — 이슈를 성공 응답으로 돌려준다(F11). 소유자·상태는 보지 않는다(읽기 전용 검사). 판정은 save 와 같은
     * {@link #project} 다: 코드 행 이슈는 {@code issues}, 카테고리·소속 이슈는 {@code cateIssues} 에 싣는다.
     */
    public Map<String, Object> validate(CodeItemSaveRequest request, List<Map<String, Object>> rows,
                                        List<Map<String, Object>> categories, List<Map<String, Object>> members) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        version(this.rows.versions(code.getMaruCodeId()), v);
        Map<String, Object> result = new LinkedHashMap<>();
        if (MasterCodeSourceKind.EXTERNAL.name().equals(code.getSourceKind())) {
            result.put("issues", List.of(issueMap(externalIssue(code))));
            result.put("cateIssues", List.of());
            return result;
        }
        Projected projected = project(code, v, orEmpty(rows), orEmpty(categories), orEmpty(members));
        result.put("issues", projected.issues().stream().map(CodeItemEditService::issueMap).toList());
        List<MdmCheckIssue> cateIssues = new ArrayList<>(projected.cate().issues());
        if (projected.cate().touchesBase()) {
            // save 는 RESERVED_CATEGORY 로 거부한다 — validate 도 같은 판정을 이슈로 알린다.
            cateIssues.add(new MdmCheckIssue(MdmErrorCode.RESERVED_CATEGORY.name(),
                    "BASE 는 예약 카테고리라 바꿀 수 없다", null, CategoryConventions.BASE_CATE_ID));
        }
        result.put("cateIssues", cateIssues.stream().map(CodeItemEditService::issueMap).toList());
        return result;
    }

    // ── action: save ──────────────────────────────────────────────────────

    /**
     * 코드 행·카테고리·TABLE 소속 세 그리드를 한 번에 저장한다(2026-09-28 화면 합치기 — 카테고리 편집이 이 화면으로 들어왔다).
     * 모든 검사(코드 행·카테고리·BASE 예약·EXTERNAL)를 쓰기 전에 끝내고, {@code beginDraftWrite} 는 한 번만 부른다
     * (ROW_VERSION 은 한 번만 오른다). 쓰기 순서는 코드 행 → 카테고리 → 소속이다 — 같은 저장에서 넣은 코드를 소속으로 넣을
     * 수 있어야 해서다.
     */
    public Map<String, Object> save(CodeItemSaveRequest request, List<Map<String, Object>> rows,
                                    List<Map<String, Object>> categories, List<Map<String, Object>> members) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        requireVersionExists(code.getMaruCodeId(), v);
        if (MasterCodeSourceKind.EXTERNAL.name().equals(code.getSourceKind())) {
            throw MasterCodeRejections.saveRejected(List.of(externalIssue(code)));
        }
        if (orEmpty(rows).isEmpty() && orEmpty(categories).isEmpty() && orEmpty(members).isEmpty()) {
            throw invalid("저장할 변경이 없습니다");
        }
        if (request.getRowVersion() == null) {
            throw invalid("rowVersion 이 없습니다");
        }
        Projected projected = project(code, v, orEmpty(rows), orEmpty(categories), orEmpty(members));
        if (!projected.issues().isEmpty() || !projected.cate().issues().isEmpty()) {
            List<MdmCheckIssue> all = new ArrayList<>(projected.issues());
            all.addAll(projected.cate().issues());
            throw MasterCodeRejections.saveRejected(all);
        }
        if (projected.cate().touchesBase()) {
            throw MdmErrors.of(MdmErrorCode.RESERVED_CATEGORY);
        }
        // 여기까지 쓰기가 없다(불변 규칙 22). 아래부터는 OASIS 트랜잭션 안에서 함께 커밋·롤백된다.
        VersionRef ref = ref(code.getMaruCodeId(), v);
        long rowVersion = versionWriteGuard.beginDraftWrite(ref, request.getRowVersion(), currentUser.userId());
        // 행마다 segments.addItem·changeItem·removeItem 을 부른 것과 같다 — 다만 버전·코드 행을 행마다 다시 읽지 않는다.
        Map<String, Object> closedCategories = new LinkedHashMap<>(itemOps.applyItems(ref, projected.changes()));
        MasterCodeCateSaves.apply(segments, ref, projected.cate());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rowVersion", rowVersion);
        result.put("closedCategories", closedCategories);
        return result;
    }

    // ── action: restore ───────────────────────────────────────────────────

    public Map<String, Object> revert(CodeItemRevertRequest request) {
        MdmCode code = header(request.getMaruCodeId());
        BigDecimal v = parseVer(request.getVer());
        requireVersionExists(code.getMaruCodeId(), v);
        if (MasterCodeSourceKind.EXTERNAL.name().equals(code.getSourceKind())) {
            throw MasterCodeRejections.saveRejected(List.of(externalIssue(code)));
        }
        if (request.getRowVersion() == null || isBlank(request.getCode())) {
            throw invalid("rowVersion·code 가 필요합니다");
        }
        VersionRef ref = ref(code.getMaruCodeId(), v);
        long rowVersion = versionWriteGuard.beginDraftWrite(ref, request.getRowVersion(), currentUser.userId());
        segments.revert(ref, new MasterCodeSegmentKey(MasterCodeSegmentTable.ITEM, null, request.getCode()));
        List<MasterCodeItemEntry> after = entries(segments.viewAt(ref));
        if (after.stream().anyMatch(e -> e.code().equals(request.getCode()))) {
            List<MdmCheckIssue> issues = MasterCodeItemChecks.check(checkHeader(code), after, Set.of(request.getCode()));
            if (!issues.isEmpty()) {
                throw MasterCodeRejections.saveRejected(issues);
            }
        }
        return Map.of("rowVersion", rowVersion);
    }

    // ── action: execute ───────────────────────────────────────────────────

    /**
     * RELEASED 코드 행 경미 수정(04:522-549). 이름·약칭·순서·설명만 제자리에서 바꾼다 — DTO 에 다른 칸이 없다(불변 규칙 28).
     * 검사 순서: 역할 → EXTERNAL → 미적용 2개 → 행 존재 → from_ver 가 RELEASED → 확정 전 버전이 같은 키를 고쳤는가(D8).
     */
    public Map<String, Object> patch(CodeItemPatchRequest request) {
        requireSteward();
        MdmCode code = header(request.getMaruCodeId());
        if (MasterCodeSourceKind.EXTERNAL.name().equals(code.getSourceKind())) {
            throw MasterCodeRejections.patchRejected(List.of(externalIssue(code)));
        }
        String id = code.getMaruCodeId();
        List<MdmCodeVer> versions = rows.versions(id);
        if (versions.stream().filter(this::isUnapplied).count() >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS);
        }
        BigDecimal from = parseVer(request.getFromVer());
        List<MdmCodeItem> items = rows.items(id);
        MdmCodeItem target = items.stream()
                .filter(e -> e.getCode().equals(request.getCode()) && same(e.getFromVer(), from)).findFirst()
                .orElseThrow(() -> invalid("경미 수정할 행이 없습니다: " + request.getCode() + "@" + str(from)));
        MdmCodeVer fromVersion = version(versions, from);
        if (!VersionStatus.RELEASED.name().equals(fromVersion.getStatus())) {
            throw MasterCodeRejections.patchRejected(List.of(new MdmCheckIssue(
                    MasterCodeItemIssueCode.PATCH_NOT_RELEASED.name(), "확정된 버전의 행만 경미 수정한다", "fromVer",
                    request.getCode())));
        }
        boolean blocked = versions.stream().filter(ver -> PATCH_BLOCKING.contains(ver.getStatus()))
                .anyMatch(ver -> items.stream()
                        .anyMatch(e -> e.getCode().equals(request.getCode()) && same(e.getFromVer(), ver.getVer())));
        if (blocked) {
            throw MasterCodeRejections.patchRejected(List.of(new MdmCheckIssue(
                    MasterCodeItemIssueCode.PATCH_KEY_CHANGED_IN_UNAPPLIED.name(), "DRAFT에서 고치세요", "code",
                    request.getCode())));
        }
        // checkRow 를 거치지 않으므로 4000바이트 상한(ORA-12899 예방)을 여기서 따로 본다 — 쓰기 전.
        List<MdmCheckIssue> lengthIssues = MasterCodeItemChecks.checkPatchText(request.getCode(),
                text(request.getName()), text(request.getAlterName()), text(request.getDescription()));
        if (!lengthIssues.isEmpty()) {
            throw MasterCodeRejections.patchRejected(lengthIssues);
        }
        target.setName(text(request.getName()));
        target.setAlterName(text(request.getAlterName()));
        target.setSeq(request.getSeq());
        target.setDescription(text(request.getDescription()));
        MdmCodeItem saved = itemRepository.saveAndFlush(target);
        recorder.code(id); // RELEASED 행 제자리 수정 — 메타 캐시 무효화(spec 2026-10-02 §3.3)
        return Map.of("row", rowMap(MasterCodeItemSegmentOps.row(saved)));
    }

    // ── 공통 ────────────────────────────────────────────────────────────

    /**
     * 경미 수정은 마루 코드 담당자(MDM_STEWARD)만 한다(04:546) — 없으면 MDM013. 범용 가드 {@code MdmStewardGuard} 는
     * TSK-06-02 가 만든다(팀장 지시). 이 Task 는 같은 부품을 새로 만들지 않고 이 서비스 안에 최소로 둔다.
     */
    private void requireSteward() {
        // 06-02 머지 뒤 MdmStewardGuard.requireSteward 로 연결
        if (!currentUser.roleIds().contains(MdmRoles.STEWARD)) {
            throw MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED);
        }
    }

    /** issues·changes 는 코드 행 몫, cate 는 카테고리·소속 두 그리드 몫이다. */
    private record Projected(List<MdmCheckIssue> issues, List<Change> changes, MasterCodeCateSaves.Plan cate) {
    }

    /**
     * V 모습에 요청 행을 메모리로 적용하고 touched 행을 검사한 뒤, 그 적용 뒤 모습 위에서 카테고리·소속 그리드를 검사한다 —
     * validate 와 save 가 같은 코드를 쓴다. 소속으로 넣을 수 있는 코드는 코드 행 변경을 적용한 뒤의 코드다(같은 저장에서 넣은
     * 코드는 받고, 지운 코드는 MEMBER_CODE_NOT_FOUND).
     */
    private Projected project(MdmCode code, BigDecimal v, List<Map<String, Object>> requestRows,
                              List<Map<String, Object>> categoryRows, List<Map<String, Object>> memberRows) {
        MasterCodeVersionView view = segments.viewAt(ref(code.getMaruCodeId(), v));
        MasterCodeItemProjection.Result applied = MasterCodeItemProjection.apply(entries(view), requestRows);
        List<MdmCheckIssue> issues = new ArrayList<>(applied.issues());
        issues.addAll(MasterCodeItemChecks.check(checkHeader(code), applied.viewAfter(), applied.touched()));
        Set<String> codesAfter = new LinkedHashSet<>();
        applied.viewAfter().forEach(e -> codesAfter.add(e.code()));
        MasterCodeCateSaves.Plan cate = MasterCodeCateSaves.project(
                view.categories().stream().map(MasterCodeCateRow::definition).toList(), codesAfter, categoryRows,
                memberRows);
        return new Projected(List.copyOf(issues), applied.changes(), cate);
    }

    private static List<Map<String, Object>> orEmpty(List<Map<String, Object>> grid) {
        return grid == null ? List.of() : grid;
    }

    private static List<MasterCodeItemEntry> entries(MasterCodeVersionView view) {
        return view.items().stream().map(r -> new MasterCodeItemEntry(r.code(), r.values())).toList();
    }

    private static MasterCodeItemChecks.Header checkHeader(MdmCode code) {
        return new MasterCodeItemChecks.Header(code.getLvlCnt(), labels(code));
    }

    private static List<String> labels(MdmCode c) {
        return java.util.Arrays.asList(c.getAttr01Name(), c.getAttr02Name(), c.getAttr03Name(), c.getAttr04Name(),
                c.getAttr05Name(), c.getAttr06Name(), c.getAttr07Name(), c.getAttr08Name(), c.getAttr09Name(),
                c.getAttr10Name());
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

    /**
     * 미적용 = DRAFT, 또는 적용 시작이 지금보다 뒤인 RELEASED(경계 = now 는 적용됨, F5). REQUESTED·APPROVED 는 결재 보류로
     * 지금 생기지 않지만 생기면 미적용으로 센다. {@code VersionPreconditions} 가 package-private 이라 같은 정의를 둔다.
     */
    private boolean isUnapplied(MdmCodeVer ver) {
        String status = ver.getStatus();
        if (VersionStatus.DRAFT.name().equals(status) || VersionStatus.REQUESTED.name().equals(status)
                || VersionStatus.APPROVED.name().equals(status)) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        return VersionStatus.RELEASED.name().equals(status) && ver.getApplyFrom() != null
                && ver.getApplyFrom().isAfter(now);
    }

    private static MdmCheckIssue externalIssue(MdmCode code) {
        return new MdmCheckIssue(MasterCodeItemIssueCode.SOURCE_EXTERNAL.name(),
                "원천이 EXTERNAL 인 마루 코드는 MDM 화면에서 저장하지 않는다", null, code.getMaruCodeId());
    }

    private static Map<String, Object> headerMap(MdmCode code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("maruCodeId", code.getMaruCodeId());
        m.put("maruCodeName", code.getMaruCodeName());
        m.put("sourceKind", code.getSourceKind());
        m.put("status", code.getStatus());
        m.put("lvlCnt", code.getLvlCnt());
        List<Map<String, Object>> attrLabels = new ArrayList<>();
        List<String> labels = labels(code);
        for (int i = 0; i < labels.size(); i++) {
            if (labels.get(i) != null && !labels.get(i).isBlank()) {
                attrLabels.add(Map.of("no", i + 1, "label", labels.get(i)));
            }
        }
        m.put("attrLabels", attrLabels);
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

    private static Map<String, Object> rowMap(MasterCodeItemRow r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", r.code());
        m.put("fromVer", str(r.fromVer()));
        m.put("toVer", str(r.toVer()));
        m.putAll(valueMap(r.values()));
        return m;
    }

    private static Map<String, Object> valueMap(MasterCodeItemValues v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", v.name());
        m.put("alterName", v.alterName());
        m.put("seq", v.seq());
        m.put("description", v.description());
        for (int i = 0; i < v.lvls().size(); i++) {
            m.put("lvl" + (i + 1), v.lvls().get(i));
        }
        for (int i = 0; i < v.attrs().size(); i++) {
            m.put(String.format("attr%02d", i + 1), v.attrs().get(i));
        }
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

    /** 요청·응답의 버전은 문자열이다(JS number 는 2.000 의 소수 자릿수를 잃는다, §6.1). */
    private static BigDecimal parseVer(String raw) {
        if (isBlank(raw)) {
            throw invalid("ver 가 필요합니다");
        }
        return VersionRules.parseVer(raw);
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
}
