package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.TypedObject;

import java.util.List;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.GlobalConstants.UNPACK_KEYWORD;

/**
 * @author Jeongjin Kim
 * @since 2021-07-13
 */
public class PropertyUtil {
    /**
     * @param typedObject 접근할 오브젝트
     * @param accessors   액세서
     * @return 접근한 오브젝트
     */
    public static TypedObject access(TypedObject typedObject, Accessor<?>[] accessors) {
        if (typedObject == null)
            throw new IllegalArgumentException("typedObject is null");

        for (Accessor<?> accessor : accessors) {
            typedObject = accessor.access(typedObject);
        }
        return typedObject;
    }

    /**
     * @param propertyExpressions PropertyExpression 목록
     * @param alias               찾을 별명
     * @return 찾은 PropertyExpression
     */
    public static PropertyExpression findOneByAlias(List<PropertyExpression> propertyExpressions, String alias) {
        return propertyExpressions.stream()
                .filter(pv -> pv.getAlias(String.class).equals(alias))
                .findFirst()
                .orElse(null);
    }

    /**
     * 언팩 키워드로 지정된 표현식 반환.
     *
     * @param propertyExpressions PropertyExpression 목록
     * @return 찾은 PropertyExpression
     */
    public static List<PropertyExpression> findUnpackedAlias(List<PropertyExpression> propertyExpressions) {
        return propertyExpressions.stream()
                .filter(pv -> pv.getAlias(String.class).startsWith(UNPACK_KEYWORD))
                .collect(Collectors.toList());
    }

    /**
     * 언팩 키워드 제거.
     *
     * @param key 키
     * @return 언팩 키워드 제거된 키
     */
    public static String removeUnpackKeyword(String key) {
        if (key.startsWith(UNPACK_KEYWORD))
            return key.substring(UNPACK_KEYWORD.length());
        else
            return key;
    }
}
