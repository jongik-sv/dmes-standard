package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * view 가 싣는 모델 하나의 다이어그램·노드·관계선 꺾임점 읽기. {@link ErdEditService} 가 쓴다. 값은 평범한 Map·List 다 — ErdModelView 는
 * plain() 없이 OASIS 로 나가므로 JsonNode 를 넣지 않는다. JdbcTemplate 으로 읽으므로 OASIS 바깥 트랜잭션에 합류한다.
 */
@Component
public class ErdDiagramQuery {

    private final JdbcTemplate jdbc;

    public ErdDiagramQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 다이어그램 {id, areaName, diagramName, sortSeq}, 정렬 순서·id 순. */
    List<Map<String, Object>> diagrams(String modelId) {
        return jdbc.query("""
                SELECT DIAGRAM_ID
                     , AREA_NAME
                     , DIAGRAM_NAME
                     , SORT_SEQ
                  FROM TB_MDM_ERD_DIAGRAM
                 WHERE ERD_MODEL_ID = ?
                 ORDER BY SORT_SEQ, DIAGRAM_ID
                """, (rs, i) -> ErdDiagramRows.diagram(rs.getString("DIAGRAM_ID"), rs.getString("AREA_NAME"),
                rs.getString("DIAGRAM_NAME"), rs.getInt("SORT_SEQ")), modelId);
    }

    /** 다이어그램 노드 {diagram, table, x, y, foldMode} + 크기가 있으면 w·h. 순서는 정하지 않는다. */
    List<Map<String, Object>> nodes(String modelId) {
        return jdbc.query("""
                SELECT N.DIAGRAM_ID
                     , N.TABLE_UUID
                     , N.POS_X
                     , N.POS_Y
                     , N.FOLD_MODE
                     , N.SIZE_W
                     , N.SIZE_H
                  FROM TB_MDM_ERD_DIAGRAM_NODE N
                     , TB_MDM_ERD_DIAGRAM D
                 WHERE D.DIAGRAM_ID = N.DIAGRAM_ID
                   AND D.ERD_MODEL_ID = ?
                """, (rs, i) -> ErdDiagramRows.node(rs.getString("DIAGRAM_ID"), rs.getString("TABLE_UUID"),
                rs.getInt("POS_X"), rs.getInt("POS_Y"), rs.getString("FOLD_MODE"),
                // 표 크기(README §7.4). NULL = 자동 크기라 키를 넣지 않는다.
                intOrNull(rs, "SIZE_W"), intOrNull(rs, "SIZE_H")), modelId);
    }

    /**
     * 관계선 꺾임점(ERD 2차 §7.1) {diagram, relation, points} + 변이 지정돼 있으면 childSide·parentSide, 다이어그램·관계 id 순.
     * points 는 [{x, y}, …] 를 맵 목록으로 풀어 싣는다(OASIS 가 평범한 값으로 직렬화한다).
     */
    List<Map<String, Object>> routes(String modelId) {
        return jdbc.query("""
                SELECT R.DIAGRAM_ID
                     , R.REL_UUID
                     , R.POINTS_JSON
                     , R.CHILD_SIDE
                     , R.PARENT_SIDE
                  FROM TB_MDM_ERD_DIAGRAM_ROUTE R
                     , TB_MDM_ERD_DIAGRAM D
                 WHERE D.DIAGRAM_ID = R.DIAGRAM_ID
                   AND D.ERD_MODEL_ID = ?
                 ORDER BY R.DIAGRAM_ID, R.REL_UUID
                """, (rs, i) -> ErdDiagramRows.route(rs.getString("DIAGRAM_ID"), rs.getString("REL_UUID"),
                routePoints(rs.getString("POINTS_JSON")),
                // 끝점 변(README §7.5). NULL = 자동 변이라 키를 넣지 않는다.
                rs.getString("CHILD_SIDE"), rs.getString("PARENT_SIDE")), modelId);
    }

    /** INTEGER 열, NULL 이면 null. */
    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    private static List<Map<String, Object>> routePoints(String json) {
        try {
            return ErdModelCodec.MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("POINTS_JSON 을 읽을 수 없습니다", e);
        }
    }
}
