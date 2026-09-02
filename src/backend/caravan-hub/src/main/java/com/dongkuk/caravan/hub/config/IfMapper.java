package com.dongkuk.caravan.hub.config;

import java.lang.annotation.*;

/**
 * IF DataSource용 Mapper 마커 어노테이션.
 *
 * <p>이 어노테이션이 붙은 Mapper 인터페이스는
 * {@link DataSourceConfig.IfDataSourceConfig}의 {@code @MapperScan}에 의해 스캔되어
 * IF DataSource({@code spring.datasource.if})를 사용한다.</p>
 *
 * <p>IF DataSource는 인터페이스 테이블({@code IF_*})에 접근하며,
 * SQL XML은 {@code mapper/if/*.xml}에 위치한다.</p>
 *
 * <p>사용 예:</p>
 * <pre>{@code
 * @IfMapper
 * public interface InterfaceMapper {
 *     List<Map<String, Object>> selectPendingMessages(...);
 * }
 * }</pre>
 *
 * @see MstMapper
 * @see DataSourceConfig.IfDataSourceConfig
 * @see com.dongkuk.caravan.hub.mapper.InterfaceMapper
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface IfMapper {
}
