package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * ERD_MODEL DRAFT 삭제 훅 — 그 버전의 공동 편집자 행을 먼저 지운다(FK). 다이어그램·명령 기록은 버전 밖이라 남긴다.
 * 구독자가 지워진 DRAFT 를 계속 보지 않게 rev 를 올리고 표시 행을 남긴다(최종 검토 B2, {@link ErdReloadMarker}).
 */
@Component
public class ErdDraftDeletion implements VersionDraftDeletionSpi {

    private final EntityManager em;
    private final ErdReloadMarker marker;
    private final MdmNativeAuditSupport audit;
    private final ErdModelStore store;

    public ErdDraftDeletion(EntityManager em, ErdReloadMarker marker, MdmNativeAuditSupport audit, ErdModelStore store) {
        this.em = em;
        this.marker = marker;
        this.audit = audit;
        this.store = store;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    /**
     * 공통 {@code VersionStateService.deleteDraft} 의 트랜잭션 안에서, 버전 행을 지우기 전에 불린다. 모델 행 잠금을 가장 먼저 잡아
     * 명령 서비스와 잠금 순서(모델 → 버전)를 맞춘다. 훅은 사용자를 받지 않으므로 표시 행의 사용자는 요청 감사 정보에서 꺼낸다(없으면 SYSTEM).
     *
     * <p>확정 버전이 하나도 없는 모델의 DRAFT(등록 때 만든 첫 버전)는 지우지 않는다(MDM009) — 지우면 모델에 버전이 없어 조회·copy 가
     * 모두 MDM029 가 되고, 모듈 하나에 모델 하나(UX_TB_MDM_ERD_MODEL_MODULE)라 같은 모듈로 다시 등록할 수도 없다. 던지면 삭제 전체가
     * 되돌아간다.
     */
    @Override
    public void beforeDraftDelete(VersionRef draft) {
        marker.lock(draft.objectId());
        if (store.latestReleased(draft.objectId()).isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED,
                    "확정 버전이 없는 모델의 첫 DRAFT 는 지울 수 없습니다. 내용을 고쳐 쓰거나 관리자에게 모델 정리를 요청하세요", List.of());
        }
        marker.mark(draft.objectId(), VersionNumbers.scaled(draft.ver()), audit.currentStamp().userId(), ErdReloadMarker.DRAFT_DELETED);
        em.createNativeQuery("DELETE FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ?")
                .setParameter(1, draft.objectId()).setParameter(2, VersionNumbers.scaled(draft.ver())).executeUpdate();
    }
}
