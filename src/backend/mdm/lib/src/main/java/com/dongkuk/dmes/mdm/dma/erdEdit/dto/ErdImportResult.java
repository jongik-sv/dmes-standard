package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import java.util.List;
import java.util.Map;

/** import 응답(README 인터페이스) = ErdApplyResult 필드 + summary. 거절이면 summary 는 null 이다. */
public record ErdImportResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings,
                              ErdRejection rejection, Summary summary) {

    /** relations 는 상태별 수(DB, INFERRED 두 키가 늘 있다). diagramId 는 새로 만든 다이어그램 "전체". */
    public record Summary(int tables, int columns, int keys, Map<String, Integer> relations, String diagramId) {}
}
