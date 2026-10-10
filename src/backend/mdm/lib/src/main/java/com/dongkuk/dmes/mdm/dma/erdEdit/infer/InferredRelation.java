package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.List;

/** 추정기 결과 하나. 컬럼 목록은 같은 위치끼리 짝이다. state 는 DB|INFERRED. 가져오기(Task 4)가 ErdRelation 으로 바꾼다. */
public record InferredRelation(String childTable, List<String> childColumns, String parentTable, List<String> parentColumns,
                               String state, List<ErdEvidence> evidence, Integer candidateRank) {

    public InferredRelation {
        childColumns = List.copyOf(childColumns);
        parentColumns = List.copyOf(parentColumns);
        evidence = List.copyOf(evidence);
    }
}
