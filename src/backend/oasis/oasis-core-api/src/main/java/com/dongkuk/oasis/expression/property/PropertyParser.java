package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.model.Property;

import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-07-08
 */
public class PropertyParser {
    private static final PropertyValueParser propertyValueParser;

    static {
        propertyValueParser = new DefaultPropertyValueParser();
    }

    /**
     * @param value value
     * @return 결과
     */
    public static List<PropertyExpression> parse(String value) {
        return propertyValueParser.parse(value);
    }

    /**
     * @param value value
     * @return 결과
     */
    public static List<PropertyExpression> parse(Property value) {
        return propertyValueParser.parse(value.getValue());
    }
}
