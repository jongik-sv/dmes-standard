package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.inbound.QueryStatementGuard.Exposure;
import org.apache.ibatis.builder.StaticSqlSource;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.mapping.StatementType;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
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
 * {@link QueryStatementGuard} — {@code /query}·{@code /lov/query} 가 실행할 statement 를 거른다(2026-10-07 보안 지적).
 *
 * <p>실제 MyBatis {@link Configuration} 에 statement 를 등록해 MyBatis 의 id 해석(짧은 id·StrictMap)까지 그대로 탄다.
 */
class QueryStatementGuardTest {

    private static final String QUERY_XML = "file [/app/src/main/resources/persistence/query/cma/masterCodeSelPop.xml]";
    private static final String LOV_XML = "class path resource [persistence/lov/cma/plantLov.xml]";
    private static final String DMOM_XML = "file [/app/src/main/resources/mapper/dmom/DmomMapper.xml]";

    private final Configuration configuration = new Configuration();
    private final SqlSession sqlSession = mock(SqlSession.class);

    QueryStatementGuardTest() {
        when(sqlSession.getConfiguration()).thenReturn(configuration);
    }

    private void add(String id, SqlCommandType type, StatementType statementType, String resource) {
        MappedStatement ms = new MappedStatement.Builder(
                configuration, id, new StaticSqlSource(configuration, "SELECT 1"), type)
                .statementType(statementType)
                .resource(resource)
                .build();
        configuration.addMappedStatement(ms);
    }

    private void addSelect(String id, String resource) {
        add(id, SqlCommandType.SELECT, StatementType.PREPARED, resource);
    }

    private static int httpStatusOf(Throwable t) {
        return ((BusinessException) t).getErrorCode().getHttpStatus();
    }

    @Test
    @DisplayName("persistence/query 의 SELECT — 상한+1 행까지만 읽어 돌려준다")
    void select_inQueryFolder_runsWithRowBounds() {
        addSelect("masterCodeSelPop.search", QUERY_XML);
        List<Object> rows = List.of(Map.of("A", 1));
        when(sqlSession.selectList(eq("masterCodeSelPop.search"), any(), any(RowBounds.class))).thenReturn(rows);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);
        List<Object> actual = guard.selectList("masterCodeSelPop.search", Map.of(), Exposure.QUERY);

        assertThat(actual).isSameAs(rows);
        ArgumentCaptor<RowBounds> bounds = ArgumentCaptor.forClass(RowBounds.class);
        verify(sqlSession).selectList(eq("masterCodeSelPop.search"), any(), bounds.capture());
        assertThat(bounds.getValue().getOffset()).isZero();
        assertThat(bounds.getValue().getLimit()).isEqualTo(101);
    }

    @ParameterizedTest(name = "{0} statement 는 404 이고 실행하지 않는다")
    @EnumSource(value = SqlCommandType.class, names = {"INSERT", "UPDATE", "DELETE", "FLUSH", "UNKNOWN"})
    @DisplayName("SELECT 가 아닌 statement 는 404 — 실행하지 않는다")
    void nonSelect_isNotFound(SqlCommandType type) {
        add("masterCodeSelPop.write", type, StatementType.PREPARED, QUERY_XML);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList("masterCodeSelPop.write", Map.of(), Exposure.QUERY))
                .isInstanceOf(BusinessException.class)
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
        verify(sqlSession, never()).selectList(anyString(), any(), any(RowBounds.class));
    }

    @Test
    @DisplayName("CALLABLE select(프로시저 실행)는 404")
    void callableSelect_isNotFound() {
        add("masterCodeSelPop.proc", SqlCommandType.SELECT, StatementType.CALLABLE, QUERY_XML);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList("masterCodeSelPop.proc", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @Test
    @DisplayName("persistence/query 밖 매퍼(DmomMapper 등)의 SELECT 는 형식이 맞아도 404")
    void selectOutsideQueryFolder_isNotFound() {
        addSelect("DmomMapper.selectTcError", DMOM_XML);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList("DmomMapper.selectTcError", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @Test
    @DisplayName("노출 범위는 경로마다 따로 — /query 는 persistence/lov 를, /lov/query 는 persistence/query 를 열지 않는다")
    void exposureIsPerRoute() {
        addSelect("plantLov.list", LOV_XML);
        addSelect("masterCodeSelPop.search", QUERY_XML);
        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(Collections.emptyList());
        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThat(guard.selectList("plantLov.list", Map.of(), Exposure.LOV)).isEmpty();
        assertThatThrownBy(() -> guard.selectList("plantLov.list", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
        assertThatThrownBy(() -> guard.selectList("masterCodeSelPop.search", Map.of(), Exposure.LOV))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @ParameterizedTest(name = "resource={0}")
    @ValueSource(strings = {
            "file [/app/persistence/query/a.xml]",
            "class path resource [persistence/query/a.xml]",
            "URL [jar:file:/app/app.jar!/BOOT-INF/classes!/persistence/query/a.xml]",
            "file [C:\\app\\persistence\\query\\a.xml]"})
    @DisplayName("매퍼 위치 표기(file·classpath·jar·윈도우 경로)를 모두 persistence/query 로 알아본다")
    void resourceVariants_areExposed(String resource) {
        addSelect("a.search", resource);
        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(Collections.emptyList());

        assertThat(new QueryStatementGuard(sqlSession, 100).selectList("a.search", Map.of(), Exposure.QUERY)).isEmpty();
    }

    @ParameterizedTest(name = "resource={0}")
    @ValueSource(strings = {
            "file [/app/mypersistence/query/a.xml]",
            "file [/app/persistence/query-old/a.xml]",
            "com/dongkuk/dmes/x/AMapper.java (best guess)"})
    @DisplayName("비슷하지만 다른 위치·애너테이션 매퍼는 노출하지 않는다")
    void resourceLookalikes_areNotExposed(String resource) {
        addSelect("a.search", resource);

        assertThatThrownBy(() -> new QueryStatementGuard(sqlSession, 100).selectList("a.search", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @Test
    @DisplayName("없는 id 는 404")
    void missing_isNotFound() {
        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList("noSuch.search", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @Test
    @DisplayName("다른 namespace 의 같은 짧은 id 로는 찾지 못한다 — 등록된 전체 id 와 같아야 한다")
    void otherNamespaceSameShortId_isNotFound() {
        addSelect("x.masterCodeSelPop.search", QUERY_XML);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList("masterCodeSelPop.search", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(httpStatusOf(t)).isEqualTo(404));
    }

    @ParameterizedTest(name = "queryId={0}")
    @NullSource
    @ValueSource(strings = {"", "search", "a.b.c", "a.b!selectKey", "a..b", ".b", "a.", "a.b ", "../a.b", "1a.b", "a-b.c"})
    @DisplayName("{objId}.{action} 형식이 아니면 400 — 짧은 id·selectKey·다단 namespace 포함")
    void malformedId_isBadRequest(String queryId) {
        addSelect("search", QUERY_XML);
        add("a.b!selectKey", SqlCommandType.SELECT, StatementType.PREPARED, QUERY_XML);

        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 100);

        assertThatThrownBy(() -> guard.selectList(queryId, Map.of(), Exposure.QUERY))
                .isInstanceOf(BusinessException.class)
                .satisfies(t -> assertThat(((BusinessException) t).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(sqlSession, never()).selectList(anyString(), any(), any(RowBounds.class));
    }

    @Test
    @DisplayName("행 상한 — 상한과 같으면 통과, 넘으면 400")
    void rowCap() {
        addSelect("a.search", QUERY_XML);
        QueryStatementGuard guard = new QueryStatementGuard(sqlSession, 2);

        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(List.of(1, 2));
        assertThat(guard.selectList("a.search", Map.of(), Exposure.QUERY)).hasSize(2);

        when(sqlSession.selectList(anyString(), any(), any(RowBounds.class))).thenReturn(List.of(1, 2, 3));
        assertThatThrownBy(() -> guard.selectList("a.search", Map.of(), Exposure.QUERY))
                .satisfies(t -> assertThat(((BusinessException) t).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("상한이 1 보다 작으면 기동 시 실패")
    void invalidMaxRows() {
        assertThatThrownBy(() -> new QueryStatementGuard(sqlSession, 0)).isInstanceOf(IllegalArgumentException.class);
    }
}
