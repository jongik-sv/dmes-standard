package com.dongkuk.dmes.mdm.dmc.codeEdit.service;

import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;
import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSegments;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.Summary;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.DraftWriter;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.NewVersionCommand;
import com.dongkuk.dmes.mdm.contract.version.ParentPromotion;
import com.dongkuk.dmes.mdm.contract.version.SourcePicker;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 마루 코드 새 버전 — 빈 새 버전({@code reg})과 복원({@code restore})의 본문(BE 리팩토링 2회차 C3, 불변 규칙 I1~I5·I11·I15·I18).
 *
 * <p>{@link CodeEditService#createVersion}·{@link CodeEditService#restoreVersion} 이 화면 머리(담당자·코드·원천 → 폐기 → 버전
 * 종류)를 마친 뒤 부른다. 본문은 공통 새 버전 훅 {@link VersionStateService#newVersion} 이 한 트랜잭션(호출자 트랜잭션에 합류)에서
 * 한다. 순서는 미적용 가드(MDM006) → 원천 고르기 → 번호({@link VersionRules#nextNumber}) → DRAFT 쓰기 → 부모 승격이다. 여기서는 손잡이
 * 세 개만 넘긴다.
 * <ul>
 *   <li>원천({@link SourcePicker}): 새 버전·복원 모두 {@code Optional.empty()} 다. 훅이 원천을 고르지 않는다.</li>
 *   <li>쓰기({@link DraftWriter}): 버전 행(1.000 이면 BASE 도)을 쓴다. 복원이면 쓰기 전에 원본을 검사하고, 쓴 뒤 원본 내용으로 채운다.</li>
 *   <li>승격({@link ParentPromotion}): 관리 중인 {@link MdmCode} 엔티티가 저장 CREATED 이면 INUSE 로 바꾸고 flush 한다. 훅은 저장
 *       상태를 보지 않으므로 여기서 본다. JPA 엔티티 경로를 쓴다(조정자 결정, TB_MDM_CODE 쓰기는 엔티티 경로 하나).</li>
 * </ul>
 *
 * <p><b>복원의 쓰기 손잡이는 {@code source} 인자를 쓰지 않는다.</b> {@link DraftWriter} 계약은 「{@code source} 가 있으면 그 버전을
 * 복사한다」이다. 코드 복원은 원천이 늘 empty 이고, 요청의 {@code sourceVer} 를 쓰기 손잡이가 직접 검사하고 복사한다. 원본 검사를
 * 원천 고르기로 옮기면 번호보다 먼저 돌아 오류 순서가 바뀐다. 지금 순서는 원본이 틀려도 번호 상한 오류가 먼저이고(D13, 설계 시험 6),
 * 원본 검사에서 막히면 아무 행도 쓰지 않는다.
 *
 * <p>담당자 가드(I12)·원천 MDM(I8)·폐기(I13) 검사는 여기서 하지 않는다. 그래서 {@link #create}·{@link #restore} 는 같은 패키지의
 * {@link CodeEditService} 만 부른다(패키지 공개).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 프로세스 트랜잭션에 참여한다({@link CodeEditService} 와 같다). 훅의
 * {@code TransactionTemplate} 이 그 트랜잭션에 합류한다.
 */
@Service
public class CodeVersionService {

    private static final Logger log = LoggerFactory.getLogger(CodeVersionService.class);

    /** 코드는 훅이 원천을 고르지 않는다. 복원 원본은 쓰기 손잡이가 직접 본다(클래스 설명). */
    private static final SourcePicker NO_SOURCE = all -> Optional.empty();

    private final EntityManager entityManager;
    private final MasterCodeLedgerQueries ledger;
    private final MasterCodeVersionSegments segments;
    private final VersionStateService versionState;
    private final MdmCurrentUser currentUser;

    public CodeVersionService(EntityManager entityManager, MasterCodeLedgerQueries ledger,
                              MasterCodeVersionSegments segments, VersionStateService versionState,
                              MdmCurrentUser currentUser) {
        this.entityManager = entityManager;
        this.ledger = ledger;
        this.segments = segments;
        this.versionState = versionState;
        this.currentUser = currentUser;
    }

    /**
     * 빈 새 버전. 번호 max 는 모든 버전(CANCELLED·DRAFT 포함)이다(I1~I4, 훅이 구한다).
     *
     * @return 만든 DRAFT
     */
    VersionRef create(MdmCode code, VersionKind kind) {
        DraftWriter writer = (newRef, k, owner, source) -> insertDraft(newRef, k, owner, null);
        VersionRef draft = versionState.newVersion(command(code, kind), NO_SOURCE, writer, promotion(code));
        log.info("[codeEdit] reg — id={} ver={} kind={}", code.getMaruCodeId(), draft.ver(), kind);
        return draft;
    }

    /**
     * 복원 새 버전 — 원본 RELEASED 내용으로 채운다(I15). 원본은 번호를 구한 뒤 쓰기 손잡이에서 본다(D13).
     *
     * @return 만든 DRAFT
     */
    VersionRef restore(MdmCode code, VersionKind kind, String sourceVer) {
        DraftWriter writer = (newRef, k, owner, source) -> writeRestored(newRef, k, owner, sourceVer);
        VersionRef draft = versionState.newVersion(command(code, kind), NO_SOURCE, writer, promotion(code));
        // 형식은 쓰기 손잡이에서 이미 확인했다. 다시 해석해도 실패하지 않는다.
        log.info("[codeEdit] restore — id={} ver={} from={}", code.getMaruCodeId(), draft.ver(), parseVer(sourceVer));
        return draft;
    }

    private NewVersionCommand command(MdmCode code, VersionKind kind) {
        return new NewVersionCommand(VersionTarget.MASTER_CODE, code.getMaruCodeId(), kind, currentUser.userId()); // I11
    }

    /**
     * 복원 DRAFT 쓰기 — 원본 검사 → 버전 행 → 원본 내용 채우기. 원본은 훅이 넘기는 {@code source} 가 아니라 요청의 {@code sourceVer}
     * 다. 검사 순서는 형식(MDM021) → 확정(RELEASED) 여부 → 새 번호보다 작은지이고, 막히면 아무 행도 쓰지 않는다.
     */
    private void writeRestored(VersionRef draft, VersionKind kind, String owner, String sourceVer) {
        BigDecimal source = parseVer(sourceVer);
        boolean released = ledger.versions(draft.objectId()).stream()
                .anyMatch(v -> v.ver().compareTo(source) == 0 && VersionStatus.RELEASED.name().equals(v.status()));
        if (!released || source.compareTo(draft.ver()) >= 0) {
            throw invalid("복원 원본은 확정(RELEASED)된 버전이어야 합니다"); // D13
        }
        insertDraft(draft, kind, owner, source);
        segments.fillFrom(draft, source);
    }

    /** 새 DRAFT 행 — 소유자는 요청 사용자(I11, 훅의 {@code owner}), rv 0. 1.000 이면 같은 트랜잭션에서 BASE 를 만든다(I4). */
    private void insertDraft(VersionRef draft, VersionKind kind, String owner, BigDecimal restoredFrom) {
        MdmCodeVer row = new MdmCodeVer(draft.objectId(), draft.ver(), kind.name());
        row.setOwnerId(owner);
        row.setRestoredFrom(restoredFrom);
        entityManager.persist(row);
        entityManager.flush();
        if (draft.ver().compareTo(MasterCodeConventions.FIRST_VER) == 0) {
            segments.createBaseCategory(draft);
        }
    }

    /**
     * 부모 승격(I18, ADR-0002 D6) — 훅은 적용된 RELEASED 가 있을 때만 부른다. 저장 CREATED 이면 관리 중인 엔티티를 INUSE 로 바꾸고 바로
     * flush 한다. 그래서 UPDATE 가 훅의 트랜잭션 안에서 나가고, 실패하면 버전 행과 함께 되돌아간다. 이미 INUSE·DEPRECATED 면 손대지 않는다.
     */
    private ParentPromotion promotion(MdmCode code) {
        return (target, objectId) -> {
            if (MaruObjectStatus.CREATED.name().equals(code.getStatus())) {
                code.setStatus(MaruObjectStatus.INUSE.name());
                entityManager.flush();
            }
        };
    }

    /** "1.001" → 1.001(scale 3). 음수·소수 넷째 자리 이상·지수 표기 등 형식 오류는 MDM021(공통 {@link VersionRules#parseVer}). */
    static BigDecimal parseVer(String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw invalid("버전 번호가 없습니다");
        }
        return VersionRules.parseVer(v);
    }

    /**
     * 저장 CREATED 이고 적용된 RELEASED 가 있으면 같은 트랜잭션에서 INUSE 로 저장한다(I18, ADR-0002 D6). 헤더 저장
     * ({@link CodeEditService#saveHeader})이 쓴다. 새 버전·복원은 훅의 승격 손잡이({@code promotion})가 같은 판정을 한다.
     */
    static void markInUseIfApplied(MdmCode code, Summary summary) {
        if (MaruObjectStatus.CREATED.name().equals(code.getStatus())
                && MaruObjectStatus.INUSE.name().equals(summary.effectiveStatus())) {
            code.setStatus(MaruObjectStatus.INUSE.name());
        }
    }
}
