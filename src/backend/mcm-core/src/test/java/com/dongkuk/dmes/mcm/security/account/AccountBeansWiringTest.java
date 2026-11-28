/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 생성자가 둘인 빈이 스프링에서 만들어지는지 본다 — 기동 실패("No default constructor found") 재발 방지
 */
package com.dongkuk.dmes.mcm.security.account;

import com.dongkuk.dmes.mcm.repository.SecUserPwdHisRepository;
import com.dongkuk.dmes.mcm.security.password.McmPasswordProperties;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Oracle 없이 빈 컨테이너만 띄운다. 의존 빈은 mock 을 singleton 으로 넣는다(후처리를 거치지 않게).
 */
class AccountBeansWiringTest {

    @Test
    void accountStatusCache_bean_is_created_with_reader_only() {
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext()) {
            ctx.getBeanFactory().registerSingleton("mcmAccountReader", mock(McmAccountReader.class));
            ctx.register(AccountStatusCache.class);
            ctx.refresh();

            AccountStatusCache cache = ctx.getBean(AccountStatusCache.class);
            assertThat(cache).isNotNull();
            // 계정 행이 없으면 끊는다(mock 은 Optional.empty 를 돌려준다)
            assertThat(cache.shouldCut("nobody")).isTrue();
        }
    }

    @Test
    void passwordPolicyEvaluator_bean_uses_history_constructor() {
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext()) {
            ctx.getBeanFactory().registerSingleton("mcmPasswordProperties", new McmPasswordProperties());
            ctx.getBeanFactory().registerSingleton("secUserPwdHisRepository", mock(SecUserPwdHisRepository.class));
            ctx.register(PasswordPolicyEvaluator.class);
            ctx.refresh();

            assertThat(ctx.getBean(PasswordPolicyEvaluator.class)).isNotNull();
        }
    }
}
