package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.methodinvoker.ObjectFactory;

import java.util.Map;

class TypeExpressionParser implements ExpressionParser<TypedObject, TypedObject> {
    private final ObjectFactory objectFactory;
    String prefix = "$";
    String separator = "type";
    String start = "{";
    String end = "}";

    /**
     * {@link TypeExpressionParser} 생성자.
     *
     * @param objectFactory Not Null
     */
    public TypeExpressionParser(ObjectFactory objectFactory) {
        this.objectFactory = objectFactory;
    }

    private MethodInvokerContext getMethodInvokerContext(ExecutableContext executableContext
            , Map<String, TypedObject> inputs) {
        return new MethodInvokerContext(executableContext
                , inputs
                , PropertyParser.parse(new Property("new", "true"))
                , false);
    }

    @Override
    public TypedObject parse(TypedObject expression, Object... objects) {
        MethodInvokerContext methodInvokerContext =
                getMethodInvokerContext((ExecutableContext) objects[0],
                        (Map<String, TypedObject>) objects[1]);
        Object object = objectFactory.createObject(getClassPath(expression), methodInvokerContext);
        try {
            return new TypedObject(object, Class.forName(getClassPath(expression)));
        } catch (ClassNotFoundException e) {
            throw new RuntimeException(e);
        }
    }

    private void throwException(TypedObject expression) {
        String message = "Incorrect format of expression..." +
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
        if (expStr == null) return false;
        return expStr.startsWith(prefix + separator + start) && expStr.endsWith(end);
    }
}
