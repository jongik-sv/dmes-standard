package com.dongkuk.dmes.cactus.audit;

import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * MyBatis SQL 로깅 인터셉터.
 *
 * <p>실행되는 모든 SQL의 queryId, SQL문, 바인딩 파라미터, 실행 시간을 로깅한다.
 *
 * <p>원본: dmes-film {@code MybatisSqlLogger}
 *
 * <p>로그 출력 예시:
 * <pre>
 * INFO  c.d.c.audit.SqlLoggingInterceptor - Mybatis SQL :
 * /* com.dongkuk.myapp.mapper.OrderMapper.selectByPlant *&#47;
 * SELECT ORDER_ID, ITEM_CD, QTY
 *   FROM TB_ORDER
 *  WHERE PLANT_CD = ?
 *    AND STATUS = ?
 * INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [0] as [java.lang.String] - [P01]
 * INFO  c.d.c.audit.SqlLoggingInterceptor - binding parameter [1] as [java.lang.String] - [NEW]
 * INFO  c.d.c.audit.SqlLoggingInterceptor - [....selectByPlant] elapsed: 12ms
 * </pre>
 *
 * <p>비활성화: {@code logging.level.com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor=OFF}
 */
@Intercepts({
    @Signature(type = Executor.class, method = "query",
               args = {MappedStatement.class, Object.class,
                       RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
public class SqlLoggingInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger(SqlLoggingInterceptor.class);

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        if (!log.isInfoEnabled()) {
            return invocation.proceed();
        }

        MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
        Object parameter = invocation.getArgs()[1];

        String queryId = ms.getId();
        BoundSql boundSql = ms.getBoundSql(parameter);
        String sql = boundSql.getSql();

        log.info("Mybatis SQL : \n/* {} */\n{}", queryId, sql);

        Object parameterObject = boundSql.getParameterObject();
        if (parameterObject != null) {
            List<ParameterMapping> mappings = boundSql.getParameterMappings();
            if (mappings != null && !mappings.isEmpty()) {
                MetaObject metaObject = ms.getConfiguration()
                                          .newMetaObject(parameterObject);
                for (int i = 0; i < mappings.size(); i++) {
                    String prop = mappings.get(i).getProperty();
                    Object value = metaObject.hasGetter(prop)
                                   ? metaObject.getValue(prop) : null;
                    log.info("binding parameter [{}] as [{}] - [{}]",
                             i,
                             value == null ? "null" : value.getClass().getName(),
                             value);
                }
            }
        }

        long start = System.currentTimeMillis();
        Object result = invocation.proceed();
        long elapsed = System.currentTimeMillis() - start;

        log.info("[{}] elapsed: {}ms", queryId, elapsed);

        return result;
    }
}
