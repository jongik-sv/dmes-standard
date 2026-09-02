package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;

/**
 * Test에서 ServiceContext에 Object를 등록했을 때 파서에서 별도로 객체를 생성하지 않고 등록된 객체를 대신 사용한다.
 */
class TypeExpressionParserForTest implements ExpressionParser<TypedObject, TypedObject> {
    private final static String prefix = "$";
    private final static String separator = "type";
    private final static String start = "{";
    private final static String end = "}";

    @Override
    public TypedObject parse(TypedObject expression, Object... objects) {
        if (expression == null || !(expression.getObject() instanceof String))
            throw new IllegalArgumentException("expression is null");

        String expStr = expression.getObject(String.class);
        if (expStr == null)
            throw new IllegalArgumentException("expression is null");

        if (!expStr.startsWith(prefix + separator + start) && expStr.endsWith(end))
            throw new IllegalArgumentException("Not type expression.");

        if (!(objects[0] instanceof ExecutableContext))
            throw new IllegalArgumentException("Parameter is not instance of " + ExecutableContext.class.getName());

        ExecutableContext executableContext = (ExecutableContext) objects[0];
        Object o = extractObjectFromServiceContext(expression, executableContext);
        if (o == null)
            throw new IllegalArgumentException("Object not exists in the ServiceContext.");

        return new TypedObject(o);
    }

    private void throwException(TypedObject expression) {
        String message = "Incorrect format of expression.." +
                "\n input : " + expression.getObject(String.class) +
                "\n ex) " + prefix + separator + start + " class url " + end;
        throw new IllegalArgumentException(message);
    }

    private String getClassPath(TypedObject expression) {
        String expressionStr = expression.getObject(String.class);
        return expressionStr.substring(getContentsStartIndex(expressionStr), expressionStr.indexOf(end));
    }

    private int getContentsStartIndex(String expression) {
        String fullPrefix = prefix + separator + start;
        return expression.indexOf(fullPrefix) + fullPrefix.length();
    }

    @Override
    public boolean canParse(TypedObject expression, Object... objects) {
        if (expression == null || !(expression.getObject() instanceof String)) {
            return false;
        }

        String expStr = expression.getObject(String.class);
        if (expStr == null)
            return false;

        if (!(expStr.startsWith(prefix + separator + start) && expStr.endsWith(end)))
            return false;

        if (!(objects[0] instanceof ExecutableContext))
            return false;

        ExecutableContext executableContext = (ExecutableContext) objects[0];
        Object o = extractObjectFromServiceContext(expression, executableContext);
        return o != null;
    }

    private Object extractObjectFromServiceContext(TypedObject expression, ExecutableContext executableContext) {
        Class<?> aClass;
        try {
            aClass = Class.forName(getClassPath(expression));
        } catch (ClassNotFoundException e) {
            return false;
        }
        return executableContext.serviceContext().getObject(aClass);
    }
}
