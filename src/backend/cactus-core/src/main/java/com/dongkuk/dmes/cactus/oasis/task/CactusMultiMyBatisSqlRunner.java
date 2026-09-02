package com.dongkuk.dmes.cactus.oasis.task;

import com.dongkuk.dmes.cactus.oasis.util.CaseConverter;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.executors.SqlRunner;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.session.SqlSession;
import org.mybatis.spring.SqlSessionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.util.TypeUtils;

import javax.sql.DataSource;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * cactus multi-DS 환경의 MyBatisSqlRunner. OASIS ScriptTask 의 multi-DS 분기 처리.
 *
 * <p>1.0.22-SNAPSHOT (2026-05-19) 신규. 기존 {@link MyBatisSqlRunner} 가 단일 SqlSession 가정이라
 * multi-DS 분기 불가 → 본 클래스가 dataSource 별 SqlSessionTemplate 동적 선택.
 *
 * <p>OASIS 의 {@code SqlScriptTaskExecutable} 이 ds/tx 속성으로 DataSource 추출 후 본 runner 의
 * {@link #run(Map, DataSource, String)} 에 전달. 본 runner 가 dataSource 기준으로
 * SqlSessionTemplate 동적 선택 후 mapper id 호출.
 *
 * <p>film 의 {@code MyBatisSqlRunner} identifier 형식 호환 유지:
 * <ul>
 *   <li>{@code "<mapperId>"} — select 로 간주 (Map 이면 컬럼명 camelCase 변환)</li>
 *   <li>{@code "insert,<mapperId>"} / {@code "update,..."} / {@code "delete,..."} — 명시 명령</li>
 * </ul>
 *
 * <p>참조 비교 (R-mybatis-4) — SqlSessionTemplate 의 dataSource 와 OASIS 추출 dataSource 가
 * 같은 빈 인스턴스. cactus 의 yml-key alias 가 같은 빈 인스턴스 공유 보장.
 *
 * <p>자세한 내용은 {@code docs/cactus/cactus-mybatis-multi-ds-design.md} §5-5 참고.
 */
public class CactusMultiMyBatisSqlRunner implements SqlRunner {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiMyBatisSqlRunner.class);

    private final BeanFactory beanFactory;
    private final SqlSessionTemplate defaultTemplate;   // primary = sqlSessionTemplateBiz
    private final Map<DataSource, SqlSessionTemplate> cache = new ConcurrentHashMap<>();

    public CactusMultiMyBatisSqlRunner(BeanFactory beanFactory, SqlSessionTemplate defaultTemplate) {
        this.beanFactory = beanFactory;
        this.defaultTemplate = defaultTemplate;
    }

    @Override
    public TypedObject run(Map<String, Object> parameters, DataSource dataSource, String identifier) {
        SqlSessionTemplate session = resolveSession(dataSource);
        String[] split = identifier.split(",");
        int result;

        if (split.length == 2) {
            String cmd = split[0].toLowerCase();
            String mapperId = split[1];
            switch (cmd) {
                case "insert":
                    result = session.insert(mapperId, parameters);
                    return returnResult(session, result);
                case "update":
                    result = session.update(mapperId, parameters);
                    return returnResult(session, result);
                case "delete":
                    result = session.delete(mapperId, parameters);
                    return returnResult(session, result);
                default:
                    return returnResult(session,
                            changeKeyCaseToCamel(session.selectList(mapperId, parameters)),
                            new TypeReference<List<Map<String, Object>>>() {}.getType());
            }
        }

        // 단일 토큰 → select
        List<?> objects = session.selectList(identifier, parameters);
        Class<?> type = getResultType(session, identifier);
        if (TypeUtils.isAssignable(Map.class, type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) objects;
            return returnResult(session, changeKeyCaseToCamel(rows),
                    new TypeReference<List<Map<String, Object>>>() {}.getType());
        }
        return returnResult(session, objects, new TypeReference<List<Object>>() {}.getType());
    }

    /**
     * dataSource → SqlSessionTemplate 매핑.
     *
     * <p>cactus 가 등록한 {@code sqlSessionTemplate{Biz,Cmn,If}} 빈 중에서 SqlSessionTemplate 의
     * dataSource 와 입력 dataSource 가 같은 인스턴스 (==) 인 것 선택.
     *
     * <p>R-mybatis-4 검증 결과: mybatis-spring 3.0.5 {@code SqlSessionFactoryBean} 이 일반
     * DataSource 는 unwrap 없이 그대로 저장 (line 405-413) + Environment 생성 시 같은 인스턴스 전달
     * (line 678-680). 따라서 cactus 가 같은 yml-key alias 빈을 SqlSessionFactoryBean +
     * JpaTransactionManager 양쪽에 주입하면 참조 비교 정상 동작.
     */
    private SqlSessionTemplate resolveSession(DataSource dataSource) {
        if (dataSource == null) return defaultTemplate;
        return cache.computeIfAbsent(dataSource, ds -> {
            Map<String, SqlSessionTemplate> templates =
                    ((ListableBeanFactory) beanFactory).getBeansOfType(SqlSessionTemplate.class);
            for (Map.Entry<String, SqlSessionTemplate> entry : templates.entrySet()) {
                DataSource templateDs = entry.getValue().getConfiguration()
                        .getEnvironment().getDataSource();
                if (templateDs == ds) {
                    log.debug("[Cactus Mybatis] ds={} → SqlSessionTemplate '{}'",
                            describeDs(ds), entry.getKey());
                    return entry.getValue();
                }
            }
            throw new IllegalStateException(
                    "No SqlSessionTemplate matching DataSource: " + describeDs(ds) +
                    ". cactus.datasource.extras yml 정의 또는 빈 alias 매핑 확인.");
        });
    }

    private TypedObject returnResult(SqlSessionTemplate session, Object object) {
        session.clearCache();
        return new TypedObject(object);
    }

    private TypedObject returnResult(SqlSessionTemplate session, Object object, Type type) {
        session.clearCache();
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

    private Class<?> getResultType(SqlSession session, String mapperId) {
        MappedStatement mappedStatement = session.getConfiguration().getMappedStatement(mapperId);
        List<ResultMap> resultMaps = mappedStatement.getResultMaps();
        if (resultMaps.isEmpty()) {
            throw new IllegalStateException(
                    "[" + mapperId + "] 매퍼에서 resultType 을 찾을 수 없습니다. " +
                    "select 가 아닌 문장(insert/update/delete) 을 호출했다면 식별자 앞에 명령어를 " +
                    "붙이고 ',(콤마)' 뒤에 매퍼 ID 를 작성하세요. 예: \"insert,security.objectManagement.insertObj\"");
        }
        return resultMaps.get(0).getType();
    }

    private static String describeDs(DataSource ds) {
        return ds.getClass().getSimpleName() + "@" + Integer.toHexString(System.identityHashCode(ds));
    }
}
