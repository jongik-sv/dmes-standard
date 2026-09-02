package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.utils.StringUtil;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
class DefaultPropertyValueParser implements PropertyValueParser {
    private final PropertyStateRegistry registry = new StaticPropertyStateRegistry();

    /**
     * @param value 파싱할 프로퍼티 표현식
     * @return 프로퍼티 값
     */
    public List<PropertyExpression> parse(String value) {
        return parseSingleValue(value);
    }

    @SuppressWarnings("ConstantConditions")
    private List<PropertyExpression> parseSingleValue(String propertyExpression) {
        int maxParsingCount = 10000;
        int currentParsingCont = 0;
        if (!StringUtil.hasText(propertyExpression))
            throw new PropertyException("Empty property expression.");

        CharSupplier charSupplier = new CharSupplier(propertyExpression);

        List<PropertyExpression> propertyExpressions = new ArrayList<>();

        LiteralPropertyValue literalPropertyValue = null;

        StringBuilder consumedString = new StringBuilder();

        boolean hasNext = true;

        Class<? extends PropertyState> was = null;
        StateTransitionResult result = new StateTransitionResult(StateExpressionPhaseStart.class);
        PropertyState state;

        while (hasNext) {
            state = registry.getPropertyState(result.getStateClass());
            result = state.next(was, charSupplier, result.getPairChar());
            was = state.getClass();

            PropertyStateEvent[] events = result.getEvents();
            consumedString.append(result.getConsumedChars());

            for (PropertyStateEvent event : events) {
                if (event == PropertyStateEvent.EXPRESSION_START) {
                    literalPropertyValue = new LiteralPropertyValue();
                } else if (event == PropertyStateEvent.VALUE_START) {
                    literalPropertyValue.initValue();
                } else if (event == PropertyStateEvent.VALUE_END) {
                    literalPropertyValue.addValueChar(consumedString.toString());
                    consumedString = new StringBuilder();
                } else if (event == PropertyStateEvent.ACCESSOR_START) {
                    literalPropertyValue.initAccessTokens();
                } else if (event == PropertyStateEvent.ACCESSOR_END) {
                    literalPropertyValue.addAccessToken(consumedString.toString());
                    consumedString = new StringBuilder();
                } else if (event == PropertyStateEvent.ALIAS_START) {
                    literalPropertyValue.initAlias();
                } else if (event == PropertyStateEvent.ALIAS_END) {
                    literalPropertyValue.addAliasChar(consumedString.toString());
                    consumedString = new StringBuilder();
                } else if (event == PropertyStateEvent.EXPRESSION_END) {
                    propertyExpressions.add(literalPropertyValue.buildPropertyValue());
                } else if (event == PropertyStateEvent.EXPRESSION_PHASE_END) {
                    hasNext = false;
                }
            }
            if (maxParsingCount < currentParsingCont)
                throw new PropertyException("Exceeded the maximum allowable execution count.");
            currentParsingCont++;
        }
        return propertyExpressions;
    }
}
