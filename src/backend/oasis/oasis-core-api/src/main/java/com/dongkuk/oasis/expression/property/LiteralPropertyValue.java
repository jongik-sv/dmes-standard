package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.exceptions.PropertyException;

import java.util.ArrayList;
import java.util.List;

class LiteralPropertyValue {
    private List<String> accessTokens = new ArrayList<>();
    private StringBuilder value;
    private StringBuilder alias;

    void addAccessToken(String token) {
        if (this.accessTokens == null)
            throw new PropertyException("AccessToken is not initialized.");
        this.accessTokens.add(token);
    }

    void addValueChar(String c) {
        if (this.value == null)
            throw new PropertyException("Value is not initialized.");
        this.value.append(c);
    }

    void addAliasChar(String c) {
        if (this.alias == null)
            throw new PropertyException("Alias is not initialized.");
        this.alias.append(c);
    }

    void initValue() {
        value = new StringBuilder();
    }

    void initAlias() {
        alias = new StringBuilder();
    }

    void initAccessTokens() {
        accessTokens = accessTokens == null ? new ArrayList<>() : accessTokens;
    }

    PropertyExpression buildPropertyValue() {
        Accessor<?>[] accessors = null;

        if (accessTokens != null) {
            if (accessTokens.size() > 0) {
                accessors = new Accessor[accessTokens.size()];
                for (int i = 0; i < accessors.length; i++) {
                    String accessToken = accessTokens.get(i);
                    try {
                        int index = Integer.parseInt(accessToken);
                        accessors[i] = new IndexAccessor(index);
                    } catch (NumberFormatException e) {
                        accessors[i] = new KeyAccessor(accessToken);
                    }
                }
            }
        }

        return new PropertyExpression(
                value == null ? null : value.toString(),
                accessors,
                alias == null ? null : alias.toString());
    }
}
