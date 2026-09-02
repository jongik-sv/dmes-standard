package com.dongkuk.caravan.hub.config;

import java.lang.annotation.*;

/**
 * MST DataSource용 Mapper 마커 어노테이션.
 *
 * <p>이 어노테이션이 붙은 Mapper 인터페이스는
 * {@link DataSourceConfig.MstDataSourceConfig}의 {@code @MapperScan}에 의해 스캔되어
 * MST DataSource({@code spring.datasource.mst})를 사용한다.</p>
 *
 * <p>MST DataSource는 설정 테이블({@code TB_CARAVAN_HUB_CONFIG},
 * {@code TB_MCM_MOM_KAFKA_TOPICS})에 접근하며, SQL XML은 {@code mapper/mst/*.xml}에 위치한다.</p>
 *
 * <p>사용 예:</p>
 * <pre>{@code
 * @MstMapper
 * public interface CaravanHubConfigMapper {
 *     List<Map<String, Object>> selectDbInboundConfigs();
 * }
 * }</pre>
 *
 * @see IfMapper
 * @see DataSourceConfig.MstDataSourceConfig
 * @see com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface MstMapper {
}
