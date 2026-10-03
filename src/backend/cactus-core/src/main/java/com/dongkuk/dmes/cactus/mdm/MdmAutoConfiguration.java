package com.dongkuk.dmes.cactus.mdm;

import java.lang.management.ManagementFactory;
import java.net.http.HttpClient;
import java.time.Clock;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 업무 모듈 MDM 메타 캐시 자동 설정(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1·§5.2). 기본 꺼짐 —
 * {@code cactus.mdm.enabled=true} 인 업무 모듈만 켠다. MDM 서버는 켜지 않으므로 mdm 의 {@code DefinitionLookup} 빈 0개 가드
 * ({@code MdmBusinessRuleMigrationTest})에 영향이 없다. {@code CacheManager} 를 만들지 않는다.
 *
 * <p>{@code com.dongkuk.dmes.cactus.mdm} 의 빈은 모두 여기서만 만든다(스테레오타입 어노테이션 금지 — 스캔으로 생기지 않게).
 */
@AutoConfiguration
@ConditionalOnClass(RestClient.class)
@ConditionalOnProperty(prefix = "cactus.mdm", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(MdmClientProperties.class)
public class MdmAutoConfiguration {

    /** 연결·읽기 시간 초과와 {@code X-Client-Key} 기본 헤더(MDM 의 ClientKeyFilter — {@link MdmMetaClient} 는 이 헤더를 스스로 넣지 않는다). */
    @Bean
    @ConditionalOnMissingBean
    public MdmMetaClient mdmMetaClient(MdmClientProperties props, Environment env) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(props.getConnectTimeout()).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(props.getReadTimeout());
        RestClient.Builder builder = RestClient.builder().requestFactory(factory);
        if (props.getClientKey() != null && !props.getClientKey().isBlank()) {
            builder.defaultHeader("X-Client-Key", props.getClientKey());
        }
        return new MdmMetaClient(builder.build(), props.getBaseUrl(), module(props, env), props.getSystemCode());
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaCache mdmMetaCache(MdmClientProperties props) {
        return new MdmMetaCache(props.getMaxEntries(), props.getMaxAge(), props.getMaxIdle(), props.getOldVersionMaxIdle(), Clock.systemUTC());
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaService mdmMetaService(MdmMetaClient client, MdmMetaCache cache, MdmClientProperties props) {
        return new MdmMetaService(client, cache, Clock.systemUTC(), props.getVersionedFeed() != MdmClientProperties.VersionedFeed.OFF);
    }

    /** 되돌아보기({@code revision-lookback})를 넘기는 7인자 생성자를 쓴다 — 6인자는 설정을 버리고 기본값을 쓴다. */
    @Bean(initMethod = "start", destroyMethod = "close")
    @ConditionalOnMissingBean
    public MdmRevisionPoller mdmRevisionPoller(MdmMetaClient client, MdmMetaCache cache, MdmMetaService service, MdmClientProperties props) {
        return new MdmRevisionPoller(client, cache, service, Clock.systemUTC(), props.getPollInterval(), props.getPageLimit(),
                props.getRevisionLookback());
    }

    @Bean
    @ConditionalOnMissingBean(DefinitionLookup.class)
    public MdmDefinitionLookup mdmDefinitionLookup(MdmMetaService service) {
        return new MdmDefinitionLookup(service);
    }

    // ── 저장 검증(하위 프로젝트 C spec §6.3) — 검증기만 빈이다. 캐시 전용 엔진(MdmCachedDefinitions 위의 평가기·도메인 검증기·룰 엔진)은 검증기가
    //    스스로 만들고 MdmEvaluator·DomainValidator·RuleEngine 같은 일반 엔진 타입으로 내놓지 않는다. 내놓으면 ① 모듈이 MdmDefinitionLookup 위에
    //    만든 엔진 빈(평가 중 MDM 호출 가능)이 @ConditionalOnMissingBean 으로 검증기 엔진을 대신하거나 ② 업무 코드가 주입받은 엔진이 캐시 전용이라
    //    미리 받지 않은 정의마다 RULE_NOT_FOUND·NOT_DEFINED 로 실패한다(평가 중 MDM 호출 금지 C6·검증 불가 분류 C7 을 빈 배선에 맡기지 않는다).

    /** 마루 데이터 대상 MASTER 는 지원하지 않는다(MasterLookup.NONE, spec §6.4). 비즈니스 함수 공급자가 빈으로 있으면 싣는다. */
    @Bean
    @ConditionalOnMissingBean
    public MdmValidator mdmValidator(MdmMetaService service, ObjectProvider<FunctionProvider> functions, MdmClientProperties props,
                                     Environment env) {
        return new MdmValidator(service, functions.getIfAvailable(() -> FunctionProvider.NONE), props.getValidation().getOnUnavailable(),
                Clock.systemUTC(), module(props, env));
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmMetaController mdmMetaController(MdmClientProperties props, Environment env, MdmMetaService service, MdmMetaCache cache,
                                               MdmRevisionPoller poller) {
        return new MdmMetaController(module(props, env), ManagementFactory.getRuntimeMXBean().getName(), service, cache, poller,
                Clock.systemUTC());
    }

    /** {@code cactus.mdm.module} → {@code cactus.oasis.service-group} → {@code app}. mqc·mpp·mpn 은 service-group 이 없어 module 을 꼭 둔다. */
    static String module(MdmClientProperties props, Environment env) {
        if (props.getModule() != null && !props.getModule().isBlank()) {
            return props.getModule().trim();
        }
        return env.getProperty("cactus.oasis.service-group", "app");
    }
}
