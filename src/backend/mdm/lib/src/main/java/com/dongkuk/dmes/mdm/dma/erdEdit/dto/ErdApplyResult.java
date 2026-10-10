package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import java.util.List;

/**
 * 명령 묶음 적용 결과(README 정본). 거절이면 applied=false 이고 rev 는 지금 모델 rev 다(아무것도 쓰지 않았다).
 * rowVersion 은 모델 명령이 DRAFT 행의 ROW_VERSION 을 올렸을 때 올린 뒤 값이다. 다이어그램 명령만 있는 묶음·거절·dryRun 은 null.
 * dryRun 이면 applied=false 이고 통과 여부는 rejection == null 이다(S2-15).
 */
public record ErdApplyResult(boolean applied, long rev, Long rowVersion, boolean dryRun, List<ErdChange> changes,
                             List<ErdWarning> warnings, ErdRejection rejection) {

    public static ErdApplyResult rejected(long rev, ErdRejection r) {
        return new ErdApplyResult(false, rev, null, false, List.of(), List.of(), r);
    }

    /** 시험 실행 결과로 바꾼다 — 아무것도 쓰지 않았으므로 applied=false·rowVersion=null 이다. */
    public ErdApplyResult asDryRun() {
        return new ErdApplyResult(false, rev, null, true, changes, warnings, rejection);
    }
}
