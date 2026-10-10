package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDiffApplier;
import java.util.List;

/** import kind=APPLY_DIFF 응답(README S2-14) = ErdApplyResult 칸(dryRun 없음) + summary. 거절이면 summary 는 null 이다. */
public record ErdDiffApplyResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes, List<ErdWarning> warnings,
                                 ErdRejection rejection, ErdDiffApplier.Summary summary) {

    public static ErdDiffApplyResult of(ErdApplyResult r, ErdDiffApplier.Summary summary) {
        return new ErdDiffApplyResult(r.applied(), r.rev(), r.rowVersion(), r.changes(), r.warnings(), r.rejection(),
                r.applied() ? summary : null);
    }
}
