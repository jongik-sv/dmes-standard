package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.exceptions.UnmarshalException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Objects;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public final class ClasspathFileToString implements FileToString {
    @Override
    public String getString(String path, String charsetName) {
        if (path == null)
            throw new IllegalArgumentException("path can not be null.");

        StringBuilder stringBuilder = new StringBuilder();
        String line;

        try (BufferedReader bufferedReader = new BufferedReader(
                new InputStreamReader(
                        Objects.requireNonNull(getClass().getResourceAsStream(path)),
                        charsetName))) {
            while ((line = bufferedReader.readLine()) != null) {
                stringBuilder.append(line);
            }
        } catch (IOException e) {
            throw new UnmarshalException(e);
        }

        return stringBuilder.toString();
    }
}
