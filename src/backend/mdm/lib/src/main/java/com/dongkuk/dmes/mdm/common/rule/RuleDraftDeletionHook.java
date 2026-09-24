package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * {@code BUSINESS_RULE} DRAFT 삭제 훅(TSK-08-02 design I26). 버전 행을 지우면 VAR·ROW 가 FK CASCADE 로 함께 지워지므로
 * 할 일이 없다. main 에 정확히 하나여야 공통 {@code VersionStateService.deleteDraft} 가 룰 DRAFT 를 지울 수 있다.
 */
@Component
public class RuleDraftDeletionHook implements VersionDraftDeletionSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.BUSINESS_RULE;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        // VAR·ROW 는 CASCADE 로 지워진다(F33).
    }
}
