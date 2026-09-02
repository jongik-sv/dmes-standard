package com.dongkuk.oasis.utils;

/**
 * @author Jeongjin Kim
 * @since 2021-06-07
 */
public class ArrayUtil {
    /**
     * @param left  비교 대상
     * @param right 비교 대상 목록
     * @param <T>   타입
     * @return 서브셋 여부
     */
    public static <T> boolean isLeftSubsetOfRight(T[] left, T[] right) {
        for (T s : left) {
            boolean r = false;
            for (T s1 : right) {
                if (s.equals(s1)) {
                    r = true;
                    break;
                }
            }
            if (!r)
                return false;
        }
        return true;
    }
}
