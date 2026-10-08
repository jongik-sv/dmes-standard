package com.dongkuk.dmes.analog.db;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * {@code analog.db.url} 이 비어 있지 않을 때만 DB 뷰어 데이터소스를 활성화한다.
 * yml 기본값이 빈 문자열이므로 {@code @ConditionalOnProperty} 로는 미설정을 구분할 수 없다 (D5).
 */
public class DbViewerEnabledCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String url = context.getEnvironment().getProperty("analog.db.url");
        return StringUtils.hasText(url);
    }
}
