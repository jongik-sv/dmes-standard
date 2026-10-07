package com.dongkuk.dmes.mdm.dmb.layoutConfirm.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.ConfirmResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutChangeClassifier;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnPins;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutTimes;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.dmb.layout.confirm.LayoutConfirmChecks;
import com.dongkuk.dmes.mdm.dmb.layout.confirm.LayoutConfirmReport;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 레이아웃 버전 확정({@code layoutConfirm}) OASIS 진입 서비스(D-144 3단계, 스펙 §7) — 전문·헤더 공용. 판정 시각은 apply_from 이다.
 *
 * <p>BPMN {@code services/dmb/layoutConfirm.bpmn} 의 {@code actionGateway} 분기(search·view·validate·confirm)와 1:1 이다.
 * {@code @Transactional}·{@code TransactionTemplate} 을 쓰지 않는다(F11·I19) — 트랜잭션은 OASIS action 한 건이다. 확정은 공통
 * {@link VersionStateService#confirm}(소유자·담당자·미적용 하나·apply_from 순서·확정 검사 SPI·CAS·직전 닫기·부모 INUSE)으로만 하고, 같은
 * 트랜잭션에서 항목 컬럼 속성 고정(D-151 — {@link LayoutColumnPins})·변경 분류·전환 방식·본문 스냅샷을 기록한다 — 하나라도 실패하면
 * 확정도 되돌아간다. 고정이 분류보다 먼저다: 분류의 기준 버전(직전 RELEASED)도 자기 확정 때 고정한 값으로 합성되므로, 확정 사이의 사전
 * 변경이 이번 확정의 변경 분류에 잡힌다(의도된 동작).
 *
 * <p>헤더 확정은 EAI 표준 헤더 연결({@code TB_MDM_EAI.HEADER_LAYOUT_ID})을 옮기지 않는다(Ruling P3-15). EAI 의 표준 헤더는 시각 T 에
 * RELEASED 인 헤더 버전의 {@code EAI_CODE} 로 해석한다({@code LayoutVersions.eaiHeadersAt}) — 미래 apply_from 확정은 그 시각부터, 확정
 * 취소는 저절로 옛 헤더로 돌아온다.
 */
@Service("layoutConfirmService")
public class LayoutConfirmService {

    private static final Logger log = LoggerFactory.getLogger(LayoutConfirmService.class);


    private final LayoutConfirmChecks checks;
    private final LayoutColumnPins columnPins;
    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final MdmLayoutRepository layoutRepository;
    private final VersionStateService stateService;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final MdmNativeAuditSupport audit;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final EntityManager entityManager;

    public LayoutConfirmService(LayoutConfirmChecks checks, LayoutColumnPins columnPins, LayoutVersionStore store, LayoutQueries queries,
                                MdmLayoutRepository layoutRepository, VersionStateService stateService,
                                ApplyFromOrderCheck applyFromOrderCheck, MdmNativeAuditSupport audit, MdmCurrentUser currentUser,
                                Clock clock, EntityManager entityManager) {
        this.entityManager = entityManager;
        this.checks = checks;
        this.columnPins = columnPins;
        this.store = store;
        this.queries = queries;
        this.layoutRepository = layoutRepository;
        this.stateService = stateService;
        this.applyFromOrderCheck = applyFromOrderCheck;
        this.audit = audit;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ── action: search — 확정 대기 목록(전문·헤더의 DRAFT 마다 한 행, 종류·이름 순) ──

    public Map<String, Object> search(LayoutConfirmSearchRequest request) {
        String keyword = request == null ? null : LayoutRows.text(request.getKeyword());
        List<Map<String, Object>> rows = new ArrayList<>();
        // 조건(검색어)이 없고 limit 이 오면 앞쪽 limit 건만 DB 가 읽고 전체 건수는 COUNT 로 센다(화면 성능 가이드 R1)
        int limit = request == null || request.getLimit() == null ? 0 : request.getLimit();
        Long totalCount = null;
        List<Object[]> pairs;
        if (limit > 0 && keyword == null) {
            pairs = queries.drafts(limit);
            totalCount = queries.draftCount();
        } else {
            pairs = queries.drafts();
        }
        for (Object[] pair : pairs) {
            MdmLayoutVer v = (MdmLayoutVer) pair[0];
            MdmLayout l = (MdmLayout) pair[1];
            if (keyword != null && !LayoutRows.matches(l.getLayoutName(), keyword) && !String.valueOf(l.getLayoutId()).equals(keyword)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", l.getLayoutId());
            row.put("LAYOUT_KIND", l.getLayoutKind());
            row.put("LAYOUT_NAME", l.getLayoutName());
            row.put("VER", LayoutRows.ver(v.getVer()));
            row.put("VER_KIND", v.getVerKind() == null ? null : v.getVerKind().name());
            row.put("OWNER_ID", v.getOwnerId());
            row.put("ROW_VERSION", v.getRowVersion());
            row.put("BASE_VER", LayoutRows.ver(v.getBaseVer()));
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        if (limit > 0) {
            // limit 을 보낸 호출자에게만 싣는다 — 보내지 않는 기존 호출자의 응답 모양은 그대로다
            long total = totalCount != null ? totalCount : rows.size();
            result.put("totalCount", total);
            result.put("truncated", rows.size() < total);
        }
        return result;
    }

    // ── action: view — 레이아웃·대상 버전(ver 가 비면 DRAFT)·직전 RELEASED ──

    public Map<String, Object> view(LayoutConfirmViewRequest request) {
        Target t = target(request == null ? null : request.getLayoutId(), request == null ? null : request.getVer());
        MdmLayout l = t.layout();
        MdmLayoutVer v = t.version();

        Map<String, Object> layout = new LinkedHashMap<>();
        layout.put("LAYOUT_ID", l.getLayoutId());
        layout.put("LAYOUT_KIND", l.getLayoutKind());
        layout.put("LAYOUT_NAME", l.getLayoutName());
        layout.put("STATUS", l.getStatus());

        Map<String, Object> version = new LinkedHashMap<>();
        version.put("VER", LayoutRows.ver(v.getVer()));
        version.put("VER_KIND", v.getVerKind() == null ? null : v.getVerKind().name());
        version.put("STATUS", v.getStatus());
        version.put("OWNER_ID", v.getOwnerId());
        version.put("ROW_VERSION", v.getRowVersion());
        version.put("BASE_VER", LayoutRows.ver(v.getBaseVer()));
        version.put("APPLY_FROM", LayoutTimes.text(v.getApplyFrom()));
        version.put("APPLY_TO", LayoutTimes.text(v.getApplyTo()));

        Map<String, Object> previous = t.previous().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("VER", LayoutRows.ver(p.getVer()));
            m.put("APPLY_FROM", LayoutTimes.text(p.getApplyFrom()));
            m.put("APPLY_TO", LayoutTimes.text(p.getApplyTo()));
            return m;
        }).orElse(null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layout", layout);
        result.put("version", version);
        result.put("previous", previous);
        result.put("firstVersion", previous == null);
        return result;
    }

    // ── action: validate — 확정 검사(apply_from 시점 합성) + 적용 순서 + 변경 분류. 쓰기 없음 ──

    public Map<String, Object> validate(LayoutConfirmValidateRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "요청이 비었습니다.");
        }
        Target t = target(request.getLayoutId(), request.getVer());
        if (!t.version().isDraft()) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
        // 판정 시각이 비면 지금으로 대신하지 않는다 — 합성기는 null 시각을 받지 않는다(MdmLayoutSnapshotResolver)
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());
        LayoutConfirmReport report = checks.report(t.ref(), applyFrom);

        List<Map<String, Object>> rows = new ArrayList<>();
        report.errors().forEach(i -> rows.add(issueMap("ERROR", i)));
        report.warnings().forEach(i -> rows.add(issueMap("WARNING", i)));

        Map<String, Object> applyFromCheck = new LinkedHashMap<>();
        if (t.previous().isEmpty()) {
            applyFromCheck.put("ok", true);
            applyFromCheck.put("message", "최초 버전 — 적용 순서 검사를 하지 않습니다");
        } else {
            Optional<MdmCheckIssue> issue = applyFromOrderCheck.check(t.previous().get().getApplyFrom(), applyFrom);
            applyFromCheck.put("ok", issue.isEmpty());
            applyFromCheck.put("message", issue.map(MdmCheckIssue::message).orElse(null));
        }

        LayoutChangeClassifier.Change change = report.change();
        Map<String, Object> changeMap = null;
        if (change != null) {
            changeMap = new LinkedHashMap<>();
            changeMap.put("switchMode", change.switchMode());
            changeMap.put("kinds", change.kinds().stream().map(Enum::name).toList());
            changeMap.put("summary", change.summary());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("checks", rows);
        result.put("applyFromCheck", applyFromCheck);
        result.put("change", changeMap);
        result.put("simultaneous", change != null && LayoutChangeClassifier.SIMULTANEOUS.equals(change.switchMode()));
        result.put("futureApplyFrom", applyFrom.isAfter(now()));
        result.put("impact", report.impact());
        result.put("eais", report.eaiCodes());
        return result;
    }

    // ── action: confirm — 공통 엔진 확정 → 같은 트랜잭션에서 분류·전환·본문 스냅샷 기록 ──

    public Map<String, Object> confirm(LayoutConfirmRequest request) {
        requireActionTransaction();
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "요청이 비었습니다.");
        }
        MdmLayout layout = load(request.getLayoutId());
        BigDecimal ver = LayoutVersions.requireVer(request.getVer());
        long expected = LayoutVersions.requireRowVersion(request.getRowVersion());
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());
        long id = layout.getLayoutId();
        VersionRef ref = new VersionRef(VersionTarget.LAYOUT, String.valueOf(id), VersionNumbers.scaled(ver));

        ConfirmResult r = stateService.confirm(new ConfirmCommand(ref, expected, applyFrom, currentUser.userId(),
                Boolean.TRUE.equals(request.getWarningsAcknowledged())));
        // 확정 검사 SPI 가 같은 트랜잭션에서 버전 엔티티를 관리 상태로 읽어 두었고(DRAFT·옛 apply_to) 공통 엔진은 상태·구간을 네이티브로
        // 바꿨다 — 밀린 쓰기를 내보내고 비워 아래 분류·본문 스냅샷이 확정 뒤 행을 다시 읽게 한다(RuleConfirmService 의 I22a 와 같다, 검토 M1).
        // 지금 분류·스냅샷은 상태·구간을 쓰지 않아 결과가 같지만, 그것을 보는 코드가 붙어도 조용히 틀리지 않게 한다
        entityManager.flush();
        entityManager.clear();
        // 같은 트랜잭션 — 아래가 실패하면 확정도 되돌아간다. 고정(D-151)은 항목 엔티티를 읽지 않고 네이티브로 쓰므로 바로 앞 clear 뒤에
        // 둔다 — 아래 분류·본문 스냅샷이 고정값이 든 항목 행을 새로 읽는다
        columnPins.pin(id, ver);
        LayoutChangeClassifier.Change change = checks.classify(id, ver, applyFrom);
        String kinds = change.kinds().stream().map(Enum::name).collect(Collectors.joining(","));
        // EAI 변경 문구까지 붙은 최종 문자열 — DB 에 쓰는 CHANGE_SUMMARY 만 칸(4000 BYTE)에 맞춰 접는다(ORA-12899 예방). 응답은 원문 그대로
        // (의도: 확정 직후 화면은 원문을 보이고, 나중에 DB 값을 읽는 버전 이력은 4000 바이트를 넘는 요약을 「…외 N건」 으로 접어 보인다)
        String summary = change.summary();
        int n = store.recordConfirm(id, ver, change.switchMode(), kinds, LayoutChangeClassifier.fitSummary(summary),
                checks.bodySnapshotJson(id, ver), audit.currentStamp());
        if (n != 1) {
            throw new IllegalStateException("확정 기록 갱신 행 수가 1이 아닙니다: " + n + " " + ref);
        }
        log.info("[layoutConfirm] confirm — {} applyFrom={} closed={} switchMode={}", ref, LayoutTimes.text(applyFrom),
                r.closedPrevious(), change.switchMode());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", id);
        out.put("ver", VersionNumbers.plain(ver));
        out.put("rowVersion", r.rowVersion());
        out.put("closedPreviousVer", r.closedPrevious() == null ? null : VersionNumbers.plain(r.closedPrevious().ver()));
        out.put("switchMode", change.switchMode());
        out.put("changeKinds", kinds);
        out.put("changeSummary", summary);
        return out;
    }

    // ── 공통 ──

    private record Target(MdmLayout layout, MdmLayoutVer version, Optional<MdmLayoutVer> previous) {
        VersionRef ref() {
            return new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), version.getVer());
        }
    }

    /** ver 가 비면 그 레이아웃의 DRAFT(없으면 INVALID_VALUE), 있으면 그 버전(없으면 L11). 직전 RELEASED 는 버전 번호로 고른다. */
    private Target target(Long layoutId, String ver) {
        MdmLayout layout = load(layoutId);
        List<MdmLayoutVer> versions = store.versions(layout.getLayoutId());
        MdmLayoutVer version;
        if (LayoutRows.text(ver) == null) {
            version = LayoutVersions.draft(versions).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                    "확정할 DRAFT 가 없습니다: " + layout.getLayoutId()));
        } else {
            BigDecimal wanted = LayoutVersions.requireVer(ver);
            version = versions.stream().filter(v -> VersionNumbers.same(v.getVer(), wanted)).findFirst()
                    .orElseThrow(() -> LayoutRejections.noVersion(layout.getLayoutId(), wanted));
        }
        return new Target(layout, version, LayoutVersions.previousReleased(versions, version.getVer()));
    }

    private MdmLayout load(Long layoutId) {
        if (layoutId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "레이아웃 ID 는 필수입니다.");
        }
        return layoutRepository.findById(layoutId).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                "레이아웃을 찾을 수 없습니다: " + layoutId));
    }

    /**
     * 확정은 OASIS action 트랜잭션 안에서만 — 공통 엔진이 자기 트랜잭션을 먼저 커밋하면 분류·스냅샷 기록 없는 RELEASED 가 남는다(I19 로
     * 여기서 트랜잭션을 열지 않는다).
     */
    private static void requireActionTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("layoutConfirm.confirm 은 트랜잭션(OASIS action) 안에서만 부를 수 있습니다");
        }
    }

    private static Map<String, Object> issueMap(String severity, MdmCheckIssue i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("severity", severity);
        m.put("code", i.code());
        m.put("message", i.message());
        m.put("field", i.field());
        m.put("itemKey", i.itemKey());
        return m;
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
