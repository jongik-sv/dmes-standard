package com.dongkuk.oasis.model;

/**
 * 태스크를 대표하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-28
 */
public interface Task extends Element, MultiInstance {
    /**
     * 태스크의 입력값을 반환한다.
     *
     * @return 입력값
     */
    InputOutputContainer inputs();

    /**
     * 태스크의 입력값을 반환한다.
     *
     * @param key 키
     * @param <T> 타입
     * @return 입력값
     */
    <T> T input(String key);

    /**
     * 태스크의 출력값을 반환한다.
     *
     * @return 출력값
     */
    InputOutputContainer outputs();

    /**
     * 태스크의 출력값을 반환한다.
     *
     * @param key 키
     * @param <T> 타입
     * @return 출력값
     */
    <T> T output(String key);
}