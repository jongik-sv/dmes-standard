package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import java.util.List;

/** 명령 묶음 적용 결과. 거절이면 applied=false 이고 rev 는 지금 모델 rev 다(아무것도 쓰지 않았다). */
public record ErdApplyResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection) {

    public static ErdApplyResult rejected(long rev, ErdRejection r) {
        return new ErdApplyResult(false, rev, List.of(), List.of(), r);
    }
}
