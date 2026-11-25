#!/usr/bin/env node
// mqc 시연 화면용 OASIS BPMN 생성기 — action 분기 게이트웨이 하나에 serviceTask 를 나란히 둔 모양(action 마다 task 하나, end 하나).
// 사용: node scripts/mqc-demo/gen-bpmn.mjs <spec.json> <out.bpmn>
// spec: { "id": "qcdRule", "name": "품질설계 기준 공용", "bean": "qcdRule", "doc": "설명",
//         "actions": [ { "action": "search", "name": "룰 정의 조회", "dto": "com....Request" } ] }
// action 이름이 곧 서비스 메서드 이름이다(method 를 따로 주면 그 값을 쓴다). 응답은 result 아래에 싣는다.
import { readFileSync, writeFileSync } from "node:fs";

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error("사용: node scripts/mqc-demo/gen-bpmn.mjs <spec.json> <out.bpmn>");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const acts = spec.actions;
const gwY = 60 + ((acts.length - 1) * 120) / 2 + 40; // 게이트웨이 가운데 y
const lines = [];
const di = [];
lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
lines.push(
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${spec.id}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-tool" exporterVersion="1.3.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.15.0">`,
);
lines.push(`  <bpmn:process id="${spec.id}" name="${esc(spec.name)}" isExecutable="true">`);
const docLines = [spec.doc ?? spec.name, "", ...acts.map((a) => `action=${a.action} -&gt; ${a.action}Task (${spec.bean}.${a.method ?? a.action}) ${esc(a.name)}`)];
lines.push(`    <bpmn:documentation>${docLines.map((l) => (l.includes("-&gt;") ? l : esc(l))).join("\n")}</bpmn:documentation>`);
lines.push(`    <bpmn:startEvent id="start" name="시작">\n      <bpmn:outgoing>flow_to_gw</bpmn:outgoing>\n    </bpmn:startEvent>`);
lines.push(`    <bpmn:exclusiveGateway id="actionGateway" name="action 분기">`);
lines.push(`      <bpmn:extensionElements>\n        <camunda:properties>\n          <camunda:property name="input" value="action" />\n        </camunda:properties>\n      </bpmn:extensionElements>`);
lines.push(`      <bpmn:incoming>flow_to_gw</bpmn:incoming>`);
for (const a of acts) lines.push(`      <bpmn:outgoing>flow_${a.action}</bpmn:outgoing>`);
lines.push(`    </bpmn:exclusiveGateway>`);
for (const a of acts) {
  lines.push(`    <bpmn:serviceTask id="${a.action}Task" name="${esc(a.name)}" camunda:class="${spec.bean}">`);
  lines.push(`      <bpmn:extensionElements>\n        <camunda:properties>`);
  lines.push(`          <camunda:property name="method" value="${a.method ?? a.action}" />`);
  lines.push(`          <camunda:property name="output" value="result" />`);
  if (a.dto) lines.push(`          <camunda:property name="dto" value="${a.dto}" />`);
  lines.push(`        </camunda:properties>\n      </bpmn:extensionElements>`);
  lines.push(`      <bpmn:incoming>flow_${a.action}</bpmn:incoming>\n      <bpmn:outgoing>flow_${a.action}_end</bpmn:outgoing>\n    </bpmn:serviceTask>`);
}
for (const a of acts) lines.push(`    <bpmn:endEvent id="end${cap(a.action)}" name="${esc(a.name)} 완료">\n      <bpmn:incoming>flow_${a.action}_end</bpmn:incoming>\n    </bpmn:endEvent>`);
lines.push(`    <bpmn:sequenceFlow id="flow_to_gw" sourceRef="start" targetRef="actionGateway" />`);
for (const a of acts) lines.push(`    <bpmn:sequenceFlow id="flow_${a.action}" name="${a.action}" sourceRef="actionGateway" targetRef="${a.action}Task" />`);
for (const a of acts) lines.push(`    <bpmn:sequenceFlow id="flow_${a.action}_end" sourceRef="${a.action}Task" targetRef="end${cap(a.action)}" />`);
lines.push(`  </bpmn:process>`);

di.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${spec.id}">`);
di.push(`      <bpmndi:BPMNShape id="start_di" bpmnElement="start">\n        <dc:Bounds x="152" y="${gwY - 18}" width="36" height="36" />\n      </bpmndi:BPMNShape>`);
di.push(`      <bpmndi:BPMNShape id="actionGateway_di" bpmnElement="actionGateway" isMarkerVisible="true">\n        <dc:Bounds x="245" y="${gwY - 25}" width="50" height="50" />\n      </bpmndi:BPMNShape>`);
acts.forEach((a, i) => {
  const y = 60 + i * 120;
  di.push(`      <bpmndi:BPMNShape id="${a.action}Task_di" bpmnElement="${a.action}Task">\n        <dc:Bounds x="380" y="${y}" width="100" height="80" />\n      </bpmndi:BPMNShape>`);
  di.push(`      <bpmndi:BPMNShape id="end${cap(a.action)}_di" bpmnElement="end${cap(a.action)}">\n        <dc:Bounds x="560" y="${y + 22}" width="36" height="36" />\n      </bpmndi:BPMNShape>`);
});
di.push(`      <bpmndi:BPMNEdge id="flow_to_gw_di" bpmnElement="flow_to_gw">\n        <di:waypoint x="188" y="${gwY}" />\n        <di:waypoint x="245" y="${gwY}" />\n      </bpmndi:BPMNEdge>`);
acts.forEach((a, i) => {
  const y = 100 + i * 120;
  const fromY = y < gwY ? gwY - 25 : gwY + 25;
  di.push(
    `      <bpmndi:BPMNEdge id="flow_${a.action}_di" bpmnElement="flow_${a.action}">\n        <di:waypoint x="270" y="${fromY}" />\n        <di:waypoint x="270" y="${y}" />\n        <di:waypoint x="380" y="${y}" />\n      </bpmndi:BPMNEdge>`,
  );
  di.push(
    `      <bpmndi:BPMNEdge id="flow_${a.action}_end_di" bpmnElement="flow_${a.action}_end">\n        <di:waypoint x="480" y="${y}" />\n        <di:waypoint x="560" y="${y}" />\n      </bpmndi:BPMNEdge>`,
  );
});
di.push(`    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>`);

writeFileSync(outPath, [...lines, ...di, `</bpmn:definitions>`, ""].join("\n"));
console.log(`${outPath} — action ${acts.map((a) => a.action).join(", ")}`);
