package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 다이어그램 행 모양 하나. view({@link ErdDiagramQuery})와 저장소({@link ErdDiagramStore})의 델타·되돌리기 행이 같은 키·순서를 쓴다.
 * diagram: {id, areaName, diagramName, sortSeq}, diagramNode: {diagram, table, x, y, foldMode} + 크기가 있으면 w·h
 * (NULL 이면 키를 넣지 않는다 — V8 전 되돌리기 기록의 값과 같게 비교되도록, README §7.4), diagramRoute: {diagram, relation, points} + 변이
 * 지정돼 있으면 childSide·parentSide(NULL 이면 키 없음, README §7.5). foldMode 는 NULL 이어도 키가 있다.
 *
 * <p>열 값 꺼내기는 부르는 쪽 몫이다(view 는 ResultSet, 저장소는 Object[]). 저장소는 이 맵을 MAPPER.valueToTree 로 JsonNode 로 바꾸고,
 * view 는 맵 그대로 싣는다(ErdModelView 는 plain() 없이 나간다).
 */
final class ErdDiagramRows {

    private ErdDiagramRows() {
    }

    static Map<String, Object> diagram(String id, String areaName, String diagramName, int sortSeq) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("id", id);
        d.put("areaName", areaName);
        d.put("diagramName", diagramName);
        d.put("sortSeq", sortSeq);
        return d;
    }

    static Map<String, Object> node(String diagram, String table, int x, int y, String foldMode, Integer w, Integer h) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("diagram", diagram);
        n.put("table", table);
        n.put("x", x);
        n.put("y", y);
        n.put("foldMode", foldMode);
        if (w != null) n.put("w", w);
        if (h != null) n.put("h", h);
        return n;
    }

    /** points 는 [{x, y}, …] 다. view 는 맵 목록, 저장소는 POINTS_JSON 을 읽은 JsonNode 를 넣는다. */
    static Map<String, Object> route(String diagram, String relation, Object points, String childSide, String parentSide) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("diagram", diagram);
        o.put("relation", relation);
        o.put("points", points);
        if (childSide != null) o.put("childSide", childSide);
        if (parentSide != null) o.put("parentSide", parentSide);
        return o;
    }
}
