package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.ScriptTask;
import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.ProcedureScriptTask;
import com.dongkuk.oasis.model.activity.SqlScriptTask;
import com.dongkuk.oasis.model.activity.TransactionScriptTask;
import com.dongkuk.oasis.model.flow.nodes.IllegalFlowException;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.TaskBuilder;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
final class CamundaScriptTaskBuilder implements TaskBuilder<Element> {
    @Override
    public Task buildTask(Element taskElement, FlowStore flowStore) {
        if (!(taskElement.getName().equals("scriptTask")))
            throw new IllegalArgumentException("Not a script task level element :" + taskElement.getName());

        CommonElementAttributesAndProperties elementAttrProp =
                new CommonElementAttributesAndProperties(taskElement, flowStore);

        String scriptFormat = CamundaAttributeExtractor.scriptFormat(taskElement);
        String resource = CamundaAttributeExtractor.resource(taskElement);

        if (scriptFormat == null)
            throw new IllegalStateException(
                    String.format("No script format property exists. Element id : %s", elementAttrProp.id()));

        switch (scriptFormat) {
            case "sql": {
                String sql = CamundaElementUtil.extractScript(taskElement);

                if (resource == null || resource.length() == 0) {
                    if (sql == null || sql.length() == 0)
                        throw new IllegalStateException(
                                String.format("SQL is empty. Element id : %s", elementAttrProp.id()));
                }

                return createSqlScriptTask(
                        sql,
                        resource,
                        elementAttrProp
                );
            }
            case "proc": {
                String sql = CamundaElementUtil.extractScript(taskElement);

                if (sql == null || sql.length() == 0)
                    throw new IllegalStateException(
                            String.format("SQL is empty. Element id : %s", elementAttrProp.id()));

                return createProcedureScriptTask(
                        sql,
                        elementAttrProp
                );
            }
            case "transaction":
                String transactionScript = CamundaElementUtil.extractScript(taskElement);

                if (transactionScript == null || transactionScript.length() == 0)
                    throw new IllegalStateException(
                            String.format("Transaction Script is empty. Element id : %s", elementAttrProp.id()));

                return createTransactionScriptTask(
                        transactionScript,
                        elementAttrProp
                );
            default:
                throw new IllegalStateException(
                        String.format("Unsupported script format. Element id : %s", elementAttrProp.id()));
        }

    }

    private Task createTransactionScriptTask(String transactionScript,
                                             CommonElementAttributesAndProperties elementAttrProp) {

        TransactionScriptTask scriptTask;

        if (!elementAttrProp.isValidComplexFlowNode())
            throw new IllegalFlowException(
                    String.format("Incorrect flow configuration, task id : %s", elementAttrProp.id()));

        scriptTask = new TransactionScriptTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                transactionScript,
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());

        return scriptTask;
    }

    private Task createSqlScriptTask(String sql,
                                     String resource,
                                     CommonElementAttributesAndProperties elementAttrProp) {

        ScriptTask scriptTask;

        if (!elementAttrProp.isValidComplexFlowNode())
            throw new IllegalFlowException(
                    String.format("Incorrect flow configuration, task id : %s", elementAttrProp.id()));

        scriptTask = new SqlScriptTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                sql,
                resource,
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());

        return scriptTask;
    }

    private Task createProcedureScriptTask(String sql,
                                           CommonElementAttributesAndProperties elementAttrProp) {

        ScriptTask scriptTask;

        if (!elementAttrProp.isValidComplexFlowNode())
            throw new IllegalFlowException(
                    String.format("Incorrect flow configuration, task id : %s", elementAttrProp.id()));

        scriptTask = new ProcedureScriptTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                sql,
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());

        return scriptTask;
    }
}
