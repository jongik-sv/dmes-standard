package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.oasis.aop.OasisAopAnnotationChecker;
import com.dongkuk.dmes.cactus.oasis.converter.MssqlColumnConverter;
import com.dongkuk.dmes.cactus.oasis.converter.SqliteColumnConverter;
import com.dongkuk.dmes.cactus.oasis.loader.HttpServiceDocumentLoader;
import com.dongkuk.dmes.cactus.oasis.provider.CactusCachingServiceProvider;
import com.dongkuk.dmes.cactus.oasis.provider.DefaultTxInjectingServiceProvider;
import com.dongkuk.dmes.cactus.oasis.task.MyBatisSqlRunner;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.executors.SqlRunner;
import com.dongkuk.oasis.factories.NonTransactionalServiceStarterFactory;
import com.dongkuk.oasis.factories.SpringServiceStarterFactory;
import com.dongkuk.oasis.jdbc.ColumnConverter;
import com.dongkuk.oasis.provider.GenericServiceProvider;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;
import org.apache.ibatis.session.SqlSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;

/**
 * OASIS 통합 자동 설정.
 *
 * <p>Phase 1 (2026-05-12) — film {@code OasisConfig} 의 분기 로직을 cactus 로 흡수.
 * 미결 #6/#7/#8 + R-11 결정 반영.
 *
 * <p>1.0.20-SNAPSHOT (2026-05-14) — {@code ServiceProvider} 명시 호출로 정정.
 * 이전 구현은 transactional + filesystem 분기에서 {@code setServiceDocumentDirectory(path)}
 * 만 호출 → oasis-core 5.1.0 의 디폴트 ServiceProvider({@code SimpleServiceProvider})
 * 가 사용되었으나 {@code servicePath} 디폴트값(이전: {@code "resources/services"}) 가
 * {@code ClassPathFileServiceLoader} 의 검색 패턴과 호환되지 않아 BPMN 매칭 0건 →
 * {@code ServiceNotFoundException} 발생. film 패턴을 따라 {@link SimpleServiceProvider}
 * 를 명시 등록 + {@link CachingServiceProvider} 로 감싸서 캐시 손실 방지.
 *
 * <p>변경 사항 (이전 NonTransactional 단일 모드 → 다음):
 * <ul>
 *   <li>{@code cactus.oasis.transactional} 분기: false → NonTransactional, true → Spring(JpaTxMgr)</li>
 *   <li>{@code cactus.oasis.service-loader-url} 명시 시 HTTP loader 사용 (transactional=true 필수)</li>
 *   <li>{@code cactus.oasis.service-path} 가 ClassPath prefix 로 사용 (디폴트 {@code "/services"})</li>
 *   <li>{@code cactus.oasis.dialect} 분기로 {@link MssqlColumnConverter} / {@link SqliteColumnConverter} 빈 등록</li>
 *   <li>{@link MyBatisSqlRunner} 가 SqlSession 빈 존재 시 자동 등록</li>
 * </ul>
 *
 * <p>{@code MessageBuilder} 빈은 등록하지 않는다 — oasis-core 5.1.0 에 인터페이스 부재.
 */
@Configuration
@ConditionalOnClass(ServiceStarter.class)
@EnableConfigurationProperties({OasisProperties.class, CactusTxProperties.class})
public class OasisAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(OasisAutoConfiguration.class);

    /**
     * BPMN 파일이름/serviceId 안 path 구분자 — film 컨벤션과 동일하게 {@code "^^"} 사용.
     * 호출 serviceId 가 {@code "group^^name"} 형태일 때 {@code group/name.bpmn} 으로 풀어서 매칭.
     */
    private static final String FILE_DESCRIPTION_DELIMITER = "^^";

    /**
     * OASIS ServiceStarter 빈.
     * R-11 검증 결과(2026-05-12 jar): {@code NonTransactionalServiceStarterFactory} 에는
     * {@code setServiceProvider} 가 없고 {@code setServiceDocumentDirectory(String)} 만 노출.
     * 따라서 URL 모드는 {@code transactional=true} 일 때만 사용 가능.
     */
    /**
     * OASIS ServiceStarter 빈.
     *
     * <p>1.0.21-SNAPSHOT (2026-05-15) — multi-tx 모드 도입 (옵션 δ).
     * <ul>
     *   <li>{@code cactus.tx.managers} 정의됨 → multi-tx 모드: 화이트리스트 = managers 의 모든 alias,
     *       {@link DefaultTxInjectingServiceProvider} 가 BPMN load 시 default TxMgr 자동 inject (R-multi-11 회피)</li>
     *   <li>미정의 → legacy 모드: 화이트리스트 = [{@code cactus.oasis.transaction-manager-name}] 단일 (1.0.20 동작)</li>
     * </ul>
     *
     * <p>{@link CactusCachingServiceProvider} 는 항상 적용 — oasis-core 의
     * {@code CachingServiceProvider} 가 {@code cache.cache()} 호출 누락으로 미동작 (R-multi-22) 이라
     * legacy 모드에도 cache 정상화 혜택.
     */
    @Bean
    @ConditionalOnMissingBean
    public ServiceStarter serviceStarter(OasisProperties props,
                                         CactusTxProperties txProps,
                                         ApplicationContext ctx) {
        String url = trimToNull(props.getServiceLoaderUrl());
        String path = props.getServicePath();
        int cacheSize = props.getCache().getSize();

        if (props.isTransactional()) {
            boolean isMultiTx = !txProps.getManagers().isEmpty();
            String[] tmNames = isMultiTx
                    ? txProps.getManagers().keySet().toArray(new String[0])
                    : new String[]{props.getTransactionManagerName()};
            SpringServiceStarterFactory factory = new SpringServiceStarterFactory(ctx, tmNames);

            ServiceProvider provider;
            if (url != null) {
                log.info("[Cactus Oasis] transactional + HTTP loader — {}", url);
                provider = new GenericServiceProvider(
                        new CamundaBpmnServiceUnmarshaller(),
                        new HttpServiceDocumentLoader(url, 10));
            } else {
                log.info("[Cactus Oasis] transactional + classpath loader — {}", path);
                provider = new SimpleServiceProvider(path, "bpmn", FILE_DESCRIPTION_DELIMITER);
            }

            if (isMultiTx) {
                provider = new DefaultTxInjectingServiceProvider(provider, txProps.getDefaultManager());
                log.info("[Cactus Oasis] multi-tx mode — managers={}, default={}",
                        Arrays.toString(tmNames), txProps.getDefaultManager());
            } else {
                log.info("[Cactus Oasis] legacy mode — single tx={}, cactus.tx.managers 마이그레이션 권장",
                        props.getTransactionManagerName());
            }
            factory.setServiceProvider(new CactusCachingServiceProvider(provider, cacheSize));
            return factory.generateServiceStarter();
        }

        // non-transactional
        if (url != null) {
            throw new IllegalStateException(
                    "cactus.oasis.service-loader-url 은 cactus.oasis.transactional=true 일 때만 사용 가능합니다. " +
                    "oasis-core 5.1.0 의 NonTransactionalServiceStarterFactory 는 setServiceProvider 미지원.");
        }
        log.info("[Cactus Oasis] non-transactional + classpath loader — {}", path);
        NonTransactionalServiceStarterFactory factory = new NonTransactionalServiceStarterFactory();
        factory.setServiceDocumentDirectory(path);
        factory.setFileDescriptionDelimiter(FILE_DESCRIPTION_DELIMITER);
        return factory.generateServiceStarter();
    }

    /** CactusRequest → OASIS 입력 변환기 빈 생성 */
    @Bean
    public CactusRequestConverter oasisRequestConverter() {
        return new CactusRequestConverter();
    }

    /** OASIS 결과 → CactusResponse 변환기 빈 생성 */
    @Bean
    public CactusResponseConverter oasisResponseConverter() {
        return new CactusResponseConverter();
    }

    /** OASIS 서비스 실행기 빈 생성 */
    @Bean
    public OasisServiceExecutor oasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        return new OasisServiceExecutor(
                serviceStarter, springApplicationContext,
                requestConverter, responseConverter);
    }

    /**
     * BPMN 이 부르는 빈의 프록시 의존 어노테이션 검사기 ({@code cactus.oasis.aop-check}, 기본 warn).
     * classpath 로더 모드는 기동 시 {@code service-path} 아래 BPMN 을 스캔해 검사하고, HTTP 로더 모드는
     * 기동 시 BPMN 목록이 없어 검사할 수 없다는 안내만 한 번 남긴다.
     */
    @Bean
    @ConditionalOnMissingBean
    public OasisAopAnnotationChecker oasisAopAnnotationChecker(OasisProperties props, ApplicationContext ctx) {
        boolean classpathLoader = trimToNull(props.getServiceLoaderUrl()) == null;
        return new OasisAopAnnotationChecker(ctx, props.getAopCheck(), props.getServicePath(),
                classpathLoader, props.isTransactional());
    }

    /**
     * MSSQL 컬럼 변환기. {@code cactus.oasis.dialect=mssql} 일 때 등록.
     */
    @Bean
    @ConditionalOnProperty(prefix = "cactus.oasis", name = "dialect", havingValue = "mssql")
    @ConditionalOnMissingBean(ColumnConverter.class)
    public ColumnConverter mssqlColumnConverter() {
        return new MssqlColumnConverter();
    }

    /**
     * SQLite 컬럼 변환기. {@code cactus.oasis.dialect=sqlite} 일 때 등록.
     * 미결 #3 결정: 최소 변환.
     */
    @Bean
    @ConditionalOnProperty(prefix = "cactus.oasis", name = "dialect", havingValue = "sqlite")
    @ConditionalOnMissingBean(ColumnConverter.class)
    public ColumnConverter sqliteColumnConverter() {
        return new SqliteColumnConverter();
    }

    /**
     * MyBatis 기반 SqlRunner. SqlSession 빈이 있을 때만 등록.
     * 미결 #4 결정: 단일 DS 환경에서 자동 트랜잭션 동기화.
     */
    @Bean
    @ConditionalOnBean(SqlSession.class)
    @ConditionalOnMissingBean(SqlRunner.class)
    public SqlRunner sqlRunner(SqlSession sqlSession) {
        return new MyBatisSqlRunner(sqlSession);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
