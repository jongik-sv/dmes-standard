package com.dongkuk.oasis.exceptions;

import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-07-06
 */
public class UnexpectedPropertyCharException extends PropertyException {
    private static final long serialVersionUID = -889636926393735962L;

    /**
     * @param c             입력받은 값
     * @param expectedChars 기대하는 값 목록
     */
    public UnexpectedPropertyCharException(String c, List<Character> expectedChars) {
        super(String.format("%s is not the expected value. Expected value : %s", c, expectedChars.toString()));
    }

    /**
     * @param c                  입력받은 값
     * @param expectedCharsClass 기대하는 값
     */
    public UnexpectedPropertyCharException(String c, String expectedCharsClass) {
        super(String.format("%s is not the expected value. Expected value : %s", c, expectedCharsClass));
    }
}
