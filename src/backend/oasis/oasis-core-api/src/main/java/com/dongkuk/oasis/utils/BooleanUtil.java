package com.dongkuk.oasis.utils;

import com.dongkuk.oasis.exceptions.BooleanFormatException;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
public class BooleanUtil {

    /**
     * 문자열을 {@link Boolean} 타입으로 변환 후 {@link Object}로 박싱하여 반환한다.
     *
     * @param stringBoolean 변환할 문자열
     * @return Boolean 형 Object
     * @throws BooleanFormatException 변환 할 수 없을 때
     */
    public static Object parseBooleanAsObject(String stringBoolean) throws BooleanFormatException {
        String trimmedString = StringUtil.removeAllWhiteSpaces(stringBoolean);

        if (trimmedString.equalsIgnoreCase("true"))
            return Boolean.TRUE;
        else if (trimmedString.equalsIgnoreCase("false"))
            return Boolean.FALSE;
        else
            throw new BooleanFormatException();
    }
}
