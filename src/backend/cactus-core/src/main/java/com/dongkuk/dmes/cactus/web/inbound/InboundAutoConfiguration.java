package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.mastercode.MasterCodeItemRepository;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import org.apache.ibatis.session.SqlSession;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.webmvc.autoconfigure.WebMvcRegistrations;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Inbound 진입 컨트롤러({@code /oasis}, {@code /query}, {@code /service}, {@code /query/service}, {@code /lov/*}) 자동 설정.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@link OasisController}, {@link ServiceController}, {@link LovController} (OASIS 부분): {@link OasisServiceExecutor} 빈 존재 시</li>
 *   <li>{@link QueryController}, {@link LovController} (mybatis 부분): {@link SqlSession} 빈 존재 시</li>
 * </ul>
 *
 * <p>요청이 고른 BPMN·매퍼 statement 를 실행하는 직접 경로는 스위치로 켠다(기본 꺼짐, 2026-10-07):
 * <ul>
 *   <li>{@code cactus.inbound.service-routes.enabled} — {@code /service}, {@code /query/service}, {@code /lov/service}</li>
 *   <li>{@code cactus.inbound.query-routes.enabled} — {@code /query/{queryId}}, {@code /lov/query/{queryId}}</li>
 * </ul>
 * {@code /oasis/{serviceId}/{action}} 과 {@code /lov/master} 는 스위치와 무관하게 등록된다.
 *
 * <p>cactus-core 자체는 mybatis/oasis-core 를 compileOnly 로 의존하므로, 두 의존이 모두 있을 때만
 * 등록된다. 소비 모듈이 SqlSession 만 가지고 있으면 QueryController 만, OASIS 만 있으면
 * Oasis/ServiceController 만 등록되는 식이다.
 */
@Configuration
public class InboundAutoConfiguration {

    /**
     * Spring Framework 7 의 default {@link RequestMappingHandlerMapping} 은
     * {@code @Controller} 만 핸들러로 인식한다. cactus 의 inbound 컨트롤러는
     * 컴포넌트 스캔 회피를 위해 {@code @Controller} 를 붙이지 않고 클래스 레벨
     * {@code @RequestMapping} 만 사용하므로, Spring 6 까지의 동작 (둘 다 인식)
     * 을 유지하는 {@link CactusRequestMappingHandlerMapping} 으로 교체한다.
     */
    @Bean
    public WebMvcRegistrations cactusWebMvcRegistrations() {
        return new WebMvcRegistrations() {
            @Override
            public RequestMappingHandlerMapping getRequestMappingHandlerMapping() {
                return new CactusRequestMappingHandlerMapping();
            }
        };
    }

    /**
     * OASIS 공통 컨트롤러 ({@code /oasis/{serviceId}/{action}}).
     */
    @Bean
    @ConditionalOnBean(OasisServiceExecutor.class)
    public OasisController cactusOasisController(OasisServiceExecutor executor) {
        return new OasisController(executor);
    }

    /**
     * MyBatis 쿼리 진입 컨트롤러 ({@code /query/{queryId}}, {@code /lov/query/{queryId}}).
     *
     * <p>{@code cactus.inbound.query-routes.enabled=true} 일 때만 등록한다(기본 꺼짐, 2026-10-07 보안 지적).
     * 켜도 {@link QueryStatementGuard} 가 {@code persistence/query/**}·{@code persistence/lov/**} 매퍼의 SELECT 만 열고,
     * 행 수는 {@code cactus.query.max-rows}(기본 10,000)로 자른다. 권한 판정은 BFF·권한 필터 몫이다.
     */
    @Bean
    @ConditionalOnClass(SqlSession.class)
    @ConditionalOnBean(SqlSession.class)
    @ConditionalOnProperty(prefix = "cactus.inbound.query-routes", name = "enabled", havingValue = "true")
    public QueryController cactusQueryController(SqlSession sqlSession,
                                                 @Value("${cactus.query.max-rows:10000}") int maxRows) {
        return new QueryController(new QueryStatementGuard(sqlSession, maxRows));
    }

    /**
     * OASIS service 진입 컨트롤러 (no-action, {@code /service}·{@code /query/service}·{@code /lov/service}).
     *
     * <p>{@code cactus.inbound.service-routes.enabled=true} 일 때만 등록한다(기본 꺼짐, 2026-10-07 보안 지적).
     * 아무 BPMN 이나 고정 action 으로 실행하는 경로라, 켜기 전에 권한 판정이 이 경로의 OBJECT 권한 키를 보도록 해야 한다.
     */
    @Bean
    @ConditionalOnBean(OasisServiceExecutor.class)
    @ConditionalOnProperty(prefix = "cactus.inbound.service-routes", name = "enabled", havingValue = "true")
    public ServiceController cactusServiceController(OasisServiceExecutor executor) {
        return new ServiceController(executor);
    }

    /**
     * 마스터 코드 LoV 컨트롤러 ({@code /lov/master}). 등록 조건은 옛 통합 LoV 컨트롤러와 같다
     * (SqlSession 과 OasisServiceExecutor 가 모두 있는 업무 모듈).
     */
    @Bean
    @ConditionalOnClass(SqlSession.class)
    @ConditionalOnBean({SqlSession.class, OasisServiceExecutor.class})
    public LovController cactusLovController(ObjectProvider<MasterCodeProvider> masterCodeProvider) {
        return new LovController(masterCodeProvider);
    }

    /**
     * 마스터 코드 LoV 기본 Provider. cactus-core 의 {@link MasterCodeItemRepository} 를
     * 통해 {@code TB_SEC_CODE_ITEM} 을 JPA 로 조회.
     *
     * <p>활성 조건: {@link MasterCodeItemRepository} 빈이 있고 (= JPA + cactus-core 의 EntityScan
     * 자동 등록 결과) , 소비 모듈이 자체 {@link MasterCodeProvider} 빈을 등록하지 않은 경우.
     *
     * <p>{@code @ConditionalOnMissingBean(MasterCodeProvider.class)} 로 보호하므로 소비 모듈이
     * 특수한 마스터 코드 소스를 쓰고 싶다면 자체 빈 등록으로 본 기본 구현을 대체할 수 있다.
     *
     * <p>다른 모듈(mpn/mqc/mpp) 은 본 빈을 그대로 활용 — mcm 모듈을 호출하지 않음 (모듈 격리).
     */
    @Bean
    @ConditionalOnBean(MasterCodeItemRepository.class)
    @ConditionalOnMissingBean(MasterCodeProvider.class)
    public MasterCodeProvider cactusDefaultMasterCodeProvider(MasterCodeItemRepository repository) {
        return new DefaultMasterCodeProvider(repository);
    }
}
