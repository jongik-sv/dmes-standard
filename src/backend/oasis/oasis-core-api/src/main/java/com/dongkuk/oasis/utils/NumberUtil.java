package com.dongkuk.oasis.utils;

/**
 * @author Jeongjin Kim
 * @since 2021-06-16
 */
public class NumberUtil {
    /**
     * 문자열을 {@link Integer} 또는 {@link Double} 타입으로 변환한 후 {@link Object}로 반환한다.
     *
     * @param stringNumber 변환할 문자열
     * @return 숫자형 Object
     * @throws NumberFormatException 숫자형으로 변환할 수 없으면 발생
     */
    public static Object parserNumberAsObject(String stringNumber) throws NumberFormatException {
        String trimmedString = StringUtil.removeAllWhiteSpaces(stringNumber);

        if (trimmedString == null || trimmedString.isEmpty())
            throw new NumberFormatException();

        Object number;

        try {
            number = Integer.valueOf(trimmedString);
            return number;
        } catch (NumberFormatException e) {
            //ignore
        }
        try {
            number = Double.valueOf(trimmedString);
            return number;
        } catch (NumberFormatException e) {
            //ignore
        }

        throw new NumberFormatException();
    }

    /**
     * 문자열을 {@link Integer}로 변환하여 반환한다.
     *
     * @param number 변환할 문자열
     * @return Integer
     */
    public static Integer parseInteger(String number) {
        String trimmedString = StringUtil.removeAllWhiteSpaces(number);

        if (trimmedString == null || trimmedString.isEmpty())
            throw new NumberFormatException();

        return Integer.valueOf(trimmedString);
    }

    /**
     * 문자열을 {@link Double}로 변환하여 반환한다.
     *
     * @param number 변환할 문자열
     * @return Double
     */
    public static Double parseDouble(String number) {
        String trimmedString = StringUtil.removeAllWhiteSpaces(number);

        if (trimmedString == null || trimmedString.isEmpty())
            throw new NumberFormatException();

        return Double.valueOf(trimmedString);
    }
}
