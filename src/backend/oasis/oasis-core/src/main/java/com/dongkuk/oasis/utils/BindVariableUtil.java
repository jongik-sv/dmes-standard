package com.dongkuk.oasis.utils;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BindVariableUtil {
    //language=RegExp
    static final String DEFAULT_BINDING_VARIABLE_PATTERN = "[#][{][\\s]*([\\w.가-힣]+(\\(\\))?)[\\s]*[}]";
    static final String DEFAULT_BINDING_VARIABLE_PATTERN_PRE = "[#][{][\\s]*";
    static final String DEFAULT_BINDING_VARIABLE_PATTERN_END = "[\\s]*[}]";

    /**
     * @param variable     바인딩 될 문자열ㅕ
     * @param valuesToBind 바인딩 될 값
     * @return 바인딩 결과
     */
    public static String bindVariables(String variable, final Map<String, ?> valuesToBind) {
        if (variable == null)
            throw new IllegalArgumentException("variable is can not be null.");

        if (valuesToBind == null)
            return variable;

        if (!variable.contains("#{"))
            return variable;

        String mappedVariable = variable;

        Set<String> set = new HashSet<>();

        Pattern p = Pattern.compile(DEFAULT_BINDING_VARIABLE_PATTERN);
        Matcher m = p.matcher(variable);

        while (m.find()) {
            String var = m.group(1);
            set.add(var);
        }

        if (set.size() > 0) {
            for (String key : set) {
                String patternString = DEFAULT_BINDING_VARIABLE_PATTERN_PRE +
                        key +
                        DEFAULT_BINDING_VARIABLE_PATTERN_END;

                Pattern var = Pattern.compile(patternString);

                if (var.matcher(variable).find() && valuesToBind.containsKey(key))
                    mappedVariable = mappedVariable.replaceAll(patternString, valuesToBind.get(key).toString());
                else
                    throw new IllegalArgumentException(
                            String.format("Key [%s] does not exist in the context.", key)
                    );
            }
        }

        return mappedVariable;
    }
}
