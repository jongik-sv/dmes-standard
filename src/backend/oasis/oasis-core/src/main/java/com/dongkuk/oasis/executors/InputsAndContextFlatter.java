package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.utils.ObjectUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collection;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.utils.ObjectUtil.isDataType;
import static com.dongkuk.oasis.utils.ObjectUtil.isPlainObject;

/**
 * {@code Inputs}의 입력값과 {@code Context}의 값을 1차원 {@link Map}으로 변환하여 반환한다.
 * <p>
 * {@code Inputs}의 길이가 1이고 오브젝트 타입이 {@link Map}이면 엔트리 전체를 최종 반환 {@link Map}에 펼쳐서 반환한다.
 * <p>
 * {@code input}에 {@code PropertyEL}로 정의되어 있으면 {@code Context}에서 {@code Alias}기준으로 컨텍스에서 값을 가져온 뒤 반환한다.
 * 단, 가져온 값이 {@link Map}이면 엔트리 전체를 펼친다. 컬렉션이고 사이즈가 1일 때 첫 번째 행의 타입이 {@link Map}이면 엔트리 전체를 펼친다.
 * 일반 오브젝트인 경우 {@code getter}로 가져올 수 있는 데이터를 모두 가져와 반환한다.
 * <p>
 * {@link com.dongkuk.oasis.context.ServiceContext}의 데이터는 별도 가공하지 않고 그대로 반환한다.
 */
final class InputsAndContextFlatter {
    private static final Logger log = LoggerFactory.getLogger(InputsAndContextFlatter.class);

    // InputKeys 지정한 값의 타입이 Map 이면 Map 요소 전체를 파라미터로 사용한다.
    // List 이면 전채 갯수가 1개이면 리스트에서 값을 꺼내서 변환한다.
    private void addParamFromProcessContext(ExecutableContext executableContext,
                                            Map<String, Object> param,
                                            String inputKey,
                                            String alias,
                                            boolean tryConvertToMap) {

        TypedObject output = executableContext.get(alias);
        if (output == null)
            throw new IllegalStateException(String.format(
                    "No value exists for the input key Input key[%s].", inputKey));

        Object object = output.getObject();
        if (tryConvertToMap) {
            if (object instanceof Map) {
                mapToParam(param, inputKey, (Map<?, ?>) object);
            } else if (object instanceof Collection) {
                if (((Collection<?>) object).size() > 1)
                    throw new IllegalStateException(
                            String.format(
                                    "Cannot perform the conversion when the collection has more than 2 elements. " +
                                            "Input key : [%s]", inputKey));

                for (Object o : ((Collection<?>) object)) {
                    if (o instanceof Map) {
                        mapToParam(param, inputKey, (Map<?, ?>) o);
                    } else if (isPlainObject(o)) {
                        Map<String, Object> stringObjectMap = ObjectUtil.convertObjectToMap(o);
                        mapToParam(param, inputKey, stringObjectMap);
                    } else if (o instanceof Collection) {
                        throw new IllegalStateException(
                                String.format(
                                        "Cannot use a collection type within a collection type as a parameter. " +
                                                "Input key : [%s]", inputKey));
                    } else {
                        param.put(alias, o);
                    }
                }
            } else if (isPlainObject(object)) {
                Map<String, Object> stringObjectMap = ObjectUtil.convertObjectToMap(object);
                mapToParam(param, inputKey, stringObjectMap);
            } else {
                if (param.containsKey(alias)) {
                    log.warn("The key [{}] is ignored because it has been set by another input.", alias);
                } else
                    param.put(alias, object);
            }
        } else { // input key 가 없을 때
            if (param.containsKey(alias)) {
                log.warn("The key [{}] is ignored because it has been set by another input.", alias);
            } else if (isDataType(object))
                param.put(alias, object);
        }
    }

    Map<String, Object> createParameter(Property inputKeysProperty,
                                        InputOutputContainer inputs,
                                        ExecutableContext executableContext) {

        Map<String, Object> param = inputs.exportValues(true);

        List<PropertyExpression> parsedInputKeysProperty = null;

        if (inputKeysProperty != null) {
            parsedInputKeysProperty = PropertyParser.parse(inputKeysProperty);
        }
        ExecutableContext context = new PropertyExpressionAccessibleContext(executableContext, parsedInputKeysProperty);

        // inputKeys에 내열된 프로퍼티 표현식이 있으면 컨텍스트에서 가져와서 표현식 반영 후 파라미터 목록에 모은다.
        if (parsedInputKeysProperty != null && parsedInputKeysProperty.size() > 0) {
            for (PropertyExpression inputKey : parsedInputKeysProperty) {
                addParamFromProcessContext(context,
                        param,
                        inputKey.getValue(String.class),
                        inputKey.getAlias(String.class),
                        true);
            }
        } else {
            for (String inputKey : executableContext.processContext().elementOutputs().keySet()) {
                addParamFromProcessContext(context, param, inputKey, inputKey, false);
            }
        }

        Map<String, TypedObject> serviceInputs = executableContext.serviceContext().serviceInputs();
        for (Map.Entry<String, TypedObject> serviceInput : serviceInputs.entrySet()) {
            // 같은 키로 된 값이 파라미터 목록에 이미 존재하면 무시한다. 즉, ProcessContext 의 값을 더 우선순위가 높다.
            if (param.containsKey(serviceInput.getKey())) {
                log.warn("The key [{}] is set by another input, so the value in the Service Context is disregarded.",
                        serviceInput.getKey());
                continue;
            }

            param.put(serviceInput.getKey(), serviceInput.getValue().getObject());
        }
        return param;
    }

    private void mapToParam(Map<String, Object> param, String inputKey, Map<?, ?> object) {
        for (Map.Entry<?, ?> entry : object.entrySet()) {
            if (entry.getKey() instanceof String) {
                if (param.containsKey(entry.getKey())) {
                    log.warn("The key [{}] is ignored because it's set by another input. Input key : [{}]",
                            entry.getKey(), inputKey);
                    continue;
                }
                param.put((String) entry.getKey(), entry.getValue());
            } else
                throw new IllegalStateException(
                        String.format(
                                "Conversion is not possible because the key type of the Map is not String. " +
                                        "Input Key : [%s]", inputKey));
        }
    }
}
