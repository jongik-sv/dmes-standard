package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import java.util.List;
import java.util.Map;

/**
 * view 응답. model 은 MODEL_JSON 문자열 그대로다(큰 중첩 맵을 OASIS 가 다시 직렬화하지 않도록).
 * routes = 관계선 꺾임점 {diagram, relation, points:[{x, y}, …]}(ERD 2차 §7.1). 그 버전에 없는 관계의 행도 싣는다 — 화면이 그리지 않는다.
 */
public record ErdModelView(String modelId, long rev, String ver, String status, String ownerId, List<String> editors,
                           long rowVersion, String model, List<Map<String, Object>> diagrams,
                           List<Map<String, Object>> nodes, List<Map<String, Object>> routes, List<ErdPresence> presence) {
}
