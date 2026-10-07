package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.mapping.StatementType;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.session.SqlSession;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * {@code /query/{queryId}}·{@code /lov/query/{queryId}} 가 실행할 수 있는 매퍼 statement 를 거른다.
 *
 * <p>2026-10-07 보안 지적(notice-fill2 route-guard): 두 경로는 요청이 준 statement id 를 종류 확인 없이
 * {@code selectList} 로 실행해, insert statement id 를 주면 INSERT 가 실행·커밋됐다. 규칙은 query-route 설계
 * (docs/superpowers/specs/2026-10-07-query-route-mybatis-design.md §4)와 맞춘다.
 * <ul>
 *   <li>S2 형식 — {@code {objId}.{action}} 한 모양만 받는다(점 하나, 영숫자·밑줄). 아니면 400.</li>
 *   <li>S1 노출 — 매퍼 파일이 {@code persistence/query/**}(LoV 는 {@code persistence/lov/**}) 아래일 때만. 그 밖은 404.
 *       DmomMapper·caravan 매퍼처럼 다른 자리의 매퍼는 형식이 맞아도 열리지 않는다.</li>
 *   <li>S5 — {@code SELECT} 이고 {@code CALLABLE} 이 아닌 statement 만. 없는 id·짧은 id 해석·selectKey({@code !})도 404.</li>
 *   <li>S4 — 행 상한 {@code max} 를 넘으면 거절(400). {@code max+1} 행까지만 읽는다.</li>
 * </ul>
 * 노출하지 않는 statement 는 이유와 무관하게 같은 404 로 답해 statement 존재 여부를 드러내지 않는다.
 *
 * <p>S2 권한 키 판정({@code /query/{objId}.{action}} → OBJECT 권한)은 이 클래스가 아니라 권한 필터의 몫이다.
 * 지금은 BFF·mcm 권한 필터가 이 경로를 모양으로 거부한다 — 경로를 켜는 회차에서 그 자리를 권한 키 판정으로 바꾼다.
 */
public class QueryStatementGuard {

    /** 노출 범위 — {@code /query} 와 {@code /lov/query} 가 각자 다른 매퍼 폴더만 연다. */
    public enum Exposure {
        QUERY("persistence/query/"),
        LOV("persistence/lov/");

        private final Pattern resourcePattern;

        Exposure(String dir) {
            // getResource() 예: "file [/x/persistence/query/a.xml]", "class path resource [persistence/query/a.xml]",
            // "URL [jar:file:/x.jar!/persistence/query/a.xml]". 폴더 이름 앞은 경로 구분자나 '[' 여야 한다.
            this.resourcePattern = Pattern.compile("(?:^|[/\\[!])" + Pattern.quote(dir));
        }

        boolean exposes(String resource) {
            return resource != null && resourcePattern.matcher(resource.replace('\\', '/')).find();
        }
    }

    /** S2 — {@code {objId}.{action}}. */
    private static final Pattern QUERY_ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_]*\\.[A-Za-z][A-Za-z0-9_]*$");

    private final SqlSession sqlSession;
    private final int maxRows;

    public QueryStatementGuard(SqlSession sqlSession, int maxRows) {
        if (maxRows < 1) {
            throw new IllegalArgumentException("cactus.query.max-rows 는 1 이상이어야 합니다: " + maxRows);
        }
        this.sqlSession = sqlSession;
        this.maxRows = maxRows;
    }

    /** 검사를 통과한 statement 를 상한까지 읽는다. */
    public <E> List<E> selectList(String queryId, Map<String, Object> params, Exposure exposure) {
        String id = requireExposed(queryId, exposure);
        List<E> rows = sqlSession.selectList(id, params, new RowBounds(0, maxRows + 1));
        if (rows.size() > maxRows) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    String.format("조회 결과가 상한 %d 행을 넘습니다. 조건을 좁혀 주세요.", maxRows));
        }
        return rows;
    }

    /** 노출 가능한 statement 의 id 를 돌려준다. 아니면 400(형식)·404(그 밖). */
    String requireExposed(String queryId, Exposure exposure) {
        if (queryId == null || !QUERY_ID.matcher(queryId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "queryId 는 {objId}.{action} 형식이어야 합니다");
        }
        Configuration configuration = sqlSession.getConfiguration();
        MappedStatement ms = configuration.hasStatement(queryId)
                ? configuration.getMappedStatement(queryId)
                : null;
        if (ms == null
                || !queryId.equals(ms.getId())
                || ms.getSqlCommandType() != SqlCommandType.SELECT
                || ms.getStatementType() == StatementType.CALLABLE
                || !exposure.exposes(ms.getResource())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "없는 조회입니다: " + queryId);
        }
        return ms.getId();
    }
}
