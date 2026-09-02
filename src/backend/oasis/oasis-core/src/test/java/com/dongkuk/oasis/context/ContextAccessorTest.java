package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.Property;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;

import java.util.ArrayList;
import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.OUTPUT_KEY;

/**
 * @author Jeongjin Kim
 * @since 2021-07-29
 */
class ContextAccessorTest {
    @Test
    void loopSubProcessResultAccess() {
        ServiceContext serviceContext = new DefaultServiceContext();

        // 서브 프로세스에 태스크 결과를 넣는다.
        ProcessContext subProcessContext = new DefaultProcessContext(serviceContext);
        subProcessContext.add("colorName", new TypedObject("hihi"));

        // 서브 프로세스의 결과를 태스크 실행결과로 변환한다.
        SubProcessResult subProcessResult = new SubProcessResult(subProcessContext);
        ExecutionResult executionResult = new UnmodifiableExecutionResult(new TypedObject(subProcessResult));

        List<TypedObject> executionResults = new ArrayList<>();

        // 서프 프로세스의 실행 결과를 루프 결과에 추가한다.
        executionResults.add(executionResult.result());

        // 루프 태스크의 결과를 반환한다.
        ExecutionResult elementExecutionResult = new UnmodifiableExecutionResult(
                new TypedObject(executionResults, new TypeReference<List<TypedObject>>() {
                }));

        // 루프 태스크 결과를 메인 프로세스 컨텍스트에 넣는다.
        ProcessContext processContext = new DefaultProcessContext(serviceContext);
        setOutputIntoProcessContext(processContext, new Property("output", "colorNameProcess1"), elementExecutionResult);

        // 배타적 게이트웨이는 프로세스 컨텍스트에 있는 루프 태스크 결과를 컨택스트 엑세서를 만들어서 반환한다.
        ContextAccessor contextAccessor = new ContextAccessor(new DefaultExecutableContext(processContext));
        UnmodifiableExecutionResult contextAccessorResult = new UnmodifiableExecutionResult(new TypedObject(contextAccessor));

        ExpressionParser parser = new SpelExpressionParser();
        String stringConditionExpression = "#root['colorNameProcess1'][0]['colorName']=='hi'";
        Expression expression = parser.parseExpression(stringConditionExpression);
        Boolean value;

        // flow picker 는 표현식을 평가한다.
        value = expression.getValue(contextAccessorResult.result().getObject(), Boolean.class);
        Assertions.assertThat(value).isFalse();
    }

    @Test
    void subProcessResultAccess() {
        ServiceContext serviceContext = new DefaultServiceContext();

        // 서브 프로세스에 태스크 결과를 넣는다.
        ProcessContext subProcessContext = new DefaultProcessContext(serviceContext);
        subProcessContext.add("colorName", new TypedObject("hihi"));

        // 서브 프로세스의 결과를 태스크 실행결과로 변환한다.
        SubProcessResult subProcessResult = new SubProcessResult(subProcessContext);
        ExecutionResult executionResult = new UnmodifiableExecutionResult(new TypedObject(subProcessResult));

        // 서브 프로세스 태스크 결과를 메인 프로세스 컨텍스트에 넣는다.
        ProcessContext processContext = new DefaultProcessContext(serviceContext);
        setOutputIntoProcessContext(processContext, new Property("output", "colorNameProcess2"), executionResult);

        // 배타적 게이트웨이는 프로세스 컨텍스트에 있는 루프 태스크 결과를 컨택스트 엑세서를 만들어서 반환한다.
        ContextAccessor contextAccessor = new ContextAccessor(new DefaultExecutableContext(processContext));
        UnmodifiableExecutionResult contextAccessorResult = new UnmodifiableExecutionResult(new TypedObject(contextAccessor));

        ExpressionParser parser = new SpelExpressionParser();
        String stringConditionExpression = "#root['colorNameProcess2']['colorName']=='hihi'";
        Expression expression = parser.parseExpression(stringConditionExpression);
        Boolean value;

        // flow picker 는 표현식을 평가한다.
        value = expression.getValue(contextAccessorResult.result().getObject(), Boolean.class);
        Assertions.assertThat(value).isTrue();
    }

    @Test
    void subProcessOutputAccessedResultAccess() {
        ServiceContext serviceContext = new DefaultServiceContext();

        // 서브 프로세스에 태스크 결과를 넣는다.
        ProcessContext subProcessContext = new DefaultProcessContext(serviceContext);
        subProcessContext.add("colorName", new TypedObject("hihi"));

        // 서브 프로세스의 결과를 태스크 실행결과로 변환한다.
        SubProcessResult subProcessResult = new SubProcessResult(subProcessContext);
        ExecutionResult executionResult = new UnmodifiableExecutionResult(new TypedObject(subProcessResult));

        // 서브 프로세스 태스크 결과를 메인 프로세스 컨텍스트에 넣는다.
        // 넣을 때 맵에 접근한 결과를 프로세스 컨텍스트에 넣는다.
        ProcessContext processContext = new DefaultProcessContext(serviceContext);
        setOutputIntoProcessContext(processContext,
                new Property("output", "[  'colorName' ] ->     colorName"), executionResult);

        // 배타적 게이트웨이는 프로세스 컨텍스트에 있는 루프 태스크 결과를 컨택스트 엑세서를 만들어서 반환한다.
        ContextAccessor contextAccessor = new ContextAccessor(new DefaultExecutableContext(processContext));
        UnmodifiableExecutionResult contextAccessorResult = new UnmodifiableExecutionResult(new TypedObject(contextAccessor));

        ExpressionParser parser = new SpelExpressionParser();
        String stringConditionExpression = "#root['colorName']=='hihi'";
        Expression expression = parser.parseExpression(stringConditionExpression);
        Boolean value;

        // flow picker 는 표현식을 평가한다.
        value = expression.getValue(contextAccessorResult.result().getObject(), Boolean.class);
        Assertions.assertThat(value).isTrue();
    }

    private void setOutputIntoProcessContext(ProcessContext processContext,
                                             Property outputKeyProperty,
                                             ExecutionResult executionResult) {
        if (executionResult == null)
            return;

        String outputKey;
        if (outputKeyProperty != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(outputKeyProperty);
            if (propertyExpressions.size() > 1)
                throw new PropertyException(
                        String.format("[%s] 프로퍼티는 [,]로 구분하여 2개 이상 지정할 수 없습니다.", OUTPUT_KEY));

            PropertyExpression propertyExpression = propertyExpressions.get(0);
            outputKey = propertyExpression.getAlias(String.class);

            TypedObject result = executionResult.result();
            result = PropertyUtil.access(result, propertyExpression.getAccessors());
            processContext.add(outputKey, result);
        }
    }
}