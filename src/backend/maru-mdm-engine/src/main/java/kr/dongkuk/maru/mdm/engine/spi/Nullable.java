package kr.dongkuk.maru.mdm.engine.spi;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 이 값은 null 일 수 있다(JSON 에서는 키가 빠지거나 null). 엔진 테스트가 스키마 required·null 허용과 대조한다
 * (TSK-03-01 design D3). 스키마에 대응하는 record 컴포넌트에만 단다.
 *
 * <p>spi 에 두는 이유: 모든 engine 패키지가 spi 를 볼 수 있어 의존 방향(06:463)을 어기지 않는다.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.RECORD_COMPONENT, ElementType.PARAMETER, ElementType.METHOD})
public @interface Nullable {}
