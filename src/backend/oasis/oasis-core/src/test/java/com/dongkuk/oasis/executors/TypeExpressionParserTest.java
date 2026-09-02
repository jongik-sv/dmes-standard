package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TypeExpressionParserTest {
    private final StrictMethodInvoker methodInvoker = new StrictMethodInvoker();
    private final ExecutableContext executableContext = Mockito.mock(ExecutableContext.class);
    Map<String, TypedObject> inputs = new HashMap<>();
    TypeExpressionParser parser = new TypeExpressionParser(methodInvoker.objectFactory());

    @Test
    @DisplayName("입력값 Null일 때 canParse 테스트 -> return False")
    void canParseWhenInputNull() {
        assertFalse(parser.canParse(new TypedObject(null, String.class)));
    }

    @Test
    @DisplayName("입력값 빈값일 때 canParse 테스트 -> return False")
    void canParseWhenInputBalnk() {
        assertFalse(parser.canParse(new TypedObject("")));
    }

    @Test
    @DisplayName("입력값 공백일 때 canParse 테스트 -> return False")
    void canParseWhenInputWhiteSpace() {
        assertFalse(parser.canParse(new TypedObject(" ")));
    }

    @Test
    @DisplayName("입력값 표현식 아닐 때 canParse 테스트 -> return False")
    void canParseWhenInputNotExpression() {
        assertFalse(parser.canParse(new TypedObject("test")));
    }

    @Test
    @DisplayName("입력값 표현식일 때 canParse 테스트 -> return True")
    void canParseWhenInputExpression() {
        assertTrue(parser.canParse(new TypedObject("$type{com.dongkuk.oasis.executors.NickName}")));
    }

    @Test
    @DisplayName("입력값 잘못된 표현식일 때 canParse 테스트 -> return False")
    void canParseWhenInputIllegalExpression() {
        assertFalse(parser.canParse(new TypedObject("type{com.dongkuk.oasis.executors.NickName}")));
        assertFalse(parser.canParse(new TypedObject("${com.dongkuk.oasis.executors.NickName}")));
        assertFalse(parser.canParse(new TypedObject("$typecom.dongkuk.oasis.executors.NickName}")));
        assertFalse(parser.canParse(new TypedObject("$type{com.dongkuk.oasis.executors.NickName")));
    }

    @Test
    @DisplayName("입력값 표현식일 때 parse 테스트")
    void parseWhenInputExpression() {
        //given
        TypedObject expression = new TypedObject("$type{com.dongkuk.oasis.executors.NickName}");

        //when
        NickName nickName = parser.parse(expression, executableContext, inputs).getObject(NickName.class);
        String actual = nickName.getName();

        //then
        assertEquals("default", actual);
    }
}