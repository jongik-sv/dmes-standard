package com.dongkuk.oasis.service;

import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.model.Element;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
final class MapServiceResult implements ServiceResult {
    private ServiceResultCode serviceResultCode;
    private String serviceResultMessage;
    private Throwable exception;
    private Map<String, TypedObject> result;
    private List<Element> path = Collections.synchronizedList(new ArrayList<>());
    private List<Message> messages;

    /**
     * @param messages 메시지 리스트
     */
    public void setMessages(List<Message> messages) {
        this.messages = messages;
    }

    /**
     * @param element 실행된 요소
     */
    public void addPath(Element element) {
        this.path.add(element);
    }

    /**
     * 서비스 결과 코드를 설정한다.
     *
     * @param serviceResultCode 서비스 결과 코드
     */
    public void setServiceResultCode(ServiceResultCode serviceResultCode) {
        this.serviceResultCode = serviceResultCode;
    }

    /**
     * 서비스 결과 메시지를 설정한다.
     *
     * @param serviceResultMessage 서비스 결과 메시지
     */
    public void setServiceResultMessage(String serviceResultMessage) {
        this.serviceResultMessage = serviceResultMessage;
    }

    /**
     * 예외 정보를 설정한다.
     *
     * @param exception 예외
     */
    public void setException(Throwable exception) {
        this.exception = exception;
    }

    /**
     * 서비스 수행 결과를 설정한다.
     *
     * @param result 수행 결과
     */
    public void setResult(Map<String, TypedObject> result) {
        this.result = result;
    }

    /**
     * 서비스 실행 요소 경로를 설정한다.
     *
     * @param path 경로
     */
    public void setPath(List<Element> path) {
        this.path = path;
    }

    @Override
    public ServiceResultCode serviceResultCode() {
        return serviceResultCode;
    }

    @Override
    public String serviceResultMessage() {
        return serviceResultMessage;
    }

    @Override
    public Throwable exception() {
        return exception;
    }

    @Override
    public Map<String, TypedObject> results() {
        return result == null ? Collections.emptyMap() : result;
    }

    @Override
    public TypedObject result(String key) {
        return result.get(key);
    }

    @Override
    public List<PathElement> path() {
        return path.stream()
                .map(element -> new PathElement(element.getId(), element.getName()))
                .collect(Collectors.toList());
    }

    @Override
    public List<Message> messages() {
        return messages == null ? Collections.emptyList() : messages;
    }
}
