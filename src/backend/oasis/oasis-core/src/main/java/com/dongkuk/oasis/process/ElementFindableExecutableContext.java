package com.dongkuk.oasis.process;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.Process;

import java.lang.reflect.Type;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-06-24
 */
public class ElementFindableExecutableContext implements ElementFindableContext {
    private final ExecutableContext executableContext;
    private final Process process;

    /**
     * @param executableContext executableNodeContext
     * @param process           요소를 찾기 위한 프로세스
     */
    public ElementFindableExecutableContext(ExecutableContext executableContext, Process process) {
        this.executableContext = executableContext;
        this.process = process;
    }

    @Override
    public TypedObject get(String key) {
        return executableContext.get(key);
    }

    @Override
    public List<TypedObject> get(Type type) {
        return executableContext.get(type);
    }

    @Override
    public ServiceContext serviceContext() {
        return executableContext.serviceContext();
    }

    @Override
    public ProcessContext processContext() {
        return executableContext.processContext();
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return executableContext.getObject(condition);
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo info) {
        executableContext.registerObject(object, info);
    }

    @Override
    public void raiseEvent(Event event) {
        executableContext.raiseEvent(event);
    }

    /**
     * @param elementId 요소 식별자
     * @return element
     */
    @Override
    public Element element(String elementId) {
        return process.getElement(elementId);
    }
}
