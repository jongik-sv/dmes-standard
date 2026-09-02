package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;

import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-05-13
 */
class UnmodifiableExecutionResultTest {
    @Test
    void givenListThenUnmodifiableListSet() {
        List<String> list = new ArrayList<>();
        list.add("data1");
        UnmodifiableExecutionResult result = new UnmodifiableExecutionResult(new TypedObject(list, new TypeReference<List<String>>() {
        }));
        ExpressionParser expressionParser = new SpelExpressionParser();
        Expression expression = expressionParser.parseExpression("[0]='newData'");

        Assertions.assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(
                () -> expression.getValue(result.result().getObject())
        );
    }

    @Test
    void givenListMapThenUnmodifiableListMapSet() {
        List<Map<String, Object>> list = new ArrayList<>();
        Map<String, Object> map = new HashMap<>();
        map.put("id", "1234");
        map.put("name", "woo");
        Map<String, Object> map2 = new HashMap<>();
        map2.put("id", "1234");
        map2.put("name", "wha");
        list.add(map);
        list.add(map2);

        UnmodifiableExecutionResult result = new UnmodifiableExecutionResult(new TypedObject(list, new TypeReference<List<Map<String, Object>>>() {
        }));

        ExpressionParser expressionParser = new SpelExpressionParser();
        Expression expression = expressionParser.parseExpression("[0]['id']='3456'");

        Assertions.assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(
                () -> expression.getValue(result.result().getObject())
        );
    }

    @Test
    void givenUnmodifiableListMapThenUnmodifiableListMapSet() {
        List<Map<String, Object>> list = new ArrayList<>();
        Map<String, Object> map = new HashMap<>();
        map.put("id", "1234");
        map.put("name", "woo");
        Map<String, Object> map2 = new HashMap<>();
        map2.put("id", "1234");
        map2.put("name", "wha");
        list.add(map);
        list.add(map2);
        list = Collections.unmodifiableList(list);

        UnmodifiableExecutionResult result = new UnmodifiableExecutionResult(new TypedObject(list, new TypeReference<List<Map<String, Object>>>() {
        }));
        List<Map<String, Object>> object = result.result().getObject(new TypeReference<List<Map<String, Object>>>() {
        });

        Assertions.assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(
                () -> object.get(0).put("id", "1234")
        );
    }
}