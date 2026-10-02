package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * {@code RULE_SET} DRAFT 삭제 훅(D-144 2단계). 세트 버전 행에는 자식 표가 없다(테스트 케이스는 세트 단위). main 에 정확히 하나여야
 * 공통 {@code VersionStateService.deleteDraft} 가 세트 DRAFT 를 지울 수 있다(fail-closed, VersionSpiRegistry).
 */
@Component
public class RuleSetDraftDeletionHook implements VersionDraftDeletionSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        // 지울 자식 행이 없다.
    }
}
