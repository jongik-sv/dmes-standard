package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;

/** 명령 묶음의 결과. 묶음은 전부 적용되거나(Applied) 전부 버려진다(Rejected). */
public sealed interface ApplyOutcome {
    /**
     * @param touchedTables 바뀐 요소가 걸친 표 id(정렬, 중복 없음, deferred 25). 표 변경은 그 표, 컬럼·키는 table(지운 요소는 지우기 전 값),
     *                      관계는 child·parent 다. 서비스가 CLAIMED 경고와 MCP·CLI 접속자 selectedTables 를 이 목록으로 만든다.
     */
    record Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings,
                   List<String> touchedTables) implements ApplyOutcome {}

    record Rejected(ErdRejection rejection) implements ApplyOutcome {}
}
