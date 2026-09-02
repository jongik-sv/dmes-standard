package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Expression에 존재하는 바인딩 표현식(${KEY})과 {@link ExecutableContext}에 존재하는 값을 매칭하여 반환하는 파서이다.
 * 바인딩 표현식은 복수로 올 수 있고 KEY와 일치하는 값이 {@link ExecutableContext}에 없으면 표현식을 그대로 반환한다.
 * <p>
 * {@link StringTypeExpressionParser#parse(TypedObject, Object...)}의
 * 첫 번째 파라미터는 바인딩 표현식이 포함된 {@link TypedObject}이다.
 * 오브젝트가 {@link String}타입이 아니면
 * {@link StringTypeExpressionParser#canParse(TypedObject, Object...)}는  {@code false}를 반환한다.
 * <p>
 * {@link StringTypeExpressionParser#parse(TypedObject, Object...)}의 두 번째 파라미터는 {@link ExecutableContext}이다.
 * 두 번째 파라미터가 {@link ExecutableContext}가 아니면 {@link StringTypeExpressionParser#canParse(TypedObject, Object...)}
 * 는 {@code false}를 반환한다.
 * 만약 두 번째 파라미터가 없다면 {@link StringTypeExpressionParser#canParse(TypedObject, Object...)}는
 * {@code true}를 반환하고 바인딩 표현식 값을 그대로 반환한다.
 * <p>
 * KEY와 매칭된 값이 {@link TypedObject}내 {@link String}타입이 아니면 바인딩 표현식을 그대로 반환한다.
 *
 * @throws IllegalArgumentException 두 번째 파라미터가 {@link ExecutableContext}가 아닐 경우 발생한다.
 */
class StringTypeExpressionParser implements ExpressionParser<TypedObject, TypedObject> {

    @Override
    public TypedObject parse(TypedObject expression, Object... objects) {
        if (!canParse(expression, objects)) {
            return expression;
        }
        if (objects.length == 0)
            return expression;

        if (!(objects[0] instanceof ExecutableContext)) {
            throw new IllegalArgumentException("ExecutableContext is required");
        }

        ExecutableContext context = (ExecutableContext) objects[0];
        String expressionString = expression.getObject(String.class);

        Pattern r = Pattern.compile("\\$\\{.*?\\}");
        Matcher matcher = r.matcher(expressionString);
        String bindedExpression = expressionString;

        while (matcher.find()) {
            String group = matcher.group(0);
            String key = removePrefixAndSuffix(group);

            TypedObject typedObject = context.get(key);
            if (typedObject == null) {
                continue;
            }

            if (!(typedObject.getObject() instanceof String)) {
                continue;
            }

            String value = typedObject.getObject(String.class);

            bindedExpression = bindedExpression.replace(group, value);
        }

        return new TypedObject(bindedExpression);
    }

    private String removePrefixAndSuffix(String group) {
        String prefix = "$";
        String start = "{";
        String end = "}";
        return group.replace(prefix, "").replace(start, "").replace(end, "");
    }

    @Override
    public boolean canParse(TypedObject expression, Object... objects) {
        if (expression == null || !(expression.getObject() instanceof String)) {
            return false;
        }

        if (objects.length == 0) return true;
        if (!(objects[0] instanceof ExecutableContext)) {
            return false;
        }
        return true;
    }
}
