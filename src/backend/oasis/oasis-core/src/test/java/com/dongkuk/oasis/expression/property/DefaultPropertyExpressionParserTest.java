package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.PropertyException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
class DefaultPropertyExpressionParserTest {
    PropertyValueParser propertyValueParser = new DefaultPropertyValueParser();

    @Test
    void justValue() {
        String propertyString = "abc";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("abc");
        assertThat(parse[0].getAccessors()).hasSize(0);
    }

    @Test
    void aliasOnly() {
        String propertyString = "abc -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(0);
    }

    @Test
    void singleIndexAccessorWithoutAlias() {
        String propertyString = "abc[0]";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("abc");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(IndexAccessor.class);
    }

    @Test
    void singleIndexAccessorWithAlias() {
        String propertyString = "abc[0] -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(IndexAccessor.class);
    }

    @Test
    void singleKeyAccessorWithoutAlias() {
        String propertyString = "abc['key']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("abc");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void singleDoubleQuotationKeyAccessorWithoutAlias() {
        String propertyString = "abc[\"key\"]";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("abc");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void singleKeyAccessorWithAlias() {
        String propertyString = "abc['key'] -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void singleKeyAccessorWithAliasAndWhiteSpaces() {
        String propertyString = "  abc  [  'key'   ]    ->   ddd  ";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(1);
        Object accessor = parse[0].getAccessors()[0];
        assertThat(accessor).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void multiKeyAccessorWithAliasAndWhiteSpaces() {
        String propertyString = "abc  [ 'key']  [0]  -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(2);
        Object accessor1 = parse[0].getAccessors()[0];
        assertThat(accessor1).isInstanceOf(KeyAccessor.class);
        Object accessor2 = parse[0].getAccessors()[1];
        assertThat(accessor2).isInstanceOf(IndexAccessor.class);
    }

    @Test
    void singleKeyAndIndexAccessorWithAlias() {
        String propertyString = "abc['key'][0] -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(2);
        Object accessor1 = parse[0].getAccessors()[0];
        assertThat(accessor1).isInstanceOf(KeyAccessor.class);
        Object accessor2 = parse[0].getAccessors()[1];
        assertThat(accessor2).isInstanceOf(IndexAccessor.class);
    }

    @Test
    void singleIndexAndKeyAccessorWithAlias() {
        String propertyString = "abc[0]['key'] -> ddd";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd");
        assertThat(parse[0].getAccessors()).hasSize(2);
        Object accessor1 = parse[0].getAccessors()[0];
        assertThat(accessor1).isInstanceOf(IndexAccessor.class);
        Object accessor2 = parse[0].getAccessors()[1];
        assertThat(accessor2).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void multiIndexAndKeyAccessorWithAlias() {
        String propertyString = "abc[0]['key'] -> ddd1, abc[1]['key'] -> ddd2";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(2);
        assertThat(parse[0].getValue()).isEqualTo("abc");
        assertThat(parse[0].getAlias()).isEqualTo("ddd1");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);

        assertThat(parse[1].getValue()).isEqualTo("abc");
        assertThat(parse[1].getAlias()).isEqualTo("ddd2");
        assertThat(parse[1].getAccessors()).hasSize(2);
        assertThat(parse[1].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[1].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void givenNoIndexOrKeyThenException() {
        String propertyString = "abc[]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("] is not the expected value. Expected value : SPACE, NUMBER, ', \"");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "abc->ff",
            "abc ->ff",
            "abc-> ff",
            "abc -> ff",
            "abc ->         ff",
            "abc         ->         ff",
            "abc    ->     ff",
    })
    void givenValueAndAliasVariousCases(String propertyString) {
        List<PropertyExpression> parse = propertyValueParser.parse(propertyString);
        PropertyExpression propertyExpression = parse.get(0);
        assertThat(propertyExpression.getValue()).isEqualTo("abc");
        assertThat(propertyExpression.getAlias()).isEqualTo("ff");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "abc[0]->ff",
            "abc[0]-> ff",
            "abc[0]   ->ff",
            "abc[0]   ->  ff",
            "abc [0]   ->  ff",
            "abc    [0]   ->  ff",
            "abc    [ 0]   ->  ff",
            "abc    [ 0   ]   ->  ff",
            "abc    [   0   ]   ->  ff",
            "abc[0] -> ff"
    })
    void givenValueAndIndexAccessorAndAliasVariousCases(String propertyString) {
        List<PropertyExpression> parse = propertyValueParser.parse(propertyString);
        PropertyExpression propertyExpression = parse.get(0);
        assertThat(propertyExpression.getValue()).isEqualTo("abc");
        assertThat(propertyExpression.getAlias()).isEqualTo("ff");
        assertThat(propertyExpression.getAccessors()).hasSize(1);
        assertThat(propertyExpression.getAccessors()[0]).isInstanceOf(IndexAccessor.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "abc['a']->ff",
            "abc['a']-> ff",
            "abc['a']   ->ff",
            "abc['a']   ->  ff",
            "abc ['a']   ->  ff",
            "abc    ['a']   ->  ff",
            "abc    [ 'a']   ->  ff",
            "abc    [ 'a'   ]   ->  ff",
            "abc    [   'a'   ]   ->  ff",
            "abc['a'] -> ff"
    })
    void givenValueAndKeyAccessorAndAliasVariousCases(String propertyString) {
        List<PropertyExpression> parse = propertyValueParser.parse(propertyString);
        PropertyExpression propertyExpression = parse.get(0);
        assertThat(propertyExpression.getValue()).isEqualTo("abc");
        assertThat(propertyExpression.getAlias()).isEqualTo("ff");
        assertThat(propertyExpression.getAccessors()).hasSize(1);
        assertThat(propertyExpression.getAccessors()[0]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void givenOpenAccessTokenThenException() {
        String propertyString = "abc[";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("EOL is not the expected value. Expected value : SPACE, NUMBER, ', \"");

    }

    @Test
    void givenIllegalStartAccessTokenThenException() {
        String propertyString = "abc]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("] is not the expected value. Expected value : LITERAL, NUMBER, SPACE, ,, [, \\, -, EOL");
    }

    @Test
    void givenSpaceBetweenAliasCharacters() {
        String propertyString = "abc[0]- >ff";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("SPACE is not the expected value. Expected value : >");
    }

    @Test
    void givenValueWithDash() {
        String propertyString = "ab\\-c";
        List<PropertyExpression> parse = propertyValueParser.parse(propertyString);
        PropertyExpression propertyExpression = parse.get(0);
        assertThat(propertyExpression.getValue()).isEqualTo("ab-c");
    }

    @Test
    void givenValueWithGraterThen() {
        String propertyString = "ab\\>c";
        List<PropertyExpression> parse = propertyValueParser.parse(propertyString);
        PropertyExpression propertyExpression = parse.get(0);
        assertThat(propertyExpression.getValue()).isEqualTo("ab>c");
    }

    @Test
    void givenValueDashWithoutEscapeThenException() {
        String propertyString = "ab-c";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("c is not the expected value. Expected value : >");
    }

    @Test
    void givenValueGraterThenWithoutEscapeThenException() {
        String propertyString = "ab>c";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("> is not the expected value. Expected value : LITERAL, NUMBER, SPACE, ,, [, \\, -, EOL");
    }

    @Test
    void givenStartWithAccessTokenThenException() {
        String propertyString = "[abc]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("a is not the expected value. Expected value : SPACE, NUMBER, ', \"");
    }

    @Test
    void givenStartWithAliasTokenThenException() {
        String propertyString = "-> ff";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("- is not the expected value. Expected value : SPACE, \\, [, LITERAL, NUMBER");
    }

    @Test
    void givenEndWithAliasTokenThenException() {
        String propertyString = "aa ->";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("EOL is not the expected value. Expected value : SPACE, LITERAL");
    }

    @Test
    void givenAliasTokenWithAccessTokenThenException() {
        String propertyString = "aa -> ff[0]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("[ is not the expected value. Expected value : SPACE, LITERAL, EOL, ,, \\");
    }

    @Test
    void givenKeyWithoutQuotationThenException() {
        String propertyString = "aa[*fff*]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("* is not the expected value. Expected value : SPACE, NUMBER, ', \"");
    }

    @Test
    void givenKeyQuotationButNotCorrespondingThenException() {
        String propertyString = "aa['fff\"]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("\" is not the expected value. Expected value : ', LITERAL, NUMBER, SPACE");
    }

    @Test
    void givenKeyQuotationButNotCorrespondingThenException2() {
        String propertyString = "aa[\"fff']";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("' is not the expected value. Expected value : ', LITERAL, NUMBER, SPACE");
    }

    @Test
    void givenKeyWithoutQuotationTokenThenException() {
        String propertyString = "aa[fff]";
        assertThatExceptionOfType(PropertyException.class).isThrownBy(() ->
                propertyValueParser.parse(propertyString))
                .withMessage("f is not the expected value. Expected value : SPACE, NUMBER, ', \"");
    }

    @Test
    void givenValueAndAliasStartWithNumber() {
        String propertyString = "1abc[0]['key'] -> 1ddd1";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("1abc");
        assertThat(parse[0].getAlias()).isEqualTo("1ddd1");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void onlyAccessor() {
        String propertyString = "[0]['key']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isNull();
        assertThat(parse[0].getAlias()).isNull();
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void startWithAccessorAndAlias() {
        String propertyString = "[0]['key'] -> foo";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isNull();
        assertThat(parse[0].getAlias()).isEqualTo("foo");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void valueAndAccessorWithoutAlias() {
        String propertyString = "foo[0]['key']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("foo");
        assertThat(parse[0].getAlias()).isEqualTo("foo");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
    }

    @Test
    void manyAccessors() {
        String propertyString = "foo[0]['key'][0]['key'][0]['key'][0]['key'][0]['key'][0]['key'][0]['key']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("foo");
        assertThat(parse[0].getAlias()).isEqualTo("foo");
        assertThat(parse[0].getAccessors()).hasSize(14);
    }

    @Test
    void keyAccessorIncludingSpace() {
        String propertyString = "foo[0]['key key']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("foo");
        assertThat(parse[0].getAlias()).isEqualTo("foo");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
        assertThat(parse[0].getAccessors()[1].getAccessor()).isEqualTo("key key");
    }

    @Test
    void keyAccessorIncludingMetaCharacters() {
        String propertyString = "foo[0]['f\\[f']";
        PropertyExpression[] parse = propertyValueParser.parse(propertyString).toArray(new PropertyExpression[0]);

        assertThat(parse).hasSize(1);
        assertThat(parse[0].getValue()).isEqualTo("foo");
        assertThat(parse[0].getAlias()).isEqualTo("foo");
        assertThat(parse[0].getAccessors()).hasSize(2);
        assertThat(parse[0].getAccessors()[0]).isInstanceOf(IndexAccessor.class);
        assertThat(parse[0].getAccessors()[1]).isInstanceOf(KeyAccessor.class);
        System.out.println(parse[0].getAccessors()[1].getAccessor());
//        assertThat(parse[0].getAccessors()[1].getAccessor()).isEqualTo("ff'\"[']");
    }
}