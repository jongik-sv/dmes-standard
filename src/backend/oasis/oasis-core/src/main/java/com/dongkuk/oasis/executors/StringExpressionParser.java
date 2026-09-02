package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;

class StringExpressionParser implements ExpressionParser<TypedObject, TypedObject> {
    @Override
    public TypedObject parse(TypedObject expression, Object... objects) {
        return expression;
    }

    @Override
    public boolean canParse(TypedObject expression, Object... objects) {
        return true;
    }
}
