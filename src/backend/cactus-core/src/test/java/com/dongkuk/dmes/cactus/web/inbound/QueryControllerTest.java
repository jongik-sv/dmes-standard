package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import org.apache.ibatis.builder.StaticSqlSource;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link QueryController} 단위 테스트.
 *
 * <p>핵심 회귀 케이스: query string + body 파라미터 병합, 결과를 {@link ApiResponse} 로 감싸 반환,
 * statement 검사({@link QueryStatementGuard})를 거친 뒤에만 실행. 검사 규칙 자체는 {@link QueryStatementGuardTest}.
 */
class QueryControllerTest {

    private final Configuration configuration = new Configuration();
    private final SqlSession sqlSession = mock(SqlSession.class);
    private final QueryController controller = new QueryController(new QueryStatementGuard(sqlSession, 10_000));

    QueryControllerTest() {
        when(sqlSession.getConfiguration()).thenReturn(configuration);
        add("plant.search", SqlCommandType.SELECT, "file [/app/persistence/query/plant.xml]");
        add("plantLov.list", SqlCommandType.SELECT, "file [/app/persistence/lov/plantLov.xml]");
        add("dmom.insertTcError", SqlCommandType.INSERT, "file [/app/persistence/query/dmom.xml]");
    }

    private void add(String id, SqlCommandType type, String resource) {
        configuration.addMappedStatement(new MappedStatement.Builder(
                configuration, id, new StaticSqlSource(configuration, "SELECT 1"), type).resource(resource).build());
    }

    @Test
    @DisplayName("정상 조회 — SqlSession 결과를 ApiResponse 에 담아 반환")
    void query_returnsRowsAsApiResponse() {
        List<Object> rows = List.of(
                Map.of("ID", "P01", "NAME", "Plant1"),
                Map.of("ID", "P02", "NAME", "Plant2")
        );
        when(sqlSession.selectList(eq("plant.search"), any(), any(RowBounds.class))).thenReturn(rows);

        ApiResponse<List<Map<String, Object>>> response =
                controller.query("plant.search", Map.of("page", "1"), null);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
        assertThat(response.getMessage()).contains("2 rows");
    }

    @Test
    @DisplayName("body 파라미터가 query string 보다 우선한다 (병합 정책)")
    @SuppressWarnings("unchecked")
    void query_bodyOverridesQueryString() {
        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(List.of());

        Map<String, Object> body = Map.of("plantId", "FROM_BODY");
        controller.query("plant.search", Map.of("plantId", "FROM_QUERY", "menuId", "M01"), body);

        org.mockito.ArgumentCaptor<Map<String, Object>> paramCaptor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(sqlSession).selectList(eq("plant.search"), paramCaptor.capture(), any(RowBounds.class));
        Map<String, Object> captured = paramCaptor.getValue();

        assertThat(captured).containsEntry("plantId", "FROM_BODY"); // body 우선
        assertThat(captured).containsEntry("menuId", "M01"); // query string 만 있는 키도 보존
    }

    @Test
    @DisplayName("body 가 null 이어도 query string 만으로 정상 호출")
    void query_nullBody_passesQueryStringOnly() {
        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(List.of());

        ApiResponse<List<Map<String, Object>>> response =
                controller.query("plant.search", Map.of("k", "v"), null);

        assertThat(response.isSuccess()).isTrue();
    }

    @Test
    @DisplayName("insert statement id 를 주면 실행하지 않고 404 (2026-10-07 재현: 예전에는 INSERT 가 실행·커밋됐다)")
    void query_insertStatement_isRejected() {
        assertThatThrownBy(() -> controller.query("dmom.insertTcError", Map.of(), null))
                .isInstanceOf(BusinessException.class)
                .satisfies(t -> assertThat(((BusinessException) t).getErrorCode().getHttpStatus()).isEqualTo(404));
        verify(sqlSession, never()).selectList(anyString(), any(), any(RowBounds.class));
        verify(sqlSession, never()).selectList(anyString(), any());
    }

    @Test
    @DisplayName("/lov/query/{queryId} — persistence/lov 매퍼 결과를 ApiResponse 에 담아 반환")
    void lovQuery_returnsLovList() {
        List<Object> rows = List.of(new Lov("C01", "Customer1"), new Lov("C02", "Customer2"));
        when(sqlSession.selectList(eq("plantLov.list"), any(), any(RowBounds.class))).thenReturn(rows);

        ApiResponse<List<Lov>> response = controller.lovQuery("plantLov.list", Map.of(), null);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
    }

    @Test
    @DisplayName("/lov/query 는 persistence/query 매퍼를 열지 않는다")
    void lovQuery_queryFolder_isRejected() {
        assertThatThrownBy(() -> controller.lovQuery("plant.search", Map.of(), null))
                .isInstanceOf(BusinessException.class);
    }
}
