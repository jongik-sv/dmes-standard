package com.dongkuk.caravan.hub.config;

import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;

import javax.sql.DataSource;

/**
 * 듀얼 DataSource 설정.
 *
 * <p>MST(설정 테이블)와 IF(인터페이스 테이블) 두 개의 DataSource를 분리 관리한다.
 * 운영 환경에서 설정 DB와 인터페이스 DB가 분리될 수 있어서 구조적으로 나눠놓았다.</p>
 *
 * <table>
 *   <caption>DataSource 구분</caption>
 *   <tr><th>DataSource</th><th>용도</th><th>Mapper</th><th>XML 위치</th></tr>
 *   <tr><td>MST (@Primary)</td><td>설정 테이블 조회 (TB_CARAVAN_HUB_CONFIG 등)</td>
 *       <td>CaravanHubConfigMapper</td><td>mapper/mst/*.xml</td></tr>
 *   <tr><td>IF</td><td>인터페이스 테이블 CRUD (IF_* 테이블)</td>
 *       <td>InterfaceMapper</td><td>mapper/if/*.xml</td></tr>
 * </table>
 *
 * <p>MST가 {@code @Primary}이므로 Caravan 라이브러리 내부의 MyBatis도 MST DataSource를 사용한다.</p>
 *
 * <p>Mapper 인터페이스에 {@link MstMapper} 또는 {@link IfMapper} 마커 어노테이션을 붙여
 * {@code @MapperScan}의 {@code annotationClass}로 DataSource를 구분한다.</p>
 *
 * <p><b>연결 경로 2종 (2026-07-09 JNDI 전환 — docs/framework/DataSource_JNDI설계.md)</b>:
 * {@code spring.datasource.{mst,if}.jndi-name} 유무로 분기한다.</p>
 * <ul>
 *   <li>jndi-name 설정 시(WildFly dev/prod) — 컨테이너 관리 풀을 {@code JndiDataSourceLookup} 으로 조회.
 *       mcm 이 등록한 논리 DS 를 재사용: mst → {@code java:/jdbc/mcm/dsCaravan}(CARAVANUSER),
 *       if → {@code java:/jdbc/mcm/dsIF}(EAIUSER). 물리 접속/풀은 WildFly 소유(jta=false 필수).</li>
 *   <li>미설정 시(local/local-ph/local-kp) — 기존 {@code spring.datasource.{mst,if}.*} 바인딩
 *       Hikari 직결(기존 동작 100% 동일).</li>
 * </ul>
 *
 * <p>참고: {@code @ConfigurationProperties} 바인딩은 JNDI 경로에서도 시도되지만 jndi-name 외
 * 프로퍼티가 없고 컨테이너 DataSource 에 대응 setter 도 없어 무해하게 무시된다.</p>
 *
 * @see MstMapper
 * @see IfMapper
 * @see com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper
 * @see com.dongkuk.caravan.hub.mapper.InterfaceMapper
 */
public class DataSourceConfig {

    /**
     * MST DataSource 설정 (설정 테이블, {@link com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper}).
     *
     * <p>{@code spring.datasource.mst.*} 프로퍼티를 바인딩하며,
     * {@link MstMapper} 어노테이션이 붙은 Mapper 인터페이스만 스캔한다.</p>
     *
     * <p>{@code @Primary}로 지정되어 Caravan 내부 MyBatis도 이 DataSource를 사용한다.</p>
     */
    @Configuration
    @MapperScan(
            basePackages = "com.dongkuk.caravan.hub.mapper",
            sqlSessionFactoryRef = "mstSqlSessionFactory",
            annotationClass = MstMapper.class
    )
    public static class MstDataSourceConfig {

        /**
         * MST DataSource 빈 생성 — jndi-name 유무 분기(클래스 javadoc 참조).
         *
         * @return MST DataSource
         */
        @Primary
        @Bean(name = "mstDataSource")
        @ConfigurationProperties(prefix = "spring.datasource.mst")
        public DataSource mstDataSource(Environment env) {
            String jndiName = env.getProperty("spring.datasource.mst.jndi-name");
            if (jndiName != null && !jndiName.isBlank()) {
                // WildFly(dev/prod): 컨테이너 관리 풀 JNDI lookup — 풀 생명주기는 컨테이너 소유
                return new JndiDataSourceLookup().getDataSource(jndiName);
            }
            // local / local-ph / local-kp: 기존 Hikari 직결
            return DataSourceBuilder.create().build();
        }

        /**
         * MST SqlSessionFactory 빈 생성.
         *
         * <p>{@code classpath:mapper/mst/*.xml} 위치의 MyBatis XML을 로드한다.
         * {@code mapUnderscoreToCamelCase=false}, {@code callSettersOnNulls=true}로 설정한다.</p>
         *
         * @param dataSource MST DataSource
         * @return MST SqlSessionFactory
         * @throws Exception SqlSessionFactory 생성 중 오류 발생 시
         */
        @Primary
        @Bean(name = "mstSqlSessionFactory")
        public SqlSessionFactory mstSqlSessionFactory(@Qualifier("mstDataSource") DataSource dataSource) throws Exception {
            SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
            factoryBean.setDataSource(dataSource);
            factoryBean.setMapperLocations(
                    new PathMatchingResourcePatternResolver().getResources("classpath:mapper/mst/*.xml"));

            org.apache.ibatis.session.Configuration configuration = new org.apache.ibatis.session.Configuration();
            configuration.setMapUnderscoreToCamelCase(false);
            configuration.setCallSettersOnNulls(true);
            factoryBean.setConfiguration(configuration);

            return factoryBean.getObject();
        }

        /**
         * MST SqlSessionTemplate 빈 생성.
         *
         * @param sqlSessionFactory MST SqlSessionFactory
         * @return MST SqlSessionTemplate
         */
        @Primary
        @Bean(name = "mstSqlSessionTemplate")
        public SqlSessionTemplate mstSqlSessionTemplate(@Qualifier("mstSqlSessionFactory") SqlSessionFactory sqlSessionFactory) {
            return new SqlSessionTemplate(sqlSessionFactory);
        }
    }

    /**
     * IF DataSource 설정 (인터페이스 테이블, {@link com.dongkuk.caravan.hub.mapper.InterfaceMapper}).
     *
     * <p>{@code spring.datasource.if.*} 프로퍼티를 바인딩하며,
     * {@link IfMapper} 어노테이션이 붙은 Mapper 인터페이스만 스캔한다.</p>
     */
    @Configuration
    @MapperScan(
            basePackages = "com.dongkuk.caravan.hub.mapper",
            sqlSessionFactoryRef = "ifSqlSessionFactory",
            annotationClass = IfMapper.class
    )
    public static class IfDataSourceConfig {

        /**
         * IF DataSource 빈 생성 — jndi-name 유무 분기(클래스 javadoc 참조).
         *
         * @return IF DataSource
         */
        @Bean(name = "ifDataSource")
        @ConfigurationProperties(prefix = "spring.datasource.if")
        public DataSource ifDataSource(Environment env) {
            String jndiName = env.getProperty("spring.datasource.if.jndi-name");
            if (jndiName != null && !jndiName.isBlank()) {
                // WildFly(dev/prod): 컨테이너 관리 풀 JNDI lookup
                return new JndiDataSourceLookup().getDataSource(jndiName);
            }
            // local / local-ph / local-kp: 기존 Hikari 직결
            return DataSourceBuilder.create().build();
        }

        /**
         * IF SqlSessionFactory 빈 생성.
         *
         * <p>{@code classpath:mapper/if/*.xml} 위치의 MyBatis XML을 로드한다.
         * {@code mapUnderscoreToCamelCase=false}, {@code callSettersOnNulls=true}로 설정한다.</p>
         *
         * @param dataSource IF DataSource
         * @return IF SqlSessionFactory
         * @throws Exception SqlSessionFactory 생성 중 오류 발생 시
         */
        @Bean(name = "ifSqlSessionFactory")
        public SqlSessionFactory ifSqlSessionFactory(@Qualifier("ifDataSource") DataSource dataSource) throws Exception {
            SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
            factoryBean.setDataSource(dataSource);
            factoryBean.setMapperLocations(
                    new PathMatchingResourcePatternResolver().getResources("classpath:mapper/if/*.xml"));

            org.apache.ibatis.session.Configuration configuration = new org.apache.ibatis.session.Configuration();
            configuration.setMapUnderscoreToCamelCase(false);
            configuration.setCallSettersOnNulls(true);
            factoryBean.setConfiguration(configuration);

            return factoryBean.getObject();
        }

        /**
         * IF SqlSessionTemplate 빈 생성.
         *
         * @param sqlSessionFactory IF SqlSessionFactory
         * @return IF SqlSessionTemplate
         */
        @Bean(name = "ifSqlSessionTemplate")
        public SqlSessionTemplate ifSqlSessionTemplate(@Qualifier("ifSqlSessionFactory") SqlSessionFactory sqlSessionFactory) {
            return new SqlSessionTemplate(sqlSessionFactory);
        }
    }
}
