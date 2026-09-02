package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.mastercode.MasterCodeItemRepository;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import org.apache.ibatis.session.SqlSession;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
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
     * MyBatis 쿼리 진입 컨트롤러.
     */
    @Bean
    @ConditionalOnClass(SqlSession.class)
    @ConditionalOnBean(SqlSession.class)
    public QueryController cactusQueryController(SqlSession sqlSession) {
        return new QueryController(sqlSession);
    }

    /**
     * OASIS service 진입 컨트롤러 (no-action).
     */
    @Bean
    @ConditionalOnBean(OasisServiceExecutor.class)
    public ServiceController cactusServiceController(OasisServiceExecutor executor) {
        return new ServiceController(executor);
    }

    /**
     * LoV 통합 컨트롤러. SqlSession 과 OasisServiceExecutor 가 모두 있어야 등록.
     * (둘 중 하나만 있어도 부분 동작이 가능하나, 단일 컨트롤러 분기 단순화를 위해 둘 다 요구)
     */
    @Bean
    @ConditionalOnClass(SqlSession.class)
    @ConditionalOnBean({SqlSession.class, OasisServiceExecutor.class})
    public LovController cactusLovController(SqlSession sqlSession,
                                             OasisServiceExecutor executor,
                                             ObjectProvider<MasterCodeProvider> masterCodeProvider) {
        return new LovController(sqlSession, executor, masterCodeProvider);
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
