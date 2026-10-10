package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiffItem;
import java.util.List;

/** compare kind=DB_DIFF 응답(README S4). rev 는 비교한 시점의 모델 rev, schema 는 읽은 DB 스키마다. */
public record ErdDbDiffView(String modelId, long rev, String schema, List<ErdDbDiffItem> items) {
}
