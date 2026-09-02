package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.model.Property;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.dongkuk.oasis.GlobalConstants.UNPACK_KEYWORD;
import static org.assertj.core.api.Assertions.assertThat;

class PropertyUtilTest {
    @Test
    void findAllUnpackedProperties() {
        Property input = new Property("input", "data->" + UNPACK_KEYWORD + "data");
        List<PropertyExpression> parse = PropertyParser.parse(input);
        List<PropertyExpression> unpackedAlias = PropertyUtil.findUnpackedAlias(parse);
        assertThat(unpackedAlias).hasSize(1);
    }

    @Test
    void findEmptyListWhenNoUnpackedPropertiesProvided() {
        Property input = new Property("input", "data->data");
        List<PropertyExpression> parse = PropertyParser.parse(input);
        List<PropertyExpression> unpackedAlias = PropertyUtil.findUnpackedAlias(parse);
        assertThat(unpackedAlias).hasSize(0);
    }
}