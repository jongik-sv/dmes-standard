package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.exceptions.BooleanFormatException;
import com.dongkuk.oasis.exceptions.UnmarshalException;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.utils.BooleanUtil;
import com.dongkuk.oasis.utils.NumberUtil;
import com.dongkuk.oasis.utils.StringUtil;
import org.jdom2.Element;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-04-01
 */
final class CamundaElementUtil {
    public static String extractScript(Element element) {
        Element extensionElements = element
                .getChild("script", element.getNamespace("bpmn"));

        return extensionElements == null ? null : extensionElements.getText();
    }

    /**
     * 요소에서 입력값을 추출하여 반환한다.
     *
     * @param element 추출할 요소
     * @return 입력값
     */
    public static InputOutputContainer extractInputs(Element element) {
        String parameterName = "inputParameter";
        ValueAndOrder<Map<String, TypedObject>, List<String>> data
                = extractInputOutputParameter(element, parameterName);
        return new InputOutputContainer(data.getOrder(), data.getValue());
    }

    /**
     * @param name 판단할 이름
     * @return 액티비티 여부
     */
    public static boolean isActivity(String name) {
        String s = name.toLowerCase();
        return s.contains("task") ||
                s.contains("subprocess") ||
                s.contains("gateway") ||
                s.contains("callactivity") ||
                s.equals("event");
    }

    /**
     * 요소에서 출력값을 추출하여 반환한다.
     *
     * @param element 추출할 요소
     * @return 출력값
     */
    public static InputOutputContainer extractOutputs(Element element) {
        String parameterName = "outputParameter";
        ValueAndOrder<Map<String, TypedObject>, List<String>> mapListTuple
                = extractInputOutputParameter(element, parameterName);
        return new InputOutputContainer(mapListTuple.getOrder(), mapListTuple.getValue());
    }

    public static MultiInstance multiInstance(Element element) {
        return null;
    }

    private static ValueAndOrder<Map<String, TypedObject>, List<String>> extractInputOutputParameter(
            Element element,
            String parameterName) {
        Element extensionElements = element
                .getChild("extensionElements", element.getNamespace("bpmn"));

        List<Element> inputParameterElements;

        if (extensionElements == null) {
            inputParameterElements = new ArrayList<>();
        } else {
            Element inputOutputElement;
            inputOutputElement = extensionElements
                    .getChild("inputOutput", element.getNamespace("camunda"));

            if (inputOutputElement != null) {
                inputParameterElements = inputOutputElement
                        .getChildren(parameterName, element.getNamespace("camunda"));
            } else {
                inputParameterElements = new ArrayList<>();
            }
        }

        Map<String, TypedObject> data = new HashMap<>();
        List<String> nameOrder = new ArrayList<>(inputParameterElements.size());

        for (Element inputParameterElement : inputParameterElements) {
            String inputParameterKey = inputParameterElement.getAttributeValue("name");

            String[] split = inputParameterKey.split(":");
            Class<?> typeHint;
            if (split.length > 1) {
                inputParameterKey = split[0];

                String temp = split[1].toLowerCase();
                switch (temp) {
                    case "string":
                        typeHint = String.class;
                        break;
                    case "int":
                        typeHint = Integer.class;
                        break;
                    case "double":
                        typeHint = Double.class;
                        break;
                    default:
                        throw new IllegalStateException(
                                String.format(
                                        "[%s] is an unsupported input/output type. " +
                                                "Supported types : string, int, double"
                                        , temp));
                }
            } else {
                typeHint = Object.class;
            }

            nameOrder.add(inputParameterKey);
            Element child;

            List<Element> children = inputParameterElement.getChildren();
            if (children.size() == 0) {
                data.put(inputParameterKey,
                        new TypedObject(tryCast(inputParameterElement.getText(), typeHint)));
                continue;
            }

            child = inputParameterElement.getChild("map", element.getNamespace("camunda"));
            if (child != null) {
                if (typeHint == String.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractStringMapElement(child), new TypeReference<Map<String, String>>() {
                            }));
                } else if (typeHint == Integer.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractIntegerMapElement(child), new TypeReference<Map<String, Integer>>() {
                            }));
                } else if (typeHint == Double.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractDoubleMapElement(child), new TypeReference<Map<String, Double>>() {
                            }));
                } else {
                    data.put(inputParameterKey,
                            new TypedObject(extractObjectMapElement(child), new TypeReference<Map<String, Object>>() {
                            }));
                }
                continue;
            }

            child = inputParameterElement.getChild("list", element.getNamespace("camunda"));
            if (child != null) {
                if (typeHint == String.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractStringListElement(child), new TypeReference<List<String>>() {
                            }));
                } else if (typeHint == Integer.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractIntegerListElement(child), new TypeReference<List<Integer>>() {
                            }));
                } else if (typeHint == Double.class) {
                    data.put(inputParameterKey,
                            new TypedObject(extractDoubleListElement(child), new TypeReference<List<Double>>() {
                            }));
                } else {
                    data.put(inputParameterKey,
                            new TypedObject(extractObjectListElement(child), new TypeReference<List<Object>>() {
                            }));
                }
                continue;
            }

            throw new IllegalStateException(
                    String.format("Unsupported [%s] type. [%s]", parameterName, inputParameterKey));
        }
        return new ValueAndOrder<>(data, nameOrder);
    }

    private static List<String> extractStringListElement(Element child) {
        List<String> list = new ArrayList<>();
        List<Element> values = child.getChildren("value", child.getNamespace("camunda"));
        for (Element value : values) {
            String v = value.getText();
            list.add(v);
        }
        return list;
    }

    private static List<Integer> extractIntegerListElement(Element child) {
        List<Integer> list = new ArrayList<>();
        List<Element> values = child.getChildren("value", child.getNamespace("camunda"));
        for (Element value : values) {
            String v = value.getText();
            Integer convertedValue = NumberUtil.parseInteger(v);

            list.add(convertedValue);
        }
        return list;
    }

    private static List<Double> extractDoubleListElement(Element child) {
        List<Double> list = new ArrayList<>();
        List<Element> values = child.getChildren("value", child.getNamespace("camunda"));
        for (Element value : values) {
            String v = value.getText();
            Double convertedValue = NumberUtil.parseDouble(v);

            list.add(convertedValue);
        }
        return list;
    }

    private static List<Object> extractObjectListElement(Element child) {
        List<Object> list = new ArrayList<>();
        List<Element> values = child.getChildren("value", child.getNamespace("camunda"));
        for (Element value : values) {
            String v = value.getText();
            Object convertedValue = tryCast(v);

            list.add(convertedValue);
        }
        return list;
    }

    private static Map<String, String> extractStringMapElement(Element child) {
        Map<String, String> map = new HashMap<>();
        List<Element> entries = child.getChildren("entry", child.getNamespace("camunda"));
        for (Element entry : entries) {
            String key = entry.getAttributeValue("key");
            String value = entry.getText();

            map.put(key, value);
        }
        return map;
    }

    private static Map<String, Integer> extractIntegerMapElement(Element child) {
        Map<String, Integer> map = new HashMap<>();
        List<Element> entries = child.getChildren("entry", child.getNamespace("camunda"));
        for (Element entry : entries) {
            String key = entry.getAttributeValue("key");
            String value = entry.getText();
            Integer convertedValue = NumberUtil.parseInteger(value);

            map.put(key, convertedValue);
        }
        return map;
    }

    private static Map<String, Double> extractDoubleMapElement(Element child) {
        Map<String, Double> map = new HashMap<>();
        List<Element> entries = child.getChildren("entry", child.getNamespace("camunda"));
        for (Element entry : entries) {
            String key = entry.getAttributeValue("key");
            String value = entry.getText();
            Double convertedValue = NumberUtil.parseDouble(value);

            map.put(key, convertedValue);
        }
        return map;
    }

    private static Map<String, Object> extractObjectMapElement(Element child) {
        Map<String, Object> map = new HashMap<>();
        List<Element> entries = child.getChildren("entry", child.getNamespace("camunda"));
        for (Element entry : entries) {
            String key = entry.getAttributeValue("key");
            String value = entry.getText();
            Object convertedValue = tryCast(value);

            map.put(key, convertedValue);
        }
        return map;
    }

    private static Object tryCast(String value) {
        return tryCast(value, Object.class);
    }

    private static Object tryCast(String value, Class<?> clazz) {
        if (clazz != Object.class) {
            return clazz.cast(value);
        }

        Object convertedValue = value;
        try {
            convertedValue = NumberUtil.parserNumberAsObject(value);
            return convertedValue;
        } catch (NumberFormatException e) {
            //ignore
        }

        try {
            convertedValue = BooleanUtil.parseBooleanAsObject(value);
        } catch (BooleanFormatException e) {
            //ignore
        }

        return convertedValue;
    }

    /**
     * 요소에서 프로퍼티를 추출하여 반환한다.
     *
     * @param element 추출할 요소
     * @return 프로퍼티 목록
     */
    public static PropertyContainer extractProperties(Element element) {
        Element extensionElements = element
                .getChild("extensionElements", element.getNamespace("bpmn"));

        List<Element> propertyElements;

        if (extensionElements == null) {
            propertyElements = new ArrayList<>();
        } else {
            Element propertiesElements;
            propertiesElements = extensionElements
                    .getChild("properties", element.getNamespace("camunda"));

            if (propertiesElements != null) {
                propertyElements = propertiesElements
                        .getChildren("property", element.getNamespace("camunda"));
            } else {
                propertyElements = new ArrayList<>();
            }
        }

        PropertyContainer properties = new PropertyContainer();

        for (Element propertyElement : propertyElements) {
            String propertyName = propertyElement.getAttributeValue("name");
            if (!StringUtil.hasText(propertyName)) {
                String id = CamundaAttributeExtractor.id(element);
                String name = CamundaAttributeExtractor.name(element);
                throw new UnmarshalException(String.format("No name in attributes of [%s(%s)]. Check for empty strings."
                        , id
                        , name));
            }
            String propertyValue = propertyElement.getAttributeValue("value");
            properties.add(new Property(propertyName, propertyValue));
        }

        return properties;
    }

    public static MultiInstance extractMultiInstance(Element element) {
        Element extensionElements;
        extensionElements = element.getChild("standardLoopCharacteristics", element.getNamespace("bpmn"));
        if (extensionElements != null)
            return new MultiInstancePropertyHolder(MultiInstanceType.LOOP);

        extensionElements = element.getChild("multiInstanceLoopCharacteristics", element.getNamespace("bpmn"));
        if (extensionElements != null) {
            String collectionName
                    = extensionElements.getAttributeValue("collection", element.getNamespace("camunda"));
            String itemName
                    = extensionElements.getAttributeValue("elementVariable", element.getNamespace("camunda"));

            String isSequential = extensionElements.getAttributeValue("isSequential");
            if (isSequential != null && isSequential.equals("true")) {
                return new MultiInstancePropertyHolder(
                        MultiInstanceType.SEQUENTIAL_MULTI_INSTANCE,
                        collectionName,
                        itemName);
            } else {
                return new MultiInstancePropertyHolder(
                        MultiInstanceType.PARALLEL_MULTI_INSTANCE,
                        collectionName,
                        itemName);
            }
        }

        return new MultiInstancePropertyHolder(MultiInstanceType.NONE);
    }

    static class ValueAndOrder<T, Q> {
        private final T t;
        private final Q q;

        public ValueAndOrder(T t, Q q) {
            this.t = t;
            this.q = q;
        }

        public Q getValue() {
            return q;
        }

        public T getOrder() {
            return t;
        }
    }
}
