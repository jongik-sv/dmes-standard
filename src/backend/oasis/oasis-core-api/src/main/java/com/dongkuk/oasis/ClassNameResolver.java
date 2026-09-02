package com.dongkuk.oasis;

/**
 * 클래스 이름을 결정하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public interface ClassNameResolver {
    /**
     * 클래스 이름을 실제 클래스 이름으로 변환.
     *
     * @param className 변환할 클래스 이름
     * @param params    클래스 결정이 필요한 파라미터
     * @return 전체 경로를 포함한 클래스 이름
     */
    String resolve(String className, Object... params);
}
