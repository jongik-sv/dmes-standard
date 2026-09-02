package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;

import javax.sql.DataSource;
import java.util.Map;

/**
 * {@link SqlScriptTaskExecutable}에서 {@code External Resource} 즉, SQL ID가 등록되어 있으면 해당 인터페이스를 호출한다.
 * <p>
 * {@link SqlRunner}는 입력된 파라미터와 데이터소스를 이용해서 외부에 있는 자원을 호출한다.
 *
 * @author Jeongjin Kim
 * @since 2022-03-08
 */
public interface SqlRunner {
    /**
     * @param param      파라미터
     * @param dataSource 데이터소스
     * @param sqlId      sql id
     * @return 수행 결과
     */
    TypedObject run(Map<String, Object> param, DataSource dataSource, String sqlId);
}
