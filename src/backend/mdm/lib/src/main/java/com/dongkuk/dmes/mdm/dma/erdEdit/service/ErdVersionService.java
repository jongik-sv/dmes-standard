package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.entity.MdmErdEditor;
import com.dongkuk.dmes.mdm.entity.MdmErdEditorId;
import com.dongkuk.dmes.mdm.entity.MdmErdModel;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import com.dongkuk.dmes.mdm.repository.MdmErdEditorRepository;
import com.dongkuk.dmes.mdm.repository.MdmErdModelRepository;
import com.dongkuk.dmes.mdm.repository.MdmErdModelVerRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ERD 모델 만들기·새 버전·공동 편집자(스펙 2.1-6, D15). 상태·소유자는 공통 버전 서비스가 맡는다. {@code @Transactional} 대신
 * {@link TransactionTemplate} 을 쓴다({@code RuleSetVersionService} 와 같은 방식). 공동 편집자 추가·삭제는 소유자만 한다 — 공동
 * 편집자는 내용만 쓰고 편집자 명단은 못 바꾼다(MDM003).
 */
@Service
public class ErdVersionService {

    private final VersionWriteGuard writeGuard;
    private final VersionRowStore versionStore;
    private final ErdModelStore store;
    private final MdmErdModelRepository models;
    private final MdmErdModelVerRepository vers;
    private final MdmErdEditorRepository editors;
    private final MdmNativeAuditSupport audit;
    private final Clock clock;
    private final ErdReloadMarker marker;
    private final TransactionTemplate tx;
    private final ErdEventHub hub;

    public ErdVersionService(VersionWriteGuard writeGuard, VersionRowStore versionStore, ErdModelStore store,
                             MdmErdModelRepository models, MdmErdModelVerRepository vers, MdmErdEditorRepository editors,
                             MdmNativeAuditSupport audit, Clock clock, ErdReloadMarker marker,
                             PlatformTransactionManager transactionManager, ErdEventHub hub) {
        this.writeGuard = writeGuard;
        this.versionStore = versionStore;
        this.store = store;
        this.models = models;
        this.vers = vers;
        this.editors = editors;
        this.audit = audit;
        this.clock = clock;
        this.marker = marker;
        this.tx = new TransactionTemplate(transactionManager);
        this.hub = hub;
    }

    /** 빈 모델과 1.000 DRAFT 를 만든다. 소유자 = {@code me}. 같은 ID 나 같은 모듈의 모델이 있으면 입력 오류다. */
    public String createModel(String modelId, String module, String schema, String name, String me) {
        try {
            createModelTx(modelId, module, schema, name, me);
        } catch (DataIntegrityViolationException e) {
            // 같은 ID·모듈을 동시에 등록해 사전 검사를 둘 다 지난 경우 — 뒤 요청은 PK·UX 제약에 걸린다. S001 대신 입력 오류로.
            // 그 두 제약(PK_/UX_TB_MDM_ERD_MODEL…)만 바꾸고, 다른 위반(NOT NULL·CHECK 등)은 그대로 던진다.
            if (!isModelKeyViolation(e)) throw e;
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "같은 모델 ID 또는 모듈 " + module + " 의 모델이 방금 등록되었습니다", List.of());
        }
        return modelId;
    }

    private static boolean isModelKeyViolation(DataIntegrityViolationException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            if (m != null && (m.contains("PK_TB_MDM_ERD_MODEL") || m.contains("UX_TB_MDM_ERD_MODEL"))) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    private void createModelTx(String modelId, String module, String schema, String name, String me) {
        tx.executeWithoutResult(s -> {
            if (models.existsById(modelId)) {
                throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "이미 있는 모델 ID 입니다: " + modelId, List.of());
            }
            // 모듈 하나 = 모델 하나(스펙 D2, UX_TB_MDM_ERD_MODEL_MODULE). 제약 위반(S001)이 되기 전에 입력 오류로 돌려준다.
            store.modelOfModule(module).ifPresent(other -> {
                throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "모듈 " + module + " 에는 이미 모델이 있습니다: " + other, List.of());
            });
            models.saveAndFlush(new MdmErdModel(modelId, module, schema, name));
            vers.saveAndFlush(new MdmErdModelVer(modelId, new BigDecimal("1.000"), VersionKind.MAJOR.name(), me,
                    ErdModelCodec.write(ErdModel.empty(module, schema))));
            // 이 서버가 같은 id 의 모델을 지운 적이 있으면(ERD 2차 §7.2) rev 를 0 이 아니라 지운 모델 뒤에서 잇고 표시 행(DRAFT_CREATED)을 남긴다.
            // 지울 때 reload 를 못 받은 화면·CLI 가 옛 sinceRev·baseRev 로 오면 표시 행을 건너므로 reload·거절을 받는다(옛 모델에 이어 붙지 않는다).
            hub.deletedRev(modelId).ifPresent(last -> {
                store.setRev(modelId, last);
                marker.mark(modelId, new BigDecimal("1.000"), me, ErdReloadMarker.DRAFT_CREATED);
            });
        });
    }

    /**
     * 새 DRAFT. 직전 RELEASED 의 JSON 을 그대로 복사한다(UUID 유지). 번호 = 최대 버전에서 {@code kind}(MAJOR|MINOR, 빈 값은 MAJOR)로
     * 올린 값. 순서는 {@code RuleSetVersionService.newVersion} 을 따른다 — 미적용 버전 검사(MDM006) → 번호 → 한 트랜잭션에서 INSERT.
     *
     * <p>모델 행을 먼저 잠근 뒤 검사·INSERT 하고, 같은 트랜잭션에서 rev 를 올려 표시 행을 남긴다(최종 검토 B2) — 구독자는 커밋 뒤
     * reload 를 받는다. 같은 모델의 동시 copy 는 잠금에서 줄을 서므로 뒤 요청은 앞이 만든 DRAFT 를 보고 MDM006 이 된다.
     */
    public BigDecimal newVersion(String modelId, String kind, String me) {
        VersionKind verKind = VersionRules.parseKind(kind);
        return tx.execute(s -> {
            if (!models.existsById(modelId)) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
            marker.lock(modelId);
            writeGuard.checkCanCreateVersion(VersionTarget.ERD_MODEL, modelId);                 // MDM006
            MdmErdModelVer source = store.latestReleased(modelId)
                    .orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
            BigDecimal next = VersionRules.nextNumber(source.getVer(), verKind);
            boolean promote = source.getApplyFrom() != null && !source.getApplyFrom().isAfter(LocalDateTime.now(clock));
            MdmErdModelVer created = new MdmErdModelVer(modelId, next, verKind.name(), me, source.getModelJson());
            created.setBaseVer(source.getVer());
            vers.saveAndFlush(created);
            if (promote) {
                versionStore.markParentInUse(VersionTarget.ERD_MODEL, modelId, audit.currentStamp()); // CREATED → INUSE
            }
            marker.mark(modelId, next, me, ErdReloadMarker.DRAFT_CREATED);
            return next;
        });
    }

    /**
     * DRAFT 에 공동 편집자를 더한다. 소유자만 한다. 소유자 본인과 이미 있는 편집자는 그대로 둔다.
     * 모델 행을 먼저 잠근다(저장·새 버전·DRAFT 삭제·모델 삭제와 같은 첫 잠금) — 모델 삭제와 겹치면 FK 오류 대신 ERD_MODEL_NOT_FOUND 다.
     */
    public void addEditor(String modelId, String userId, String me) {
        if (userId == null || userId.isBlank()) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "편집자 ID 는 필수입니다", List.of());
        }
        tx.executeWithoutResult(s -> {
            marker.lock(modelId);                                                 // 없으면 MDM029
            MdmErdModelVer d = requireOwnedDraft(modelId, me);
            if (userId.equals(d.getOwnerId())) return;
            if (!editors.existsById(new MdmErdEditorId(modelId, d.getVer(), userId))) {
                editors.saveAndFlush(new MdmErdEditor(modelId, d.getVer(), userId));
            }
        });
    }

    /** DRAFT 에서 공동 편집자를 뺀다. 소유자만 한다. */
    public void removeEditor(String modelId, String userId, String me) {
        MdmErdModelVer d = requireOwnedDraft(modelId, me);
        tx.executeWithoutResult(s -> {
            MdmErdEditorId id = new MdmErdEditorId(modelId, d.getVer(), userId);
            if (editors.existsById(id)) editors.deleteById(id);
        });
    }

    private MdmErdModelVer requireOwnedDraft(String modelId, String me) {
        if (!models.existsById(modelId)) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        MdmErdModelVer d = store.draft(modelId).orElseThrow(() -> MdmErrors.of(MdmErrorCode.NOT_DRAFT));
        if (me == null || !me.equals(d.getOwnerId())) throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER);
        return d;
    }
}
