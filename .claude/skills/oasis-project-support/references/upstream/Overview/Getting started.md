# Getting started

이 페이지는 오래된 UI 스크린샷 대신 현재 코드 기준의 최소 실행 절차만 남긴 버전이다.

# 준비

- Java 17 이상
- Camunda Modeler
- Gradle 또는 Maven 프로젝트
- `oasis:oasis-core:5.0.0`

# 1. 의존성 추가

```java
implementation 'oasis:oasis-core:5.0.0'
```

```xml
<dependency>
  <groupId>oasis</groupId>
  <artifactId>oasis-core</artifactId>
  <version>5.0.0</version>
</dependency>
```

사내/private 저장소를 통해 artifact를 받는 환경이면 현재 팀의 저장소 주소를 사용한다. 하드코딩된 예전 Nexus 주소는 문서 기준이 아니라 배포 환경 설정값으로 봐야 한다.

# 2. 서비스 문서 위치

- BPMN 파일은 `src/main/resources/services` 아래에 둔다.
- 파일명에서 확장자를 제외한 값이 서비스 ID가 된다.
- 예: `src/main/resources/services/my-first-oasis.bpmn` -> 서비스 ID는 `my-first-oasis`

# 3. Java 태스크 작성

```java
package oasis;

public class Hello {
    public void greeting(String name) {
        System.out.println(name + "! Hello.");
    }
}
```

# 4. BPMN 모델 작성

가장 단순한 흐름은 `Start Event -> Service Task -> End Event` 이다.

Service Task 설정 방법은 두 가지가 있다.

- 클래스와 메소드를 한 번에 지정: `camunda:class="oasis.Hello#greeting"`
- 클래스를 지정하고 프로퍼티로 메소드 지정: 클래스는 `oasis.Hello`, 프로퍼티는 `method=greeting`

최소 예시는 다음과 같다.

```xml
<bpmn:serviceTask id="Activity_hello" name="인사하기" camunda:class="oasis.Hello#greeting" />
```

별도 `method` 프로퍼티를 쓰고 싶다면 다음처럼 설정한다.

```xml
<bpmn:serviceTask id="Activity_hello" name="인사하기" camunda:class="oasis.Hello">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="greeting" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

메소드 파라미터 이름 `name` 은 서비스 컨텍스트의 입력 키 `name` 과 매칭된다.

# 5. 실행 코드

```java
package oasis;

import oasis.TypedObject;
import oasis.context.DefaultServiceContext;
import oasis.context.ServiceContext;
import oasis.factories.NonTransactionalServiceStarterFactory;
import oasis.service.ServiceStarter;

import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        ServiceStarter serviceStarter =
                new NonTransactionalServiceStarterFactory().generateServiceStarter();

        Map<String, TypedObject> input = new HashMap<>();
        input.put("name", new TypedObject("sample"));

        ServiceContext serviceContext = new DefaultServiceContext(input);
        serviceStarter.start("my-first-oasis", serviceContext);
    }
}
```

# 6. Spring 프로젝트에서 시작하기

스프링을 쓰는 프로젝트라면 `SpringServiceStarterFactory` 를 사용한다.

```java
ServiceStarter serviceStarter =
        new SpringServiceStarterFactory(applicationContext, new String[]{"txBiz"})
                .generateServiceStarter();
```

기본 서비스 문서 위치는 `/services`, 파일 설명 구분자는 `^^` 이다.

# 7. 로그 보기

테스트/예제 프로젝트와 맞추려면 Log4j2 조합을 사용한다.

```
implementation 'org.apache.logging.log4j:log4j-core:2.24.3'
implementation 'org.apache.logging.log4j:log4j-slf4j2-impl:2.24.3'
```

# 8. 바로 확인할 수 있는 기준 소스

- 팩토리 기본값: `oasis-core/src/main/java/com/sample/oasis/factories`
- 첫 실행 패턴: `oasis-core/src/test/java/com/sample/oasis/BpmnServiceLoaderForTest.java`
- 테스트 작성 방법: [Testing](../Testing.md)

# 문제 해결

- 서비스가 안 보이면 BPMN 파일이 `resources/services` 아래에 있는지 먼저 확인한다.
- 태스크 클래스가 실행되지 않으면 정규화 클래스명과 메소드명을 점검한다.
- 파라미터 바인딩이 안 되면 서비스 컨텍스트 입력 키와 메소드 파라미터 이름이 같은지 확인한다.