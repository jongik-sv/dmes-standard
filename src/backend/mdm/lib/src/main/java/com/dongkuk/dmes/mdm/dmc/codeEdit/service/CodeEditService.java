package com.dongkuk.dmes.mdm.dmc.codeEdit.service;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;
import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRemoval;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionNumbers;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSegments;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.Summary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDeprecateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDraftRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditFlags;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRow;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 마루 코드 수정({@code codeEdit}) OASIS 진입 서비스 — TSK-06-02 design.md §6.8.
 *
 * <p>정본: {@code docs/mdm/screens/codeEdit/codeEdit_기능설계서.md}. BPMN {@code services/dmc/codeEdit.bpmn} 의
 * {@code actionGateway} 분기와 1:1 이다(design §6.1 표).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — 트랜잭션은 OASIS 프로세스가 건다. 모든 쓰기 액션은 첫 줄에서
 * 담당자 가드를 부른다(I12) — 단 <b>해제({@link #release})만 예외다</b>: ADR-0002 D3 이 해제를 "소유자만 한다"(역할 미보)로
 * 정했고 공통 {@code DefaultDraftOwnershipService}·룰 영역 {@code RuleVersionService.unlock} 과 같은 판정이다. TB_MDM_CODE
 * 쓰기는 {@link MdmCode} 엔티티 경로 하나로 한다(네이티브 UPDATE 와 섞으면 flush 때 옛 감사 카운터로 덮어쓴다). 응답은 flush
 * 뒤 네이티브 조회 모델로 만든다(I23).
 *
 * <p>2026-09-28 사용자 결정: 한 번도 RELEASED 된 적 없는 마루 코드는 [폐기] 대신 [삭제] 로 행째 지운다. 새 action 을 만들지
 * 않고 기존 {@code delete} 에 {@code target: "CODE"} 를 실어 {@link #delete} 안에서 가른다(action 어휘는 MdmActions 16개로
 * 닫혀 있다). 버튼 판정은 {@link CodeEditFlags#isNeverReleased()}·{@link CodeEditFlags#isCanDeleteCode()} 다.
 */
@Service("codeEditService")
public class CodeEditService {

    private static final Logger log = LoggerFactory.getLogger(CodeEditService.class);

    static final int NAME_MAX = 100;
    static final int LABEL_MAX = 100;
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final EntityManager entityManager;
    private final MdmCodeRepository codes;
    private final MasterCodeLedgerQueries ledger;
    private final MasterCodeVersionSegments segments;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService versionState;
    private final DraftOwnershipService ownership;
    private final MdmStewardGuard stewardGuard;
    private final MdmCurrentUser currentUser;
    private final MasterCodeRemoval removal;
    private final Clock clock;
    private final MetaRevisionRecorder recorder;

    public CodeEditService(EntityManager entityManager, MdmCodeRepository codes, MasterCodeLedgerQueries ledger,
                           MasterCodeVersionSegments segments, VersionWriteGuard writeGuard,
                           VersionStateService versionState, DraftOwnershipService ownership,
                           MdmStewardGuard stewardGuard, MdmCurrentUser currentUser, MasterCodeRemoval removal,
                           Clock clock, MetaRevisionRecorder recorder) {
        this.entityManager = entityManager;
        this.codes = codes;
        this.ledger = ledger;
        this.segments = segments;
        this.writeGuard = writeGuard;
        this.versionState = versionState;
        this.ownership = ownership;
        this.stewardGuard = stewardGuard;
        this.currentUser = currentUser;
        this.removal = removal;
        this.clock = clock;
        this.recorder = recorder;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 코드 선택 콤보 데이터
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> searchCodes(CodeEditSearchRequest request) {
        String keyword = request == null ? null : trimToNull(request.getKeyword());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Header h : ledger.headers(keyword)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("maruCodeId", h.maruCodeId());
            row.put("maruCodeName", h.maruCodeName());
            row.put("status", h.status());
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view
    // ────────────────────────────────────────────────────────────────

    public CodeEditView view(CodeEditViewRequest request) {
        String id = request == null ? null : trimToNull(request.getMaruCodeId());
        if (id == null) {
            throw invalid("마루 코드를 고르세요");
        }
        return buildView(id);
    }

    // ────────────────────────────────────────────────────────────────
    // action: save(method=saveHeader) — 헤더 경미 수정(I19)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView saveHeader(CodeHeaderSaveRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        Summary summary = summary(code);
        if (summary.unapplied().size() >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS); // I6
        }
        requireAuditVer(code, request.getAuditVer());

        String name = trimToNull(request.getMaruCodeName());
        if (name == null || name.length() > NAME_MAX) {
            throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
        }
        int lvlCnt = request.getLvlCnt() == null ? code.getLvlCnt() : request.getLvlCnt();
        if (lvlCnt < MasterCodeConventions.LVL_CNT_MIN || lvlCnt > MasterCodeConventions.LVL_CNT_MAX) {
            throw invalid("계층 칸 수는 " + MasterCodeConventions.LVL_CNT_MIN + "~" + MasterCodeConventions.LVL_CNT_MAX
                    + " 이어야 합니다");
        }
        String[] labels = {
            label(request.getAttr01Name(), 1), label(request.getAttr02Name(), 2), label(request.getAttr03Name(), 3),
            label(request.getAttr04Name(), 4), label(request.getAttr05Name(), 5), label(request.getAttr06Name(), 6),
            label(request.getAttr07Name(), 7), label(request.getAttr08Name(), 8), label(request.getAttr09Name(), 9),
            label(request.getAttr10Name(), 10)};
        if (lvlCnt < code.getLvlCnt()) {
            // 줄이기 — 현재 적용 버전보다 뒤에 닫히는(열린 행 포함) 코드 행이 뒤 칸에 값을 가지면 거부한다.
            int used = ledger.maxLvlInUse(code.getMaruCodeId(), summary.currentAppliedVer());
            if (used > lvlCnt) {
                throw invalid("LVL" + used + " 에 값이 있는 코드가 있어 계층 칸 수를 " + lvlCnt + " 로 줄일 수 없습니다");
            }
        }

        code.setMaruCodeName(name);
        code.setDescription(trimToNull(request.getDescription()));
        code.setLvlCnt(lvlCnt);
        code.setAttr01Name(labels[0]);
        code.setAttr02Name(labels[1]);
        code.setAttr03Name(labels[2]);
        code.setAttr04Name(labels[3]);
        code.setAttr05Name(labels[4]);
        code.setAttr06Name(labels[5]);
        code.setAttr07Name(labels[6]);
        code.setAttr08Name(labels[7]);
        code.setAttr09Name(labels[8]);
        code.setAttr10Name(labels[9]);
        markInUseIfApplied(code, summary); // I18
        recorder.code(code.getMaruCodeId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
        log.info("[codeEdit] save — id={} lvlCnt={}", code.getMaruCodeId(), lvlCnt);
        return buildView(code.getMaruCodeId());
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute(method=deprecate) — DEPRECATED 전이(I13)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView deprecate(CodeDeprecateRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        if (MaruObjectStatus.DEPRECATED.name().equals(code.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "이미 폐기된 마루 코드입니다", List.of());
        }
        int unapplied = summary(code).unapplied().size();
        if (unapplied >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS);
        }
        if (unapplied == 1) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "미적용 버전이 있어 폐기할 수 없습니다", List.of());
        }
        requireAuditVer(code, request.getAuditVer());
        // 행(VER·ITEM·CATE)은 지우지 않는다 — 과거 기준일 판정이 계속된다(04 「코드 삭제와 마루 코드 폐기」).
        code.setStatus(MaruObjectStatus.DEPRECATED.name());
        recorder.code(code.getMaruCodeId()); // 메타 캐시 무효화(spec 2026-10-02 §3.3)
        log.info("[codeEdit] execute(deprecate) — id={}", code.getMaruCodeId());
        return buildView(code.getMaruCodeId());
    }

    // ────────────────────────────────────────────────────────────────
    // action: reg(method=createVersion)·restore(method=restoreVersion) — 새 버전(I1~I5·I11·I13·I15)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView createVersion(CodeVersionCreateRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        requireNotDeprecated(code);
        VersionKind kind = parseKind(request.getVerKind());
        Summary summary = summary(code);
        writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, code.getMaruCodeId()); // I5 — MDM006
        BigDecimal next = nextNumber(summary.maxVer(), kind);
        insertDraft(code, next, kind, null);
        markInUseIfApplied(code, summary); // I18
        log.info("[codeEdit] reg — id={} ver={} kind={}", code.getMaruCodeId(), next, kind);
        return buildView(code.getMaruCodeId());
    }

    public CodeEditView restoreVersion(CodeVersionRestoreRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        requireNotDeprecated(code);
        VersionKind kind = parseKind(request.getVerKind());
        Summary summary = summary(code);
        writeGuard.checkCanCreateVersion(VersionTarget.MASTER_CODE, code.getMaruCodeId()); // I5
        BigDecimal next = nextNumber(summary.maxVer(), kind);
        BigDecimal source = parseVer(request.getSourceVer());
        boolean released = ledger.versions(code.getMaruCodeId()).stream()
                .anyMatch(v -> v.ver().compareTo(source) == 0 && VersionStatus.RELEASED.name().equals(v.status()));
        if (!released || source.compareTo(next) >= 0) {
            throw invalid("복원 원본은 확정(RELEASED)된 버전이어야 합니다"); // D13
        }
        VersionRef draft = insertDraft(code, next, kind, source);
        segments.fillFrom(draft, source);
        markInUseIfApplied(code, summary);
        log.info("[codeEdit] restore — id={} ver={} from={}", code.getMaruCodeId(), next, source);
        return buildView(code.getMaruCodeId());
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete(method=delete) — target 으로 가른다: 비면 DRAFT 삭제, "CODE" 면 마루 코드 통째 삭제
    // ────────────────────────────────────────────────────────────────

    /**
     * BPMN 게이트웨이는 action 으로만 가르므로 delete 한 분기 안에서 {@code target} 으로 가른다({@code RuleEditService.delete}
     * 선례). 응답은 DRAFT 삭제면 {@link CodeEditView}, 마루 코드 삭제면 {@code {deleted: "CODE", maruCodeId}} 다.
     *
     * <p>{@code target="CONFIRM"} 는 확정 취소다(D8) — 같은 delete 분기를 쓰되 의미가 다르므로 값을 분리했다.
     */
    public Object delete(CodeDraftRequest request) {
        String target = request == null ? null : trimToNull(request.getTarget());
        if (target == null) {
            return deleteDraft(request);
        }
        if (CodeDraftRequest.TARGET_CODE.equals(target)) {
            return deleteCode(request);
        }
        if (CodeDraftRequest.TARGET_CONFIRM.equals(target)) {
            return cancelConfirm(request);
        }
        throw invalid("삭제 대상은 비우거나 CODE·CONFIRM 이어야 합니다: " + target);
    }

    /**
     * 확정 취소 — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다(ADR-0002 D8, TSK-02-01 D4-1).
     *
     * <p>판정·구간 복구·상위 상태는 공용 버전 상태 서비스가 한다. 여기서는 담당자 가드(I12)와 요청 조립만 맡는다.
     */
    public CodeEditView cancelConfirm(CodeDraftRequest request) {
        stewardGuard.requireSteward(); // I12
        VersionRef ref = draftRef(request);
        versionState.cancelConfirm(ref, rowVersion(request), currentUser.userId());
        log.info("[codeEdit] delete(CONFIRM) — {}", ref);
        return buildView(ref.objectId());
    }

    /**
     * 한 번도 RELEASED 된 적 없는 마루 코드를 행째 지운다(2026-09-28 사용자 결정 — 원천 04 에 물리 삭제 규정이 없어 새로 둔 규칙).
     * 판정 "RELEASED 된 적 없음" 은 TB_MDM_CODE_VER 의 RELEASED·CANCELLED 행 유무와 RELEASED_AT 값으로 한다
     * (TB_MDM_CODE.STATUS 는 늦게 INUSE 로 올라 기준이 못 된다). {@code RELEASED_AT} 도 보는 이유: 확정 취소(D8)가
     * 되돌린 행의 STATUS 를 DRAFT 로 만들므로, 상태만 보면 "확정한 적 없는 코드"가 되어 이력째 지워 버린다(D8-9).
     * 검사 순서: 담당자·원천 MDM → RELEASED 이력 → 다른 사용자 DRAFT → auditVer → 도메인 참조 →
     * 수신 로그 → 식 참조. 모두 쓰기 전에 끝내고, 통과하면 자식 표 → TB_MDM_CODE 순으로 지운다.
     */
    private Map<String, Object> deleteCode(CodeDraftRequest request) {
        MdmCode code = requireWritable(request.getMaruCodeId());
        String id = code.getMaruCodeId();
        List<VerRow> versions = ledger.versions(id);
        if (!neverReleased(versions)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                    "확정(RELEASED)된 적이 있는 마루 코드는 삭제할 수 없습니다. 폐기하세요", List.of());
        }
        for (VerRow v : versions) {
            if (ownedByOther(v)) {
                throw MdmErrors.of(MdmErrorCode.DRAFT_ALREADY_OWNED,
                        MasterCodeVersionNumbers.label(v.ver()) + " 을(를) " + v.ownerId() + " 이(가) 편집 중이라 삭제할 수 없습니다",
                        List.of());
            }
        }
        requireAuditVer(code, request.getAuditVer());
        List<String> domains = removal.referencingDomainIds(id);
        if (!domains.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                    "이 마루 코드를 참조하는 도메인이 있어 삭제할 수 없습니다(도메인 ID " + String.join(", ", domains) + ")",
                    List.of());
        }
        if (removal.receiptCount(id) > 0) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                    "수신 이력(TB_MDM_CODE_RECV)이 있는 마루 코드는 삭제할 수 없습니다", List.of());
        }
        List<String> exprRefs = removal.expressionReferences(id);
        if (!exprRefs.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                    "이 마루 코드를 MASTER 식으로 참조하는 곳이 있어 삭제할 수 없습니다(" + summarize(exprRefs) + ")", List.of());
        }
        removal.deleteChildRows(id);
        codes.delete(code);
        entityManager.flush();
        recorder.code(id); // 메타 캐시 무효화 — 지운 코드의 "없음" 캐시도 다시 확인하게 한다
        log.info("[codeEdit] delete(CODE) — id={} versions={}", id, versions.size());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", CodeDraftRequest.TARGET_CODE);
        result.put("maruCodeId", id);
        return result;
    }

    /**
     * RELEASED 된 적 없음 = RELEASED·CANCELLED 버전이 없고 확정 시각이 남은 버전도 없다(CANCELLED 는 RELEASED 에서만
     * 간다). 버전 0개도 해당.
     *
     * <p>{@code RELEASED_AT} 을 함께 보는 게 D8-9 다 — 확정 취소로 되돌린 행은 STATUS 가 DRAFT 이지만 확정 시각이 남으므로
     * "확정된 적 없음"을 통과하면 안 된다.
     */
    private static boolean neverReleased(List<VerRow> versions) {
        return versions.stream().noneMatch(v -> VersionStatus.RELEASED.name().equals(v.status())
                || VersionStatus.CANCELLED.name().equals(v.status())
                || v.releasedAt() != null);
    }

    /** 다른 사용자가 소유한 DRAFT. 소유자 없는(해제된) DRAFT 는 막지 않는다. */
    private boolean ownedByOther(VerRow v) {
        return VersionStatus.DRAFT.name().equals(v.status()) && v.ownerId() != null
                && !v.ownerId().equals(currentUser.userId());
    }

    /** null 안전 소유자 비교(확정 취소 판정용). */
    private static boolean ownedBy(VerRow v, String userId) {
        return v.ownerId() != null && v.ownerId().equals(userId);
    }

    /** 메시지가 길어지지 않게 앞 5건만 적는다. */
    private static String summarize(List<String> refs) {
        int shown = Math.min(5, refs.size());
        String head = String.join(", ", refs.subList(0, shown));
        return refs.size() > shown ? head + " 외 " + (refs.size() - shown) + "건" : head;
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete(target 없음)·lock·unlock·handover — 공통 서비스에 행위자 = 요청 사용자(I22)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView deleteDraft(CodeDraftRequest request) {
        stewardGuard.requireSteward(); // I12 — 공통 서비스는 삭제에 역할을 보지 않는다
        VersionRef ref = draftRef(request);
        versionState.deleteDraft(ref, rowVersion(request), currentUser.userId()); // 미적용 2개여도 허용(I6)
        log.info("[codeEdit] delete — {}", ref);
        return buildView(ref.objectId());
    }

    public CodeEditView acquire(CodeDraftRequest request) {
        VersionRef ref = ownershipTarget(request);
        ownership.acquire(ref, rowVersion(request), currentUser.userId());
        return buildView(ref.objectId());
    }

    /**
     * DRAFT 해제(unlock) — <b>역할을 보지 않는다</b>(ADR-0002 D3: "해제·넘기기·저장·삭제·확정은 소유자만 한다. 관리자 강제
     * 해제·넘기기는 없다. 소유권은 역할이 아니라 {@code owner_id} 로 판정하고, 역할은 '할 수 있는가' 만 판정한다").
     *
     * <p>그래서 담당자 가드를 두지 않는다 — {@code DefaultDraftOwnershipService} 계약("해제는 역할을 요구하지 않는다 —
     * 역할을 잃은 소유자도 풀 수 있어야 DRAFT 가 묶이지 않는다")과 룰 영역 {@code RuleVersionService.unlock} 이 같은 판정이다.
     * 이 가드가 있었을 때 소유자 본인(예: {@code OWNER_ID='admin'} 인 PROC_CD 2.000 DRAFT)이 담당자 역할이 없어 자기
     * 잠금을 영영 못 풀었다. 소유자·row_version·DRAFT 검사는 공통 서비스가 그대로 하고, 미적용 2개 규칙(I6·D7)만 유지한다.
     */
    public CodeEditView release(CodeDraftRequest request) {
        VersionRef ref = releaseTarget(request);
        ownership.release(ref, rowVersion(request), currentUser.userId());
        log.info("[codeEdit] unlock — {}", ref);
        return buildView(ref.objectId());
    }

    public CodeEditView handover(CodeDraftRequest request) {
        VersionRef ref = ownershipTarget(request);
        ownership.handover(ref, rowVersion(request), currentUser.userId(), trimToNull(request.getNewOwnerId()));
        return buildView(ref.objectId());
    }

    /** 소유권 연산 머리: 담당자 가드(I12) → 미적용 2개 이상이면 MDM007(D7 — 공통 서비스는 막지 않는다). */
    private VersionRef ownershipTarget(CodeDraftRequest request) {
        stewardGuard.requireSteward();
        return releaseTarget(request);
    }

    /** 미적용 2개(I6·D7)만 보는 머리 — 해제(unlock)는 담당자 가드를 거치지 않는다(위 {@link #release} javadoc). */
    private VersionRef releaseTarget(CodeDraftRequest request) {
        VersionRef ref = draftRef(request);
        LocalDateTime now = now();
        long unapplied = ledger.versions(ref.objectId()).stream()
                .filter(v -> MasterCodeVersionSummary.isUnapplied(v, now)).count();
        if (unapplied >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS);
        }
        return ref;
    }

    private VersionRef draftRef(CodeDraftRequest request) {
        String id = request == null ? null : trimToNull(request.getMaruCodeId());
        if (id == null) {
            throw invalid("마루 코드를 고르세요");
        }
        return new VersionRef(VersionTarget.MASTER_CODE, id, parseVer(request.getVer()));
    }

    private static long rowVersion(CodeDraftRequest request) {
        if (request.getRowVersion() == null) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        return request.getRowVersion();
    }

    /** 새 DRAFT 행 — 소유자는 요청 사용자(I11), rv 0. 1.000 이면 같은 트랜잭션에서 BASE 를 만든다(I4). */
    private VersionRef insertDraft(MdmCode code, BigDecimal ver, VersionKind kind, BigDecimal restoredFrom) {
        MdmCodeVer row = new MdmCodeVer(code.getMaruCodeId(), ver, kind.name());
        row.setOwnerId(currentUser.userId());
        row.setRestoredFrom(restoredFrom);
        entityManager.persist(row);
        entityManager.flush();
        VersionRef ref = new VersionRef(VersionTarget.MASTER_CODE, code.getMaruCodeId(), ver);
        if (ver.compareTo(MasterCodeConventions.FIRST_VER) == 0) {
            segments.createBaseCategory(ref);
        }
        return ref;
    }

    /** I1~I4 — max 는 모든 버전(CANCELLED·DRAFT 포함). 불가하면 MDM021. */
    static BigDecimal nextNumber(BigDecimal max, VersionKind kind) {
        if (kind == VersionKind.MAJOR) {
            if (!MasterCodeVersionNumbers.canMajor(max)) {
                throw invalid("major 번호가 상한(" + MasterCodeConventions.MAX_MAJOR + ")을 넘습니다");
            }
            return MasterCodeVersionNumbers.nextMajor(max);
        }
        if (max == null) {
            throw invalid("버전이 없으면 major 만 만들 수 있습니다");
        }
        if (!MasterCodeVersionNumbers.canMinor(max)) {
            throw invalid("minor 번호가 " + MasterCodeConventions.MAX_MINOR + " 에 닿았습니다. major 를 올리십시오");
        }
        return MasterCodeVersionNumbers.nextMinor(max);
    }

    private static void requireNotDeprecated(MdmCode code) {
        if (MaruObjectStatus.DEPRECATED.name().equals(code.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기된 마루 코드는 새 버전을 만들 수 없습니다", List.of());
        }
    }

    private static VersionKind parseKind(String value) {
        String v = trimToNull(value);
        for (VersionKind kind : VersionKind.values()) {
            if (kind.name().equals(v)) {
                return kind;
            }
        }
        throw invalid("버전 종류는 MAJOR 또는 MINOR 여야 합니다");
    }

    /** "1.001" → 1.001(scale 3). 음수·소수 넷째 자리 이상·지수 표기 등 형식 오류는 MDM021(공통 {@link VersionRules#parseVer}). */
    static BigDecimal parseVer(String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw invalid("버전 번호가 없습니다");
        }
        return VersionRules.parseVer(v);
    }

    // ── 공통 ──

    /** 쓰기 공통 머리: 담당자 가드(I12) → 코드 로드(없으면 MDM021) → 원천 MDM(I8). */
    MdmCode requireWritable(String maruCodeId) {
        stewardGuard.requireSteward();
        String id = trimToNull(maruCodeId);
        MdmCode code = id == null ? null : codes.findById(id).orElse(null);
        if (code == null) {
            throw invalid("마루 코드가 없습니다");
        }
        if (!MasterCodeSourceKind.MDM.name().equals(code.getSourceKind())) {
            throw invalid("원천이 MDM 이 아닌 마루 코드는 이 화면에서 고칠 수 없습니다");
        }
        return code;
    }

    Summary summary(MdmCode code) {
        return MasterCodeVersionSummary.summarize(ledger.versions(code.getMaruCodeId()), code.getStatus(), now());
    }

    /** 저장 CREATED 이고 적용된 RELEASED 가 있으면 같은 트랜잭션에서 INUSE 로 저장한다(I18, ADR-0002 D6). */
    static void markInUseIfApplied(MdmCode code, Summary summary) {
        if (MaruObjectStatus.CREATED.name().equals(code.getStatus())
                && MaruObjectStatus.INUSE.name().equals(summary.effectiveStatus())) {
            code.setStatus(MaruObjectStatus.INUSE.name());
        }
    }

    CodeEditView buildView(String id) {
        Header h = ledger.header(id).orElseThrow(() -> invalid("마루 코드가 없습니다"));
        List<VerRow> versions = ledger.versions(id);
        Summary s = MasterCodeVersionSummary.summarize(versions, h.status(), now());
        boolean steward = currentUser.roleIds().contains(MdmRoles.STEWARD);
        boolean sourceMdm = MasterCodeSourceKind.MDM.name().equals(h.sourceKind());
        boolean deprecated = MaruObjectStatus.DEPRECATED.name().equals(h.status());

        CodeHeaderView header = new CodeHeaderView();
        header.setMaruCodeId(h.maruCodeId());
        header.setMaruCodeName(h.maruCodeName());
        header.setDescription(h.description());
        header.setLvlCnt(h.lvlCnt());
        header.setSourceKind(h.sourceKind());
        header.setStatus(s.effectiveStatus());
        header.setStoredStatus(h.status());
        header.setAuditVer(h.auditVer());
        List<String> a = h.attrNames();
        header.setAttr01Name(a.get(0));
        header.setAttr02Name(a.get(1));
        header.setAttr03Name(a.get(2));
        header.setAttr04Name(a.get(3));
        header.setAttr05Name(a.get(4));
        header.setAttr06Name(a.get(5));
        header.setAttr07Name(a.get(6));
        header.setAttr08Name(a.get(7));
        header.setAttr09Name(a.get(8));
        header.setAttr10Name(a.get(9));
        header.setCurrentVerLabel(s.currentVerLabel());
        header.setUnappliedLabel(s.unappliedLabel());

        List<CodeVersionRow> rows = new ArrayList<>(versions.size());
        List<String> restoreSources = new ArrayList<>();
        for (VerRow v : versions) {
            CodeVersionRow row = new CodeVersionRow();
            row.setVer(v.ver().toPlainString());
            row.setVerLabel(MasterCodeVersionNumbers.label(v.ver()));
            row.setVerKind(v.verKind());
            row.setStatus(v.status());
            row.setOwnerId(v.ownerId());
            row.setApplyFrom(text(v.applyFrom()));
            row.setApplyTo(text(v.applyTo()));
            row.setReleasedAt(text(v.releasedAt()));
            row.setRestoredFrom(v.restoredFrom() == null ? null : v.restoredFrom().toPlainString());
            row.setRestoredLabel(v.restoredFrom() == null ? null : MasterCodeVersionNumbers.label(v.restoredFrom()) + " 복원");
            row.setRowVersion(v.rowVersion());
            row.setUnapplied(s.unapplied().contains(v));
            row.setDescription(v.description());
            rows.add(row);
            if (VersionStatus.RELEASED.name().equals(v.status())) {
                restoreSources.add(v.ver().toPlainString()); // D13 — RELEASED 만, ver 내림차순
            }
            // D8-1 — 확정 취소 가능 여부(미래 적용 RELEASED + 소유자 + 담당자 + 미적용 1개). 화면 버튼 판정이 이 값을 쓴다.
            boolean cancelConfirmable = VersionStatus.RELEASED.name().equals(v.status())
                    && v.applyFrom() != null && v.applyFrom().isAfter(now())
                    && ownedBy(v, currentUser.userId())
                    && s.unapplied().size() == 1;
            row.setCancelConfirmable(cancelConfirmable);
        }

        BigDecimal max = s.maxVer();
        boolean open = s.unapplied().isEmpty() && !deprecated && sourceMdm;
        CodeEditFlags flags = new CodeEditFlags();
        flags.setUnappliedCount(s.unapplied().size());
        VersionRules.NewVersionFlags nv = VersionRules.newVersionFlags(max, open);
        flags.setCanNewMajor(nv.canNewMajor());
        flags.setCanNewMinor(nv.canNewMinor());
        flags.setNextMajor(nv.nextMajor());
        flags.setNextMinor(nv.nextMinor());
        flags.setMinorLimit(max != null && !MasterCodeVersionNumbers.canMinor(max));
        flags.setCanDeprecate(!deprecated && s.unapplied().isEmpty() && sourceMdm);
        flags.setEditable(sourceMdm && steward);
        boolean never = neverReleased(versions);
        flags.setNeverReleased(never);
        flags.setCanDeleteCode(never && sourceMdm && steward && versions.stream().noneMatch(this::ownedByOther));

        CodeEditView view = new CodeEditView();
        view.setHeader(header);
        view.setVersions(rows);
        view.setFlags(flags);
        view.setRestoreSources(restoreSources);
        view.setMe(currentUser.userId());
        view.setSteward(steward);
        return view;
    }

    static void requireAuditVer(MdmCode code, Long expected) {
        if (expected == null || !Objects.equals(expected, code.getVersion())) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT); // I19
        }
    }

    LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String label(String value, int slot) {
        String v = trimToNull(value);
        if (v != null && v.length() > LABEL_MAX) {
            throw invalid("라벨 attr" + (slot < 10 ? "0" : "") + slot + " 은 " + LABEL_MAX + "자 이내여야 합니다");
        }
        return v;
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : TEXT.format(value);
    }
}
