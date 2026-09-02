package com.dongkuk.dmes.cactus.oasis.task;

import com.dongkuk.dmes.cactus.oasis.util.CaseConverter;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.executors.SqlRunner;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.session.SqlSession;
import org.springframework.util.TypeUtils;

import javax.sql.DataSource;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Oasis BPMN 의 SQL 태스크를 MyBatis SqlSession 으로 실행한다. film 의
 * {@code cmn.oasis.task.MyBatisSqlRunner} 를 cactus 로 이식 (Phase 1, 2026-05-12).
 *
 * <p>실행 식별자 형식 (film 패턴 유지):
 * <ul>
 *   <li>{@code "<mapperId>"}: select 로 간주. resultType 이 Map 이면 컬럼명을 camelCase 로 변환</li>
 *   <li>{@code "insert,<mapperId>"} / {@code "update,..."} / {@code "delete,..."}: 명시 명령어</li>
 * </ul>
 *
 * <p>주입받는 {@link SqlSession} 빈은 mybatis-spring-boot-starter 의 기본 빈
 * (primary DataSource 와 묶임). 미결 #4 결정: 단일 DS 환경에서만 자동 트랜잭션
 * 동기화 보장.
 */
public class MyBatisSqlRunner implements SqlRunner {

    private final SqlSession sqlSession;

    public MyBatisSqlRunner(SqlSession sqlSession) {
        this.sqlSession = sqlSession;
    }

    @Override
    public TypedObject run(Map<String, Object> parameters, DataSource dataSource, String identifier) {
        String[] split = identifier.split(",");
        int result;
        if (split.length == 2) {
            switch (split[0].toLowerCase()) {
                case "insert":
                    result = sqlSession.insert(split[1], parameters);
                    return returnResult(result);
                case "update":
                    result = sqlSession.update(split[1], parameters);
                    return returnResult(result);
                case "delete":
                    result = sqlSession.delete(split[1], parameters);
                    return returnResult(result);
                default:
                    return returnResult(
                            changeKeyCaseToCamel(sqlSession.selectList(split[1], parameters)),
                            new TypeReference<List<Map<String, Object>>>() {}.getType());
            }
        }

        List<?> objects = sqlSession.selectList(identifier, parameters);
        Class<?> type = getResultType(identifier);
        if (TypeUtils.isAssignable(Map.class, type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) objects;
            return returnResult(changeKeyCaseToCamel(rows),
                    new TypeReference<List<Map<String, Object>>>() {}.getType());
        }
        return returnResult(objects, new TypeReference<List<Object>>() {}.getType());
    }

    private TypedObject returnResult(Object object) {
        sqlSession.clearCache();
        return new TypedObject(object);
    }

    private TypedObject returnResult(Object object, Type type) {
        sqlSession.clearCache();
        return new TypedObject(object, type);
    }

    private List<Map<String, Object>> changeKeyCaseToCamel(List<Map<String, Object>> objects) {
        List<Map<String, Object>> newList = new ArrayList<>(objects.size());
        for (Map<String, Object> object : objects) {
            Map<String, Object> newMap = new HashMap<>(object.size() * 2);
            for (Map.Entry<String, Object> e : object.entrySet()) {
                newMap.put(CaseConverter.toCamelCase(e.getKey()), e.getValue());
            }
            newList.add(newMap);
        }
        return newList;
    }

    private Class<?> getResultType(String mapperId) {
        MappedStatement mappedStatement = sqlSession.getConfiguration().getMappedStatement(mapperId);
        List<ResultMap> resultMaps = mappedStatement.getResultMaps();
        if (resultMaps.isEmpty()) {
            throw new IllegalStateException(
                    "[" + mapperId + "] 매퍼에서 resultType 을 찾을 수 없습니다. " +
                    "select 가 아닌 문장(insert/update/delete) 을 호출했다면 식별자 앞에 명령어를 " +
                    "붙이고 ',(콤마)' 뒤에 매퍼 ID 를 작성하세요. 예: \"insert,com.example.dao.foo\"");
        }
        return resultMaps.get(0).getType();
    }
}
