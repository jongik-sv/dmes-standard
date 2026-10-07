package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.common.audit.McmSqliteMybatisInterceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * mcm 의 MyBatis 보강 — cactus 가 자동 등록하는 SqlSessionFactory(biz·cmn·if)마다 {@link McmSqliteMybatisInterceptor} 를 붙인다.
 *
 * <p>cactus {@code CactusMultiMybatisAutoConfiguration} 은 인터셉터 목록을 코드로 고정해 호스트가 끼울 자리가 없어서,
 * 만들어진 팩토리의 {@code Configuration.addInterceptor} 로 붙인다. 인터셉터는 연결이 SQLite 일 때만 SQL 을 바꾸므로
 * 운영(Oracle·PostgreSQL)에서는 아무 일도 하지 않는다. 설계: docs/superpowers/specs/2026-10-07-query-route-mybatis-design.md §5 D6.
 */
@Configuration
public class McmMybatisConfig {

    @Bean
    static BeanPostProcessor mcmSqliteMybatisInterceptorAttacher() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof SqlSessionFactory factory) {
                    factory.getConfiguration().addInterceptor(new McmSqliteMybatisInterceptor());
                }
                return bean;
            }
        };
    }
}
