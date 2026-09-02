package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link QueryController} 단위 테스트.
 *
 * <p>핵심 회귀 케이스: query string + body 파라미터 병합, 결과를 {@link ApiResponse} 로 감싸 반환.
 */
class QueryControllerTest {

    @Test
    @DisplayName("정상 조회 — SqlSession 결과를 ApiResponse 에 담아 반환")
    void query_returnsRowsAsApiResponse() {
        SqlSession sqlSession = mock(SqlSession.class);
        List<Map<String, Object>> rows = List.of(
                Map.of("ID", "P01", "NAME", "Plant1"),
                Map.of("ID", "P02", "NAME", "Plant2")
        );
        when(sqlSession.<Map<String, Object>>selectList(eq("test.findAll"), any())).thenReturn(rows);

        QueryController controller = new QueryController(sqlSession);
        ApiResponse<List<Map<String, Object>>> response =
                controller.query("test.findAll", Map.of("page", "1"), null);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
        assertThat(response.getMessage()).contains("2 rows");
    }

    @Test
    @DisplayName("body 파라미터가 query string 보다 우선한다 (병합 정책)")
    @SuppressWarnings("unchecked")
    void query_bodyOverridesQueryString() {
        SqlSession sqlSession = mock(SqlSession.class);
        when(sqlSession.<Map<String, Object>>selectList(any(), any())).thenReturn(List.of());

        QueryController controller = new QueryController(sqlSession);
        Map<String, Object> body = Map.of("plantId", "FROM_BODY");
        controller.query("test.q", Map.of("plantId", "FROM_QUERY", "menuId", "M01"), body);

        org.mockito.ArgumentCaptor<Map<String, Object>> paramCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(sqlSession).selectList(eq("test.q"), paramCaptor.capture());
        Map<String, Object> captured = paramCaptor.getValue();

        assertThat(captured).containsEntry("plantId", "FROM_BODY"); // body 우선
        assertThat(captured).containsEntry("menuId", "M01"); // query string 만 있는 키도 보존
    }

    @Test
    @DisplayName("body 가 null 이어도 query string 만으로 정상 호출")
    void query_nullBody_passesQueryStringOnly() {
        SqlSession sqlSession = mock(SqlSession.class);
        when(sqlSession.<Map<String, Object>>selectList(any(), any())).thenReturn(List.of());

        QueryController controller = new QueryController(sqlSession);
        ApiResponse<List<Map<String, Object>>> response =
                controller.query("test.q", Map.of("k", "v"), null);

        assertThat(response.isSuccess()).isTrue();
    }
}
