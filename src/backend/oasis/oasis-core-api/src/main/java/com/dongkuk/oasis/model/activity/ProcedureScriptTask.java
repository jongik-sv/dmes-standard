package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.ScriptTask;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;
import java.util.Map;

/**
 * 실행할 스크립트와 데이터 소스를 입력받아 DBMS Procedure 을 실행하는 태스크.
 * <p>
 * {@code Context}에서 데이터소스를 제공받을 수 있어야 한다.
 * <p>
 * <b>파라미터 바인딩</b>
 * <p>
 * 파라미터는 {@link Map} 또는 일반 자바 클래스를 바인딩 소스로 사용할 수 있다. 일반 자바 클래스는 {@code getter}로 데이터를 가져올 수 있어야 한다.
 * 프로퍼티로 설정한 값과 {@code Context}에서 가져올 수 있는 값을 파라미터로 사용한다.
 * {@code input} 프로퍼티로 입력값으로 사용할 객체를 복수로 선택할 수 있다. {@code input}으로 지정된 개체가 1개이고 {@link Map} 이면 모든 엔트리를
 * 파라미터로 사용한다. 일반 자바 클래스일 경우 내부적으로 {@code Map}으로 변환하여 파라미터 목록에 추가한다.
 * <p>
 * 서비스 컨텍스트는 {@code input} 프로퍼티 사용 여부와 상관없이 파라미터 바인딩에 사용한다.
 * <p>
 * <b>파라미터 바인딩 우선순위</b>
 * <p>
 * {@code input -> input keys -> Service Context}
 *
 * @author Jeongjin Kim
 * @since 2022-02-08
 */
public final class ProcedureScriptTask extends AbstractTask implements ScriptTask {
    private String sql;

    /**
     * {@link ConditionalFlow}와 {@link DefaultFlow} 를 가진 태스크를 생성한다.
     *
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param sql              SQL
     * @param properties       태스크 속성
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복특성
     */
    public ProcedureScriptTask(String taskId,
                               String taskName,
                               Collection<ConditionalFlow> conditionalFlows,
                               DefaultFlow defaultFlow,
                               SequentialFlow sequentialFlow,
                               String sql,
                               PropertyContainer properties,
                               InputOutputContainer inputs,
                               InputOutputContainer outputs,
                               MultiInstance multiInstance) {
        super(taskId,
                taskName,
                properties,
                conditionalFlows,
                defaultFlow,
                sequentialFlow,
                inputs,
                outputs,
                multiInstance);

        setCommonParams(sql);
    }

    private void setCommonParams(String sql) {

        if (sql == null)
            throw new IllegalArgumentException("Required value is null, sql");

        this.sql = sql;
    }

    /**
     * @return sql
     */
    public String getSql() {
        return sql;
    }
}
