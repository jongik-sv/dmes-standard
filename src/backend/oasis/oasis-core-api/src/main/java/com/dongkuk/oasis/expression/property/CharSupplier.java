package com.dongkuk.oasis.expression.property;

import java.text.CharacterIterator;
import java.text.StringCharacterIterator;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
class CharSupplier {
    private final CharacterIterator characterIterator;
    private final int length;
    private int pos = 0;

    CharSupplier(String input) {
        characterIterator = new StringCharacterIterator(input.trim());
        this.length = input.length();
    }

    char next() {
        if (pos == 0) {
            pos++;
            return characterIterator.current();
        } else {
            pos++;
            return characterIterator.next();
        }
    }

    boolean hasNext() {
        return pos < length;
    }
}
