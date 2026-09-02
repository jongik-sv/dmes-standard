package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.StringExpressionCondition;
import com.dongkuk.oasis.model.flow.*;
import com.dongkuk.oasis.model.flow.nodes.FlowNameConditionalFlowPicker;
import com.dongkuk.oasis.model.flow.nodes.SpElConditionalFlowPicker;
import com.dongkuk.oasis.model.flow.nodes.TooManyDefaultFlowException;
import com.dongkuk.oasis.model.flow.nodes.TooManySequentialFlowException;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.FlowsStoreBuilder;
import com.dongkuk.oasis.utils.StringUtil;
import org.jdom2.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * 흐름에 이름이 지정된 경우 조건이 있는 것으로 본다. 단, {@link SequentialFlow} 인 경우는 그냥 이름이다.
 * 단순히 이름만 적었을 경우 컨텍스트에 존재하는 문자열 값과 동일성 비교를 하고
 * 표현식을 적으면 속성에 명시적으로 표현식을 적지 않더라도 이름에 적힌 표현식을
 * 조건으로 본다.
 * See, {@link FlowNameConditionalFlowPicker}
 * See, {@link SpElConditionalFlowPicker}
 *
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaFlowsStoreBuilder implements FlowsStoreBuilder<Element> {
    private static final Logger log = LoggerFactory.getLogger(CamundaFlowsStoreBuilder.class);

    @Override
    public FlowStore flows(Element processElement) {
        if (!processElement.getName().equals("process") && !processElement.getName().equals("subProcess"))
            throw new IllegalArgumentException("Not a process level element.");

        Map<String, CamundaFlowGroup> flowGroupMap = flowGroupMap(processElement);

        ByFlowNode byFlowNode = flowMap(flowGroupMap);

        return new CamundaFlowStore(byFlowNode);
    }

    /**
     * {@code NodeId}를 키로 하는 흐름 타입별 맵을 반환한다.
     * 흐름 타입별 맵은 흐름 타입을 키로 해서 흐름 맵을 가지고 있다.
     * 흐름 맵은 흐름 식별자를 키로해서 값을 가지고 있다.
     *
     * @param flowGroupMap 출발 요소별 흐름 맵
     * @return 흐름 식별자를 키로 하는 흐름 맵
     */
    private ByFlowNode flowMap(Map<String, CamundaFlowGroup> flowGroupMap) {
        ByFlowNode byFlowNode = new ByFlowNode();

        for (Map.Entry<String, CamundaFlowGroup> entry : flowGroupMap.entrySet()) {
            log.trace("Check element flows : " + entry.getKey());

            ByFlowType byFlowType = new ByFlowType();
            ByFlowId<SequentialFlow> sequentialFlowMap = new ByFlowId<>(SequentialFlow.class);
            ByFlowId<ConditionalFlow> conditionalFlowMap = new ByFlowId<>(ConditionalFlow.class);
            ByFlowId<DefaultFlow> defaultFlowMap = new ByFlowId<>(DefaultFlow.class);
            ByFlowId<ParallelFlow> parallelFlowMap = new ByFlowId<>(ParallelFlow.class);

            CamundaFlowGroup camundaFlowGroup = flowGroupMap.get(entry.getKey());

            if (camundaFlowGroup.isConditional()) {
                int defaultFlowCount = 0;
                for (CamundaFlowElement flowElement : camundaFlowGroup.getFlowElements()) {
                    if (flowElement.getConditionExpression() == null) {
                        defaultFlowMap.addFlow(flowElement.getFlowId(), new IdentifiableDefaultFlow(
                                flowElement.getFlowId(),
                                flowElement.getFlowName(),
                                flowElement.getSourceId(),
                                flowElement.getTargetId(),
                                flowElement.getProperties()));
                        defaultFlowCount++;
                    } else {
                        conditionalFlowMap.addFlow(flowElement.getFlowId(), new DefaultConditionalFlow(
                                flowElement.getFlowId(),
                                flowElement.getFlowName(),
                                flowElement.getSourceId(),
                                flowElement.getTargetId(),
                                new StringExpressionCondition(flowElement.getConditionExpression()),
                                flowElement.getProperties()
                        ));
                    }
                }

                if (defaultFlowCount > 1)
                    throw new TooManyDefaultFlowException();

            } else if (camundaFlowGroup.isParallel()) {
                if (camundaFlowGroup.getFlowElements().size() == 1) {
                    for (CamundaFlowElement flowElement : camundaFlowGroup.getFlowElements()) {
                        sequentialFlowMap.addFlow(flowElement.getFlowId(), new DefaultSequentialFlow(
                                flowElement.getFlowId(),
                                flowElement.getFlowName(),
                                flowElement.getSourceId(),
                                flowElement.getTargetId(),
                                flowElement.getProperties()));
                    }
                } else {
                    for (CamundaFlowElement flowElement : camundaFlowGroup.getFlowElements()) {
                        parallelFlowMap.addFlow(flowElement.getFlowId(), new DefaultParallelFlow(
                                flowElement.getFlowId(),
                                flowElement.getFlowName(),
                                flowElement.getSourceId(),
                                flowElement.getTargetId(),
                                flowElement.getProperties()));
                    }
                }
            } else {
                int sequentialFlowCount = 0;
                for (CamundaFlowElement flowElement : camundaFlowGroup.getFlowElements()) {
                    sequentialFlowMap.addFlow(flowElement.getFlowId(), new DefaultSequentialFlow(
                            flowElement.getFlowId(),
                            flowElement.getFlowName(),
                            flowElement.getSourceId(),
                            flowElement.getTargetId(),
                            flowElement.getProperties()));
                    sequentialFlowCount++;
                }
                if (sequentialFlowCount > 1)
                    throw new TooManySequentialFlowException();
            }
            byFlowType.addType(sequentialFlowMap);
            byFlowType.addType(conditionalFlowMap);
            byFlowType.addType(defaultFlowMap);
            byFlowType.addType(parallelFlowMap);

            byFlowNode.addNode(entry.getKey(), byFlowType);
        }

        return byFlowNode;
    }

    /**
     * 흐름이 가지고 있는 출발 요소들끼리 그룹화 한다.
     * <p>
     * 요소 식별자가 키이고 요소에 달린 흐름 목록을 반환한다.
     *
     * @param root 프로세스 레벨 엘리먼트
     * @return 흐름 그룹 맵
     */
    private Map<String, CamundaFlowGroup> flowGroupMap(Element root) {
        Map<String, CamundaFlowGroup> flowGroupMap = new HashMap<>();
        Set<String> parallelGateways = new HashSet<>();

        for (Element element : root.getChildren()) {
            if (element.getName().equals("parallelGateway"))
                parallelGateways.add(element.getAttributeValue("id"));
        }

        for (Element element : root.getChildren()) {
            if (!element.getName().equals("sequenceFlow"))
                continue;

            String sourceRef = element.getAttributeValue("sourceRef");

            String flowId = element.getAttributeValue("id");
            String flowName = element.getAttributeValue("name");

            PropertyContainer properties = CamundaElementUtil.extractProperties(element);

            String conditionExpression = null;
            List<Element> conditionExpressionElement = element.getChildren();
            if (conditionExpressionElement.size() > 1)
                throw new IllegalStateException(conditionExpressionElement.size() +
                        "conditions exist. Conditions should be 0 or 1.");

            for (Element child : conditionExpressionElement) {
                if (child.getName().equals("conditionExpression"))
                    conditionExpression = child.getText();
            }

            if (!StringUtil.hasText(conditionExpression) && StringUtil.hasText(flowName))
                conditionExpression = flowName;

            String sourceElementId = element.getAttributeValue("sourceRef");
            String targetElementId = element.getAttributeValue("targetRef");

            CamundaFlowElement flowElement =
                    new CamundaFlowElement(flowId,
                            flowName,
                            conditionExpression,
                            sourceElementId,
                            targetElementId,
                            properties);

            CamundaFlowGroup flowGroup = flowGroupMap.get(sourceRef);
            if (flowGroup == null) {
                flowGroup = new CamundaFlowGroup(parallelGateways);
                flowGroup.addFlowElement(flowElement);
                flowGroupMap.put(sourceRef, flowGroup);
            } else {
                flowGroup.addFlowElement(flowElement);
            }

        }
        return flowGroupMap;
    }

    /**
     * 흐름 노드 별 저장소.
     */
    static class ByFlowNode {
        /**
         * Key:Node Id.
         */
        private final Map<String, ByFlowType> map = new HashMap<>();

        public void addNode(String nodeId, ByFlowType flows) {
            map.put(nodeId, flows);
        }

        public <T extends Flow> Collection<T> flows(String flowNodeId, Class<T> clazz) {
            ByFlowType byFlowType = map.get(flowNodeId);
            if (byFlowType == null)
                return Collections.emptyList();
            return byFlowType.flows(clazz);
        }

        public <T extends Flow> T flow(String flowId, Class<T> flowType) {
            for (ByFlowType value : map.values()) {
                T flow = value.flow(flowId, flowType);
                if (flow != null)
                    return flow;
            }
            throw new IllegalArgumentException(String.format("Cannot find flow [%s].", flowId));
        }

        public <T extends Flow> T flow(String flowId) {
            for (ByFlowType value : map.values()) {
                T flow = value.flow(flowId);
                if (flow != null)
                    return flow;
            }
            throw new IllegalArgumentException(String.format("Cannot find flow [%s]", flowId));
        }
    }

    /**
     * 흐름 타입별 저장소.
     */
    static class ByFlowType {
        private final Map<Class<? extends Flow>, ByFlowId<? extends Flow>> map = new HashMap<>();

        public void addType(ByFlowId<? extends Flow> flows) {
            if (map.containsKey(flows.type()))
                throw new IllegalArgumentException("Flow type already registered.");

            this.map.put(flows.type(), flows);
        }

        public <T extends Flow> Collection<T> flows(Class<T> flowType) {
            ByFlowId<? extends Flow> byFlowId = map.get(flowType);

            Collection<? extends Flow> flows = byFlowId.flows();

            @SuppressWarnings("unchecked")
            Collection<T> f = (Collection<T>) flows;
            return f;
        }

        public <T extends Flow> T flow(String flowId, Class<T> flowType) {
            ByFlowId<? extends Flow> byFlowId = map.get(flowType);
            Flow flow = byFlowId.flow(flowId);
            if (flow != null)
                return flowType.cast(flow);
            else
                return null;
        }

        @SuppressWarnings("unchecked")
        public <T extends Flow> T flow(String flowId) {
            T t;
            for (ByFlowId<? extends Flow> value : map.values()) {
                Flow flow = value.flow(flowId);
                if (flow != null) {
                    t = (T) flow;
                    return t;
                }
            }
            return null;
        }
    }

    /**
     * 흐름 식별자별 저장소.
     *
     * @param <T> 흐름 타입
     */
    static class ByFlowId<T extends Flow> {
        private final Map<String, T> flowMap = new HashMap<>();
        private final Class<T> clazz;

        ByFlowId(Class<T> clazz) {
            this.clazz = clazz;
        }

        public void addFlow(String flowId, T flow) {
            if (clazz.isInstance(flow))
                flowMap.put(flowId, flow);
        }

        public Collection<T> flows() {
            return flowMap.values();
        }

        public T flow(String flowId) {
            return flowMap.get(flowId);
        }

        public Class<T> type() {
            return clazz;
        }
    }
}
