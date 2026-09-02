package com.dongkuk.oasis.model;

/**
 * 기본 요소를 표현.
 * <p>
 * 모델의 구성 요소들은 이 인터페이스를 상속해야 함.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface Element {
    /**
     * 요소 식별자.
     * <p>
     * 항상 {@code null} 이 아닌 값을 반환해야 함.
     *
     * @return 요소 식별자
     */
    String getId();

    /**
     * 요소 이름.
     * <p>
     * {@code null} 일 수 있음
     *
     * @return 요소 이름
     */
    String getName();

    /**
     * 속성값을 반환.
     * <p>
     * 이름과 일치하는 속성값이 없으면 {@code null}을 반환
     *
     * @param name 속성명
     * @return 속성값
     */
    Property getProperty(String name);

    /**
     * 속성정보를 반환.
     *
     * @return 속성
     */
    PropertyContainer properties();
}
