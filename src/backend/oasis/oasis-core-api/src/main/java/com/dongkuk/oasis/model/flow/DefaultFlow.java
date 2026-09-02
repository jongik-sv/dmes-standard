package com.dongkuk.oasis.model.flow;

/**
 * 다른 Flow 를 선택하지 못 했을 때 선택하는 Flow 인터페이스.
 * <p>
 * 항상 참인 표현식을 반환하는 특수 형태 Conditional 이다.
 * <p>
 * Conditional Flow 와 조합하여 사용해야한다.
 *
 * @author Jeongjin Kim
 * @since 2021-01-31
 */
public interface DefaultFlow extends Flow {
}
