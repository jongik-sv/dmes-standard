package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import java.util.Map;

/** 다시 가져오기 차이 한 건(README ErdDbDiffView.items). 물리명으로 맞춘다 — DB 에는 모델 요소 UUID 가 없다. */
public record ErdDbDiffItem(String id, String kind, String table, String column,
                            Map<String, Object> before, Map<String, Object> after) {
}
