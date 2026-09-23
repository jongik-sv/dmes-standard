package kr.dongkuk.maru.mdm.engine.spi;

import java.util.List;

/**
 * 비즈니스 함수 공급 — 별도 jar {@code maru-mdm-functions} 가 구현한다(06-business-rule.md:445).
 * 엔진은 이 목록을 {@code engine.expr} 에서 EvalEx 함수로 감싸 비즈니스 칸용 집합에 합친다.
 *
 * <p>시그니처에 EvalEx 타입을 쓰지 않는다(06:461). 그래서 지연 평가(IF 같은 lazy 인자)는 받지 않고,
 * 인자는 평가된 값({@code java.math.BigDecimal}·{@link String}·{@link Boolean}·null)으로만 넘어온다.
 * 시각·난수·로캘·환경을 읽는 구현은 금지다(02:326 결정성 — 구현 jar 의 책임).
 */
public interface FunctionProvider {

    List<BusinessFunction> functions();

    /**
     * @param name     {@code [A-Z][A-Z0-9_]*}, 표준 함수·MDM 조회 함수 이름과 겹치면 엔진이 적재를 거부한다
     * @param params   고정 인자. {@code nullable=false} 인 인자에 NULL 이 오면 엔진이 함수를 부르지 않고 평가 오류를 낸다.
     *                 입력 계약의 필수·선택 판정(06:208)이 이 표지를 쓴다
     * @param varArgs  마지막 인자가 가변인가
     */
    record BusinessFunction(String name, List<Param> params, boolean varArgs, Body body) {}

    record Param(String name, boolean nullable) {}

    /** 인자·반환은 BigDecimal·String·Boolean·null 만. 예외는 판정 오류(평가 오류)로 올라간다. */
    @FunctionalInterface
    interface Body {
        Object apply(List<Object> args);
    }

    /** 비즈니스 함수가 없는 호출자용. */
    FunctionProvider NONE = List::of;
}
