package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor;
import com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor;
import com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration;
import com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeDecoder;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeMybatisInterceptor;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.task.CactusMultiMyBatisSqlRunner;
import com.dongkuk.oasis.executors.SqlRunner;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;

/**
 * cactus 의 multi-DS MyBatis 자동 등록.
 *
 * <p>1.0.22-SNAPSHOT (2026-05-19) 신규 — film 의 검증된 multi-DS mybatis 패턴
 * (BizDataAccessConfig + FrmDataAccessConfig + MailDataAccessConfig) 을 cactus 가
 * 자동 등록으로 흡수.
 *
 * <p>등록 빈 (cactus.datasource.extras.* yml 정의에 따라 분기):
 * <ul>
 *   <li>{@code sqlSessionFactoryBiz} {@code @Primary} — {@code dataSource} 빈 기반</li>
 *   <li>{@code sqlSessionFactoryIf} — {@code cactusDataSourceIf} 빈 존재 시</li>
 *   <li>{@code sqlSessionFactoryCmn} — {@code cactusDataSourceCmn} 빈 존재 시</li>
 *   <li>{@code sqlSessionTemplate*} — 각 SqlSessionFactory 마다 SqlSessionTemplate 빈</li>
 *   <li>{@link CactusMultiMyBatisSqlRunner} (SqlRunner) — OASIS ScriptTask 의 multi-DS 분기 SqlRunner</li>
 * </ul>
 *
 * <p>인터셉터 attach (film 패턴 — setPlugins 직접 new):
 * <ul>
 *   <li>{@link SqlLoggingInterceptor} (outer)</li>
 *   <li>{@link CactusMybatisAuditInterceptor} (mid)</li>
 *   <li>{@link MasterCodeMybatisInterceptor} (inner — MasterCodeDecoder 빈 존재 시)</li>
 * </ul>
 *
 * <p>기존 {@code AuditAutoConfiguration.MybatisAuditAutoConfiguration} +
 * {@code MasterCodeMybatisAutoConfiguration.InterceptorRegistrar} 는 단일 SqlSessionFactory 가정 →
 * 1.0.22-SNAPSHOT 폐기. 본 클래스가 attach 책임 전담.
 *
 * <p>AutoConfiguration order:
 * <ul>
 *   <li>{@code after = CactusMultiDataSourceAutoConfiguration, CactusMultiJpaAutoConfiguration}
 *       — DataSource + JpaTxMgr 등록 후</li>
 *   <li>{@code before = OasisAutoConfiguration} — 본 설계의 SqlRunner 가 기존
 *       {@code OasisAutoConfiguration.sqlRunner} 보다 먼저 등록되어 {@code @ConditionalOnMissingBean(SqlRunner.class)} 통과</li>
 * </ul>
 *
 * <p>자세한 내용은 {@code docs/cactus/cactus-mybatis-multi-ds-design.md} §5-4, §5-5 참고.
 */
@AutoConfiguration(
        after = {
                CactusMultiDataSourceAutoConfiguration.class,
                CactusMultiJpaAutoConfiguration.class
        },
        before = OasisAutoConfiguration.class
)
@ConditionalOnClass({SqlSessionFactory.class, SqlSessionFactoryBean.class})
@ConditionalOnProperty(prefix = "cactus.mybatis", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(CactusMybatisProperties.class)
public class CactusMultiMybatisAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiMybatisAutoConfiguration.class);

    // ── biz SqlSessionFactory (primary = dataSource) ──
    @Bean("sqlSessionFactoryBiz")
    @Primary
    @ConditionalOnBean(name = "dataSource")
    public SqlSessionFactory sqlSessionFactoryBiz(
            @Qualifier("dataSource") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("biz", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    // ── if SqlSessionFactory ──
    // R-mybatis-11 (2026-05-19): @ConditionalOnBean(name = "cactusDataSourceIf") 는 BDRPP timing 이슈로
    // cactus 의 CactusMultiDataSourceAutoConfiguration (BDRPP) 가 등록한 빈을 detect 못 함 → skip.
    // → @ConditionalOnProperty 로 변경 — yml 기반 조건 (timing 무관 + 의도 명확).
    // JNDI 전환 (2026-07-07): WildFly 환경은 extras 에 url 없이 jndi-name 만 정의 → url 단독 조건이면
    // SqlSessionFactory/Template 미생성으로 CactusMultiMyBatisSqlRunner 가 런타임 예외.
    // → url OR jndi-name (AnyNestedCondition) 로 완화.
    @Bean("sqlSessionFactoryIf")
    @Conditional(OnIfExtrasDefined.class)
    public SqlSessionFactory sqlSessionFactoryIf(
            @Qualifier("cactusDataSourceIf") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("if", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    // ── cmn SqlSessionFactory ──
    @Bean("sqlSessionFactoryCmn")
    @Conditional(OnCmnExtrasDefined.class)
    public SqlSessionFactory sqlSessionFactoryCmn(
            @Qualifier("cactusDataSourceCmn") DataSource ds,
            ObjectProvider<MasterCodeDecoder> decoderProvider,
            CactusMybatisProperties props,
            ResourceLoader rl) throws Exception {
        return build("cmn", ds, decoderProvider.getIfAvailable(), props, rl);
    }

    /** cactus.datasource.extras.if 가 url(직결) 또는 jndi-name(WildFly) 로 정의됐는지 — 어느 쪽이든 DS 빈 존재. */
    static class OnIfExtrasDefined extends AnyNestedCondition {
        OnIfExtrasDefined() { super(ConfigurationPhase.REGISTER_BEAN); }

        @ConditionalOnProperty(prefix = "cactus.datasource.extras.if", name = "url")
        static class HasUrl {}

        @ConditionalOnProperty(prefix = "cactus.datasource.extras.if", name = "jndi-name")
        static class HasJndiName {}
    }

    /** cactus.datasource.extras.cmn 가 url(직결) 또는 jndi-name(WildFly) 로 정의됐는지 — 어느 쪽이든 DS 빈 존재. */
    static class OnCmnExtrasDefined extends AnyNestedCondition {
        OnCmnExtrasDefined() { super(ConfigurationPhase.REGISTER_BEAN); }

        @ConditionalOnProperty(prefix = "cactus.datasource.extras.cmn", name = "url")
        static class HasUrl {}

        @ConditionalOnProperty(prefix = "cactus.datasource.extras.cmn", name = "jndi-name")
        static class HasJndiName {}
    }

    // ── SqlSessionTemplate biz/cmn/if ──
    // sqlSessionFactoryBiz 는 @ConditionalOnBean(name="dataSource") 조건부 등록이므로
    // template 도 동일하게 가드 (if/cmn 와 일관). 미가드 시 dataSource 미등록 환경에서 NoSuchBean 폭발.
    @Bean("sqlSessionTemplateBiz")
    @Primary
    @ConditionalOnBean(name = "sqlSessionFactoryBiz")
    public SqlSessionTemplate sqlSessionTemplateBiz(
            @Qualifier("sqlSessionFactoryBiz") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    @Bean("sqlSessionTemplateIf")
    @ConditionalOnBean(name = "sqlSessionFactoryIf")
    public SqlSessionTemplate sqlSessionTemplateIf(
            @Qualifier("sqlSessionFactoryIf") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    @Bean("sqlSessionTemplateCmn")
    @ConditionalOnBean(name = "sqlSessionFactoryCmn")
    public SqlSessionTemplate sqlSessionTemplateCmn(
            @Qualifier("sqlSessionFactoryCmn") SqlSessionFactory sf) {
        return new SqlSessionTemplate(sf);
    }

    /**
     * OASIS ScriptTask 의 multi-DS 분기 SqlRunner. dataSource 별 SqlSessionTemplate 동적 선택.
     *
     * <p>{@code @ConditionalOnMissingBean(SqlRunner.class)} — 기존 {@code OasisAutoConfiguration.sqlRunner}
     * 와 양립. {@code before = OasisAutoConfiguration.class} 명시로 본 빈이 먼저 등록 →
     * 기존 sqlRunner 의 {@code @ConditionalOnMissingBean} 통과 못해 skip.
     */
    @Bean
    @ConditionalOnMissingBean(SqlRunner.class)
    @ConditionalOnBean(name = "sqlSessionTemplateBiz")
    public SqlRunner cactusMultiMyBatisSqlRunner(
            BeanFactory beanFactory,
            @Qualifier("sqlSessionTemplateBiz") SqlSessionTemplate defaultTemplate) {
        log.info("[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)");
        return new CactusMultiMyBatisSqlRunner(beanFactory, defaultTemplate);
    }

    /**
     * SqlSessionFactoryBean 생성 — film 패턴 그대로 setPlugins 직접 new.
     *
     * <p>3개 SqlSessionFactory (biz/cmn/if) 모두 동일 인터셉터 attach. MyBatis 의 인터셉터 chain 은
     * addInterceptor 호출 역순으로 wrap → 실행 순서:
     * SqlLoggingInterceptor (outer) → CactusMybatisAuditInterceptor (mid) → MasterCodeMybatisInterceptor (inner).
     */
    private SqlSessionFactory build(String alias, DataSource ds, MasterCodeDecoder decoder,
                                     CactusMybatisProperties props, ResourceLoader rl) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(ds);
        bean.setMapperLocations(
                new PathMatchingResourcePatternResolver(rl).getResources(props.getMapperLocations())
        );
        if (props.getConfigLocation() != null && !props.getConfigLocation().isBlank()) {
            bean.setConfigLocation(rl.getResource(props.getConfigLocation()));
        }

        // ── 인터셉터 직접 new + setPlugins (film 패턴) ──
        List<Interceptor> interceptors = new ArrayList<>();
        interceptors.add(new SqlLoggingInterceptor());            // outer (로깅)
        interceptors.add(new CactusMybatisAuditInterceptor());    // mid (감사)
        if (props.getMasterCodeDecoding().isEnabled() && decoder != null) {
            interceptors.add(new MasterCodeMybatisInterceptor(decoder));  // inner (결과 디코딩)
        }
        bean.setPlugins(interceptors.toArray(new Interceptor[0]));

        SqlSessionFactory factory = bean.getObject();
        log.info("[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactory{}' ds='{}' mapperLocations='{}' interceptors={}",
                capitalize(alias),
                describeDataSource(ds),
                props.getMapperLocations(),
                interceptors.stream().map(i -> i.getClass().getSimpleName()).toList());
        return factory;
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String describeDataSource(DataSource ds) {
        return ds.getClass().getSimpleName() + "@" + Integer.toHexString(System.identityHashCode(ds));
    }
}
