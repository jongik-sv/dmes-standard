package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;

/** 명령 묶음의 결과. 묶음은 전부 적용되거나(Applied) 전부 버려진다(Rejected). */
public sealed interface ApplyOutcome {
    record Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings)
            implements ApplyOutcome {}

    record Rejected(ErdRejection rejection) implements ApplyOutcome {}
}
