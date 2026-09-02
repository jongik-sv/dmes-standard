package com.dongkuk.oasis.expression.property;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
enum CharType {
    LITERAL,
    META_CHARACTER,
    ACCESSOR_START,
    ACCESSOR_END,
    SINGLE_QUO_KEY,
    DOUBLE_QUO_KEY,
    NUMBER,
    ESCAPE,
    EOL,
    SPACE,
    EXPRESSION_SPLITTER,
    ALIAS_START,
    ALIAS_END;

    /**
     * @param c c
     * @return CharType
     */
    static CharType charType(char c) {
        if (Character.isDigit(c))
            return NUMBER;
        else if (Character.isWhitespace(c))
            return SPACE;
        else if (c == '\\')
            return ESCAPE;
        else if (c == '\'')
            return SINGLE_QUO_KEY;
        else if (c == '\"')
            return DOUBLE_QUO_KEY;
        else if (c == '[')
            return ACCESSOR_START;
        else if (c == ']')
            return ACCESSOR_END;
        else if (c == Character.MAX_VALUE)
            return EOL;
        else if (c == ',')
            return EXPRESSION_SPLITTER;
        else if (c == '-')
            return ALIAS_START;
        else if (c == '>')
            return ALIAS_END;
        else
            return LITERAL;
    }

    static boolean isMetaChar(CharType charType) {
        return charType == ESCAPE ||
                charType == SINGLE_QUO_KEY ||
                charType == DOUBLE_QUO_KEY ||
                charType == ACCESSOR_START ||
                charType == EXPRESSION_SPLITTER ||
                charType == ACCESSOR_END ||
                charType == ALIAS_START ||
                charType == ALIAS_END;
    }

    /**
     * @param c c
     * @return CharType
     */
    static String charPresentingName(char c) {
        if (charType(c) == EOL) {
            return "EOL";
        } else if (charType(c) == SPACE) {
            return "SPACE";
        } else return new String(new char[]{c});
    }
}
