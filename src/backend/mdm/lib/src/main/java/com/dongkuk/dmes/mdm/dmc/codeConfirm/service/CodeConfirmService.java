package com.dongkuk.dmes.mdm.dmc.codeConfirm.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryChanges;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryChanges.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeConfirmChecks;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionNumbers;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeDiffConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmCodeVerId;
import com.dongkuk.dmes.mdm.repository.MdmCodeVerRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 마루 코드 버전 확정({@code codeConfirm}) OASIS 진입 서비스 — TSK-06-05 design.md §6.5.
 *
 * <p>BPMN {@code services/dmc/codeConfirm.bpmn} 의 {@code actionGateway} 분기(search·view·validate·confirm)와 1:1 이다.
 * <b>{@code @Transactional} 을 붙이지 않는다(MUST, F9)</b> — 트랜잭션은 OASIS 프로세스와 공통 서비스의
 * {@code TransactionTemplate} 이 건다. 확정은 {@link VersionStateService#confirm} 하나로만 하고(I17) VER·CODE 표를 직접
 * 고치지 않는다. 검사·diff 는 레지스트리의 MASTER_CODE 확정 검사 SPI 를 호출 시점에 꺼내 쓴다 — 생성자로 받으면 SPI 를
 * 가짜로 바꾸는 시나리오 시험 컨텍스트가 기동하지 못한다. 응답은 codeCateEdit 관례대로 {@code Map} 이다.
 */
@Service("codeConfirmService")
public class CodeConfirmService {

    private static final Logger log = LoggerFactory.getLogger(CodeConfirmService.class);

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String APPLY_FROM = "applyFrom";

    private final MasterCodeLedgerQueries ledger;
    private final MasterCodeSegmentService segments;
    private final VersionSpiRegistry spis;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final VersionStateService versionState;
    private final MdmCodeVerRepository verRepository;
    private final EntityManager entityManager;
    private final MdmStewardGuard stewardGuard;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public CodeConfirmService(MasterCodeLedgerQueries ledger, MasterCodeSegmentService segments,
                              VersionSpiRegistry spis, ApplyFromOrderCheck applyFromOrderCheck,
                              VersionStateService versionState, MdmCodeVerRepository verRepository,
                              EntityManager entityManager, MdmStewardGuard stewardGuard, MdmCurrentUser currentUser,
                              Clock clock) {
        this.ledger = ledger;
        this.segments = segments;
        this.spis = spis;
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.versionState = versionState;
        this.verRepository = verRepository;
        this.entityManager = entityManager;
        this.stewardGuard = stewardGuard;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 확정 대기 목록(MDM 원천의 DRAFT 마다 한 행)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(CodeConfirmSearchRequest request) {
        String keyword = request == null ? null : trimToNull(request.getKeyword());
        LocalDateTime now = now();
        List<Header> headers = ledger.headers(keyword).stream()
                .filter(h -> MasterCodeSourceKind.MDM.name().equals(h.sourceKind())).toList();
        Map<String, List<VerRow>> versions = ledger.versions(headers.stream().map(Header::maruCodeId).toList());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Header h : headers) {
            List<VerRow> vers = versions.getOrDefault(h.maruCodeId(), List.of());
            String codeStatus = MasterCodeVersionSummary.summarize(vers, h.status(), now).effectiveStatus();
            vers.stream().filter(CodeConfirmService::isDraft).sorted(Comparator.comparing(VerRow::ver)).forEach(v -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("maruCodeId", h.maruCodeId());
                row.put("maruCodeName", h.maruCodeName());
                row.put("ver", v.ver().toPlainString());
                row.put("verLabel", MasterCodeVersionNumbers.label(v.ver()));
                row.put("verKind", v.verKind());
                row.put("ownerId", v.ownerId());
                row.put("codeStatus", codeStatus);
                rows.add(row);
            });
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 헤더·대상 버전·직전 RELEASED·diff·카테고리 요약
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(CodeConfirmViewRequest request) {
        Target t = target(request == null ? null : request.getMaruCodeId(), request == null ? null : request.getVer());
        return buildView(t);
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate — 검사 10행(쓰기 없음, I22). 3항은 ApplyFromOrderCheck 로 덮는다(D3, I21)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> validate(CodeConfirmValidateRequest request) {
        Target t = target(request == null ? null : request.getMaruCodeId(), request == null ? null : request.getVer());
        if (!isDraft(t.version())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
        LocalDateTime applyFrom = parseApplyFrom(request.getApplyFrom());
        LocalDateTime now = now();
        LocalDateTime previousApplyFrom = t.previous().map(VerRow::applyFrom).orElse(null);
        List<MasterCodeCheckItemResult> results = spi().report(new ConfirmCheckRequest(t.ref(), applyFrom,
                previousApplyFrom, currentUser.userId(), now)).results();

        List<Map<String, Object>> rows = new ArrayList<>(results.size());
        int rejected = 0;
        int warned = 0;
        for (MasterCodeCheckItemResult r : results) {
            MasterCodeCheckStatus status = r.status();
            List<MdmCheckIssue> issues = r.issues();
            if (r.item() == MasterCodeConfirmCheckItem.APPLY_FROM_ORDER && status == MasterCodeCheckStatus.DELEGATED) {
                Optional<MdmCheckIssue> issue = applyFromOrderCheck.check(previousApplyFrom, applyFrom);
                status = issue.isPresent() ? MasterCodeCheckStatus.REJECTED : MasterCodeCheckStatus.PASSED;
                issues = issue.map(List::of).orElse(List.of());
            }
            rejected += status == MasterCodeCheckStatus.REJECTED ? 1 : 0;
            warned += status == MasterCodeCheckStatus.WARNED ? 1 : 0;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("no", r.item().no());
            row.put("item", r.item().name());
            row.put("severity", r.item().severity().name());
            row.put("status", status.name());
            row.put("issues", issues.stream().map(CodeConfirmService::issueMap).toList());
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("rejectedCount", rejected);
        result.put("warnedCount", warned);
        result.put("applyFrom", text(applyFrom));
        result.put("futureApplyFrom", applyFrom.isAfter(now));
        result.put("serverNow", text(now));
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: confirm — 담당자 가드(I20) → VersionStateService.confirm(I17)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> confirm(CodeConfirmRequest request) {
        stewardGuard.requireSteward(); // I20 — 입력을 보기 전에
        String id = request == null ? null : trimToNull(request.getMaruCodeId());
        if (id == null) {
            throw invalid("마루 코드를 고르세요");
        }
        VersionRef ref = new VersionRef(VersionTarget.MASTER_CODE, id, parseVer(request.getVer()));
        if (request.getRowVersion() == null) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        LocalDateTime applyFrom = parseApplyFrom(request.getApplyFrom());
        boolean acknowledged = Boolean.TRUE.equals(request.getWarningsAcknowledged());

        ConfirmResult confirmed = versionState.confirm(new ConfirmCommand(ref, request.getRowVersion(), applyFrom,
                currentUser.userId(), acknowledged));
        log.info("[codeConfirm] confirm — {} applyFrom={} closed={}", ref, text(applyFrom), confirmed.closedPrevious());

        Map<String, Object> result = buildView(target(id, ref.ver().toPlainString()));
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("ver", verText(confirmed.confirmed().ver()));
        done.put("rowVersion", confirmed.rowVersion());
        result.put("confirmed", done);
        result.put("closedPreviousVer", confirmed.closedPrevious() == null ? null : verText(confirmed.closedPrevious().ver()));
        result.put("warnings", confirmed.warnings().stream().map(CodeConfirmService::issueMap).toList());
        return result;
    }

    // ── 공통 ──

    /** 헤더·버전 목록·대상 버전·직전 RELEASED(I8 — {@link MasterCodeConfirmChecks#previousReleased}). */
    private record Target(Header header, List<VerRow> versions, VerRow version, Optional<VerRow> previous) {
        VersionRef ref() {
            return new VersionRef(VersionTarget.MASTER_CODE, header.maruCodeId(), version.ver());
        }
    }

    /** ver 가 비면 DRAFT(여럿이면 가장 작은 번호). 코드·버전이 없으면 MDM021. */
    private Target target(String maruCodeId, String ver) {
        String id = trimToNull(maruCodeId);
        if (id == null) {
            throw invalid("마루 코드를 고르세요");
        }
        Header header = ledger.header(id).orElseThrow(() -> invalid("마루 코드가 없습니다"));
        List<VerRow> versions = ledger.versions(id);
        VerRow version;
        if (trimToNull(ver) == null) {
            version = versions.stream().filter(CodeConfirmService::isDraft).min(Comparator.comparing(VerRow::ver))
                    .orElseThrow(() -> invalid("확정할 DRAFT 가 없습니다"));
        } else {
            BigDecimal v = parseVer(ver);
            version = versions.stream().filter(r -> r.ver().compareTo(v) == 0).findFirst()
                    .orElseThrow(() -> invalid("버전이 없습니다: " + v.toPlainString()));
        }
        return new Target(header, versions, version, MasterCodeConfirmChecks.previousReleased(versions, version.ver()));
    }

    private Map<String, Object> buildView(Target t) {
        LocalDateTime now = now();
        VerRow v = t.version();
        VersionRef ref = t.ref();

        Map<String, Object> header = new LinkedHashMap<>();
        header.put("maruCodeId", t.header().maruCodeId());
        header.put("maruCodeName", t.header().maruCodeName());
        header.put("status", MasterCodeVersionSummary.summarize(t.versions(), t.header().status(), now).effectiveStatus());
        header.put("sourceKind", t.header().sourceKind());

        Map<String, Object> version = new LinkedHashMap<>();
        version.put("ver", v.ver().toPlainString());
        version.put("verLabel", MasterCodeVersionNumbers.label(v.ver()));
        version.put("verKind", v.verKind());
        version.put("status", v.status());
        version.put("ownerId", v.ownerId());
        version.put("rowVersion", v.rowVersion());
        version.put("applyFrom", text(v.applyFrom()));
        version.put("applyTo", text(v.applyTo()));
        version.put("requestedBy", requestedBy(ref));
        version.put("releasedAt", text(v.releasedAt()));
        version.put("restoredFrom", v.restoredFrom() == null ? null : v.restoredFrom().toPlainString());

        Map<String, Object> previous = t.previous().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ver", p.ver().toPlainString());
            m.put("verLabel", MasterCodeVersionNumbers.label(p.ver()));
            m.put("applyFrom", text(p.applyFrom()));
            return m;
        }).orElse(null);

        MasterCodeConfirmCheckSpi spi = spi();
        List<Map<String, Object>> diff = spi.diff(ref).entries().stream().map(CodeConfirmService::diffMap).toList();
        MasterCodeCategoryChanges.Summary categories = MasterCodeCategoryChanges.summarize(
                t.previous().map(p -> segments.viewAt(new VersionRef(VersionTarget.MASTER_CODE, ref.objectId(), p.ver())))
                        .orElse(null),
                segments.viewAt(ref));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("header", header);
        result.put("version", version);
        result.put("previous", previous);
        result.put("firstVersion", previous == null);
        result.put("diff", diff);
        result.put("categoryChanges", categories.changed().stream().map(CodeConfirmService::changeMap).toList());
        result.put("unchangedCategories", categories.unchanged());
        result.put("serverNow", text(now));
        return result;
    }

    /** 확정자(REQUESTED_BY) — 조회 모델 VerRow 에 없는 칸이라 엔티티로 읽는다. 같은 트랜잭션의 네이티브 UPDATE 뒤라 새로 읽는다. */
    private String requestedBy(VersionRef ref) {
        return verRepository.findById(new MdmCodeVerId(ref.objectId(), ref.ver())).map(e -> {
            if (entityManager.contains(e)) {
                entityManager.refresh(e);
            }
            return e.getRequestedBy();
        }).orElse(null);
    }

    /** 레지스트리의 MASTER_CODE 확정 검사 SPI(운영 {@code MasterCodeConfirmCheck}). 보고서·diff 가 없는 구현이면 설정 오류다. */
    private MasterCodeConfirmCheckSpi spi() {
        VersionConfirmCheckSpi spi = spis.confirmCheck(VersionTarget.MASTER_CODE);
        if (spi instanceof MasterCodeConfirmCheckSpi masterCode) {
            return masterCode;
        }
        throw new IllegalStateException("MASTER_CODE 확정 검사 SPI 가 MasterCodeConfirmCheckSpi 가 아닙니다: " + spi);
    }

    private static Map<String, Object> diffMap(VersionDiffEntry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("table", e.key().substring(0, e.key().indexOf(MasterCodeDiffConventions.TABLE_KEY_SEPARATOR)));
        m.put("key", e.key());
        m.put("kind", e.kind().name());
        m.put("oldValues", e.oldValues());
        m.put("newValues", e.newValues());
        return m;
    }

    private static Map<String, Object> changeMap(Change c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("cateId", c.cateId());
        m.put("cateName", c.cateName());
        m.put("kind", c.kind());
        m.put("beforeCount", c.beforeCount());
        m.put("afterCount", c.afterCount());
        m.put("addedCodes", c.addedCodes());
        m.put("removedCodes", c.removedCodes());
        m.put("reduced", c.reduced());
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

    private static boolean isDraft(VerRow row) {
        return VersionStatus.DRAFT.name().equals(row.status());
    }

    /** {@code yyyy-MM-dd HH:mm:ss}(KST). 빈 값은 REQUIRED_VALUE, 형식 오류·열린 끝 이상은 INVALID_VALUE(field applyFrom). */
    static LocalDateTime parseApplyFrom(String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw applyFromError(ErrorCode.REQUIRED_VALUE, "적용 시작 일시를 입력하세요");
        }
        LocalDateTime parsed;
        try {
            parsed = LocalDateTime.parse(v, TEXT);
        } catch (DateTimeParseException e) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다: " + v);
        }
        if (!parsed.isBefore(VersionConventions.OPEN_END)) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 9999-12-31 00:00:00 보다 앞이어야 합니다");
        }
        return parsed;
    }

    private static BusinessException applyFromError(ErrorCode code, String message) {
        return new BusinessException(code, message,
                List.of(ErrorDetail.ofGrid(null, null, APPLY_FROM, code.getCode(), message)));
    }

    /** "1.001" → 1.001(scale 3). 형식 오류는 MDM021. */
    static BigDecimal parseVer(String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw invalid("버전 번호가 없습니다");
        }
        try {
            BigDecimal ver = new BigDecimal(v);
            if (ver.signum() < 0 || ver.stripTrailingZeros().scale() > MasterCodeConventions.FIRST_VER.scale()) {
                throw invalid("버전 번호 형식이 올바르지 않습니다: " + v);
            }
            return ver.setScale(MasterCodeConventions.FIRST_VER.scale());
        } catch (NumberFormatException e) {
            throw invalid("버전 번호 형식이 올바르지 않습니다: " + v);
        }
    }

    private static String verText(BigDecimal ver) {
        return ver.setScale(MasterCodeConventions.FIRST_VER.scale()).toPlainString();
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : TEXT.format(value);
    }

    private static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
