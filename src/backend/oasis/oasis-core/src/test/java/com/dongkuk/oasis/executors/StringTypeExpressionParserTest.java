package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;

import static org.mockito.BDDMockito.given;

class StringTypeExpressionParserTest {
    @Test
    void ifValueOfKeyInContextIsNotStringTypeThenReturnExpressionWithoutChange() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        TypedObject expression = new TypedObject("Hello, ${name}!");
        ExecutableContext executableContext = Mockito.mock(ExecutableContext.class);
        given(executableContext.get("name")).willReturn(new TypedObject(1));

        TypedObject result = stringTypeExpressionParser.parse(expression, executableContext);

        Assertions.assertThat(result.getObject()).isEqualTo(expression.getObject());
    }

    @Test
    void ifExpressionIsNotStringTypeThenCanNotParse() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        TypedObject expression = new TypedObject(1);

        Assertions.assertThat(stringTypeExpressionParser.canParse(expression)).isFalse();
    }

    @Test
    void secondParameterIsNotExecutableContextThenCanNotParse() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        TypedObject expression = new TypedObject("Hello, ${name}!");

        Assertions.assertThat(stringTypeExpressionParser.canParse(expression, "Hello, ${name}!")).isFalse();
    }

    @Test
    void ifNoSecondParameterThenCanParse() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        TypedObject expression = new TypedObject("Hello, ${name}!");

        Assertions.assertThat(stringTypeExpressionParser.canParse(expression)).isTrue();
    }

    @Test
    void ifNoSecondParameterThenReturnExpressionWithoutChange() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        TypedObject expression = new TypedObject("Hello, ${name}!");
        TypedObject parse = stringTypeExpressionParser.parse(expression);
        Assertions.assertThat(parse.getObject().toString()).isEqualTo("Hello, ${name}!");
    }

    @Test
    void bindContextValueAndStringTypeExpression() {
        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        String expression = "Hello, ${name}!";

        ExecutableContext executableContext = Mockito.mock(ExecutableContext.class);
        given(executableContext.get(Mockito.anyString())).willReturn(new TypedObject("World"));

        TypedObject result = stringTypeExpressionParser.parse(new TypedObject(expression), executableContext);
        Assertions.assertThat(result.getObject(String.class)).isEqualTo("Hello, World!");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Hello ${name}!,true",
            "Hello2 ${name}!,true",
            "Hello2 ${name} ${name2}!,true",
            "Hello,true",
    })
    void canParse(String source) {
        String expression = source.split(",")[0];
        boolean expected = Boolean.parseBoolean(source.split(",")[1]);

        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();
        ExecutableContext executableContext = Mockito.mock(ExecutableContext.class);

        Assertions.assertThat(stringTypeExpressionParser.canParse(new TypedObject(expression), executableContext))
                .isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {
//            "${name}${name},WorldWorld",
//            "Hello2 ${name}!,Hello2 World!",
            "Hello2 ${name} ${name2}!,Hello2 World ${name2}!",
//            "Hello2 ${name} ${data}!,Hello2 World New!",
    })
    void multipleBidingExpression(String source) {
        String expression = source.split(",")[0];
        String expected = source.split(",")[1];

        StringTypeExpressionParser stringTypeExpressionParser = new StringTypeExpressionParser();

        ExecutableContext executableContext = Mockito.mock(ExecutableContext.class);
        given(executableContext.get("name")).willReturn(new TypedObject("World"));
        given(executableContext.get("data")).willReturn(new TypedObject("New"));

        TypedObject result = stringTypeExpressionParser.parse(new TypedObject(expression), executableContext);
        Assertions.assertThat(result.getObject(String.class)).isEqualTo(expected);
    }
}