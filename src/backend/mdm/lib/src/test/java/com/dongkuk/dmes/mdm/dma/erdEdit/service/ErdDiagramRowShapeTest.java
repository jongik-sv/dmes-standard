package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 다이어그램 행 JSON 모양(델타 값·되돌리기 비교 기준). 키 순서, 숫자는 IntNode, foldMode NULL 은 키가 있는 NullNode, 크기·끝점 변 NULL 은
 * 키 없음, points 는 POINTS_JSON 을 읽은 트리 그대로다. SQL 은 시험 대역이다(Oracle 시험 몫).
 */
class ErdDiagramRowShapeTest {

    private static final String MODEL = "mcm";

    private EntityManager em;
    private Query query;
    private ErdDiagramStore store;

    @BeforeEach
    void setUp() {
        em = mock(EntityManager.class);
        query = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyInt(), any())).thenReturn(query);
        store = new ErdDiagramStore(em);
    }

    @Test
    void diagramRowHasIdNamesAndIntSortSeq() throws Exception {
        rows(new Object[] {"업무", "주문", new BigDecimal("3")});

        JsonNode row = store.row(MODEL, "diagram", "d-1");

        assertShape(row, "{\"id\":\"d-1\",\"areaName\":\"업무\",\"diagramName\":\"주문\",\"sortSeq\":3}");
        assertThat(row.get("sortSeq").isInt()).isTrue();
    }

    @Test
    void nodeRowKeepsNullFoldAndOmitsMissingSize() throws Exception {
        rows(new Object[] {new BigDecimal("10"), new BigDecimal("-20"), null, new BigDecimal("150"), null});

        JsonNode row = store.row(MODEL, "diagramNode", "d-1:t-1");

        assertShape(row, "{\"diagram\":\"d-1\",\"table\":\"t-1\",\"x\":10,\"y\":-20,\"foldMode\":null,\"w\":150}");
        assertThat(row.has("foldMode")).isTrue();
        assertThat(row.get("foldMode").isNull()).isTrue();
        assertThat(row.has("h")).isFalse();
    }

    @Test
    void nodeRowWithFoldAndBothSizesUsesIntNodes() throws Exception {
        rows(new Object[] {1, 2L, "KEYS", new BigDecimal("300"), 40L});

        JsonNode row = store.row(MODEL, "diagramNode", "d-1:t-1");

        assertShape(row, "{\"diagram\":\"d-1\",\"table\":\"t-1\",\"x\":1,\"y\":2,\"foldMode\":\"KEYS\",\"w\":300,\"h\":40}");
        for (String k : List.of("x", "y", "w", "h")) assertThat(row.get(k).isInt()).as(k).isTrue();
    }

    @Test
    void routeRowCarriesParsedPointsAndOnlyGivenSides() throws Exception {
        rows(new Object[] {"[{\"x\":1,\"y\":-40},{\"x\":2.5,\"y\":3},{\"x\":3000000000,\"y\":0}]", 'L', null});

        JsonNode row = store.row(MODEL, "diagramRoute", "d-1:r-1");

        assertShape(row, "{\"diagram\":\"d-1\",\"relation\":\"r-1\","
                + "\"points\":[{\"x\":1,\"y\":-40},{\"x\":2.5,\"y\":3},{\"x\":3000000000,\"y\":0}],\"childSide\":\"L\"}");
        assertThat(row.get("childSide").isTextual()).isTrue();
        assertThat(row.has("parentSide")).isFalse();
        JsonNode points = row.get("points");
        assertThat(points.get(0).get("x").isInt()).isTrue();
        assertThat(points.get(1).get("x").isDouble()).isTrue();
        assertThat(points.get(2).get("x").isLong()).isTrue();
    }

    @Test
    void routeRowWithParentSideOnlyAndNoPoints() throws Exception {
        rows(new Object[] {"[]", null, "R"});

        JsonNode row = store.row(MODEL, "diagramRoute", "d-1:r-1");

        assertShape(row, "{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":[],\"parentSide\":\"R\"}");
        assertThat(row.has("childSide")).isFalse();
    }

    @Test
    void missingRowIsNull() {
        when(query.getResultList()).thenReturn(List.of());

        assertThat(store.row(MODEL, "diagram", "d-1")).isNull();
        assertThat(store.row(MODEL, "diagramNode", "d-1:t-1")).isNull();
        assertThat(store.row(MODEL, "diagramRoute", "d-1:r-1")).isNull();
    }

    @Test
    void elementIdWithoutColonIsNullWithoutQuery() {
        assertThat(store.row(MODEL, "diagramNode", "d-1")).isNull();
        assertThat(store.row(MODEL, "diagramRoute", "d-1")).isNull();
        verify(em, never()).createNativeQuery(anyString());
    }

    private void rows(Object[] row) {
        List<Object[]> rows = List.<Object[]>of(row);
        when(query.getResultList()).thenReturn(rows);
    }

    /** 노드 형식까지 같고(readTree 와 equals) 직렬화한 키 순서·NULL 키도 같다. */
    private static void assertShape(JsonNode row, String json) throws Exception {
        assertThat(row).isEqualTo(ErdModelCodec.MAPPER.readTree(json));
        assertThat(ErdModelCodec.MAPPER.writeValueAsString(row)).isEqualTo(json);
    }
}
