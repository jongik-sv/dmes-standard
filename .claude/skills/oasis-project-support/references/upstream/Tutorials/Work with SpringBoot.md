# Work with SpringBoot

이 튜토리얼은 [스프링부트](https://spring.io/projects/spring-boot)를 이용해서 간단한 웹서비스를 만들어보고 OASIS와 어떻게 연동하는지 알아봅니다.

# 프로젝트 개요

아이디와 이름을 입력받을 수 있는 가입 요청API를 만들고 그 페이지의 입력값으로 사용자 가입처리를 하는 서비스를 만들어 볼 것입니다.

이 튜토리얼을 통해

- 스프링부트로 웹 프로젝트 만드는 법
- 핵심 로직 구현
- 핵심 로직 테스트
- OASIS와 연동
- 핵심 로직과 인프라서비스와 분리

에 대하여 알 수 있습니다.

### 필요 개발 도구

Eclipse Oxygen 이상([전자정부프레임워크 개발도구 다운로드 페이지](https://www.egovframe.go.kr/home/sub.do?menuNo=39))

### 선행 학습

BPMN 모델러를 다룰 수 있어야 합니다. 사용해본 적이 없으면 [Getting started](../Overview/Getting%20started.md) 문서를 먼저 해보시는 것을 추천드립니다.

# SpringBoot 프로젝트 만들기

### 프로젝트 다운로드

[스프링 이니셜라이저 페이지](https://start.spring.io)에서 아래처럼 옵션을 선택하고 다운로드 받습니다.

![Untitled](Work%20with%20SpringBoot/Untitled.png)

<aside>
💡 Spring Boot 버전은 SNAPSHOT, M2 등 라벨이 안붙은 최신버전을 선택하면 됩니다.

`spring-boot-devtools` 를 추가하면 클래스 로더 이슈로 정상 동작을 하지 않습니다. 추가하지 마세요.

</aside>

### 프로젝트 임포트

다운로드 받은 zip 파일을 압축해제 후 개발도구로 프로젝트를 열어주세요.

![Untitled](Work%20with%20SpringBoot/Untitled%201.png)

![Untitled](Work%20with%20SpringBoot/Untitled%202.png)

### 프로젝트 실행

*TutorialsSpringbootApplication.java* 파일을 열고 마우스 오른쪽 클릭하여 프로젝트를 실행시켜 봅니다.

<aside>
💡 Run As → Java Application

</aside>

아래와 같이 로그가 출력되고 멈추면 웹 브라우저를 켜서 [http://localhost:8080](http://localhost:8080) 으로 접속해 봅니다.

```
.   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::                (v2.5.4)

2021-08-30 15:13:36.180  INFO 7184 --- [           main] o.t.s.TutorialsSpringbootApplication     : Starting TutorialsSpringbootApplication using Java 1.8.0_291 on localhost with PID 7184 (~/workspace/tutorials-springboot/bin/main started by user in ~/workspace/tutorials-springboot)
2021-08-30 15:13:36.184  INFO 7184 --- [           main] o.t.s.TutorialsSpringbootApplication     : No active profile set, falling back to default profiles: default
2021-08-30 15:13:37.229  INFO 7184 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port(s): 8080 (http)
2021-08-30 15:13:37.246  INFO 7184 --- [           main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]
2021-08-30 15:13:37.246  INFO 7184 --- [           main] org.apache.catalina.core.StandardEngine  : Starting Servlet engine: [Apache Tomcat/9.0.52]
2021-08-30 15:13:37.331  INFO 7184 --- [           main] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring embedded WebApplicationContext
2021-08-30 15:13:37.331  INFO 7184 --- [           main] w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 1084 ms
2021-08-30 15:13:37.738  INFO 7184 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port(s): 8080 (http) with context path ''
2021-08-30 15:13:37.747  INFO 7184 --- [           main] o.t.s.TutorialsSpringbootApplication     : Started TutorialsSpringbootApplication in 2.28 seconds (JVM running for 2.924)
```

*Whitelabel Error Page*가 출력되면 정상입니다. 정상 실행이 확인이 되면 *Stop* 버튼을 눌러 서버를 종료합니다.

![Untitled](Work%20with%20SpringBoot/Untitled%203.png)

# 핵심 로직 구현

이 프로젝트의 핵심인 사용자 정보를 이용해서 가입처리를 하는 로직을 구현합니다.

### Member 클래스

맴버를 모델화한 클래스를 생성합니다. 기본 패키지 `oasis.tutorials.springboot` 밑에 `domain` 패키지를 추가하고 `domain` 패키지에 `Member` 클래스를 만듭니다.

```java
package oasis.tutorials.springboot.domain;

public class Member {
	private final String id;
	private final String name;

	public Member(String id, String name) {
		this.id = id;
		this.name = name;
	}

	public String getName() {
		return name;
	}

	public String getId() {
		return id;
	}
}
```

### MemberService 클래스

맴버를 가입시키는 로직을 가지고 있는 클래스를 생성하고 구현합니다. 

```java
package oasis.tutorials.springboot.domain;

import java.util.HashMap;
import java.util.Map;

public class MemberService {
	private final Map<String, Member> members = new HashMap<>();

	public void join(String id, String name) {
		if (findMember(id) == null)
			members.put(id, new Member(id, name));
		else
			throw new RuntimeException(id + " 는 이미 존재하는 ID 입니다.");
	}

	public Member findMember(String id) {
		return members.get(id);
	}
}
```

`MemberService` 에는 2개 메소드가 있습니다.

 멤버 가입을 위한 `join` 메소드는 `id`와 `name`을 매개변수로 `member` 객체를 생성한 뒤에 멤버 필드인 `members`에 저장을 합니다. 만약 가입을 위한 id가 이미 존재한다면 `join` 메소드는 실패합니다.

멤버 검색을 위한 `findMember` 메소드는 id를 이용해서 인수에 해당하는 멤버를 찾아 반환합니다.

`members` 멤버 필드는 데이터베이스를 대체합니다.

# 핵심로직 테스트

### 테스트 클래스 생성

핵심 로직이 정확하게 구현이 되었는지 단위 테스트 코드를 작성해 봅니다. 테스트 클래스는 IDE를 이용해서 간단하게 아래와 같이 생성합니다.

1. `MemberService`에 커서를 둡니다.
2. *Ctrl + 1* 을 눌러 팝업창을 열고 *Create new JUnit test case for 'MemberService.java'* 를 선택합니다.

<aside>
💡 만약 메뉴에 없으면 커서를 둔 상태에서 File→New→Other...→Java→JUnit→Junit Test Case 를 찾아서 선택하거나 Quick Access 에서 *junit test* 를 검색한 후에 선택합니다.

</aside>

![Untitled](Work%20with%20SpringBoot/Untitled%204.png)

3. 별다른 수정 없이 Finish 버튼을 눌러 테스트 클래스를 생성합니다.

![Untitled](Work%20with%20SpringBoot/Untitled%205.png)

### 테스트 케이스 만들기

만들어진 테스트 클래스에 테스트 케이스를 만들어 핵심 로직 클래스가 정확하게 만들어졌는지 검증합니다.

테스트 케이스를 추가한 뒤 `MemberServiceTest` 클래스 이름에 커서를 두고 마우스 오른쪽 클릭하여 컨텍스트 메뉴를 열고 *Run As → JUnit Test* 를 선택합니다.

```java
package oasis.tutorials.springboot.domain;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class MemberServiceTest {

	@Test
	void join() {
		MemberService memberService = new MemberService();
		memberService.join("1", "name");

		Member findMember = memberService.findMember("1");
		Assertions.assertThat(findMember).isNotNull();
	}

	@Test
	void rejectToJoinWhenAlreadyJoined() {
		MemberService memberService = new MemberService();
		memberService.join("1", "name");
		
		Assertions.assertThatExceptionOfType(RuntimeException.class).isThrownBy(() -> memberService.join("1", "name"));
	}
}
```

![Untitled](Work%20with%20SpringBoot/Untitled%206.png)

# OASIS 연동

멤버를 가입시키고 그 결과를 반환하는 OASIS 서비스를 만들고 실행시켜봅니다.

## BPMN 서비스 설계

### 서비스 디렉토리 생성

*resources* 밑에 *services* 디렉토리를 만듭니다.

### BPMN 서비스 파일 만들기

1. [Camunda 모델러](../BPMN%E2%84%A2%EF%B8%8F/Camunda%20Modeler.md)를 실행시킵니다.
2. *BPMN diagram (Camunda Platform)* 을 선택하여 새로운 다이어그램을 만듭니다.
3. 태스크를 시작 **이벤트에 연결하여 추가**하고 태스크 타입을 **서비스 태스크로 변경**합니다.
4. 속성 패널의 *General* 탭에 아래와 같이 입력합니다.
    - *Name* : 가입
    - *Details → Implementation* : Java Class
    - *Java Class* : oasis.tutorials.springboot.domain.MemberService
        
        ![Untitled](Work%20with%20SpringBoot/Untitled%207.png)
        
5. 속성 패널의 *Extentions* 탭에 아래와 같이 입력합니다.
    - *Properties* → *Add Property*
        
        *name* : method
        
        *value* : join
        
        ![Untitled](Work%20with%20SpringBoot/Untitled%208.png)
        
6. **가입 태스크에 연결하여 새 태스크를 추가**하고 태스크 타입을 **서비스 태스크로 변경**합니다.
7. 속성 패널의 *General* 탭에 아래와 같이 입력합니다.
    - *Name* : 조회
    - *Details* → *Implementation* : Java Class
    - *Java* *Class* : oasis.tutorials.springboot.domain.MemberService
        
        ![Untitled](Work%20with%20SpringBoot/Untitled%209.png)
        
8. 속성 패널의 *Extentions* 탭에 아래와 같이 입력합니다.
    - *Properties* → *Add Property*
        
        *name* : method
        
        *value* : findMember
        
    - *Properties* → *Add Property*
        
        *name* : output
        
        *value* : joinedMember
        
        ![Untitled](Work%20with%20SpringBoot/Untitled%2010.png)
        
9. 종료 이벤트를 추가합니다. 완성된 다아어그램은 아래와 유사할 것입니다.

![Untitled](Work%20with%20SpringBoot/Untitled%2011.png)

1. 작성한 다이어그램을 앞서 만든 *services* 디렉토리 밑에 *joinMember.bpmn* 으로 저장합니다.

![Untitled](Work%20with%20SpringBoot/Untitled%2012.png)

## OASIS Service를 실행하는 테스트 만들기

### 프로젝트에 OASIS 의존성 추가

build.gradle 파일에 oasis 배포 서버를 추가합니다.

```groovy
repositories{
	maven{
		url "http://10.110.1.12:8889/nexus/content/groups/public"
	  allowInsecureProtocol true
	}
	mavenCentral()
}
```

oasis 의존성을 추가합니다.

```groovy
dependencies{
	implementation 'oasis:oasis-core:4.0.1'
  implementation 'org.springframework.boot:spring-boot-starter-web'
  testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
```

### OASIS 실행 테스트 작성

`MemberServiceTest` 클래스에 OASIS 서비스를 실행하고 그 결과를 검증하는 테스트 케이스를 추가 작성합니다.

```java
@Test
void runWithOasis() {
	ServiceStarter serviceStater = 
			new NonTransactionalServiceStarterFactory().generateServiceStarter();
	
	Map<String, TypedObject> scc = new HashMap<>();
	scc.put("id", new TypedObject("id1"));
	scc.put("name", new TypedObject("newMemberName"));

	ServiceContext sc = new DefaultServiceContext(scc);

	ServiceResult start = serviceStater.start("joinMember", sc);

	TypedObject result = start.result("joinedMember");
	Member object = result.getObject(Member.class);
	
	Assertions.assertThat(object.getName()).isEqualTo("newMemberName");
}
```

테스트를 실행시키고 남은 로그를 보면 어떤 태스크를 통과하여 실행했고 수행시간은 얼마나 걸렸는지에 대한 정보를 알 수 있습니다.

```
17:51:24.336 [main] INFO oasis.service.CoreServiceStarter - Service [joinMember] start.
17:51:24.420 [main] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : Activity_1amp5yv
17:51:24.422 [main] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : StartEvent_1
17:51:24.422 [main] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : Activity_0kyozhb
17:51:24.434 [main] INFO oasis.process.CoreProcessStarter - Process [Process_11oeyed](Process_11oeyed) start.
17:51:24.435 [main] INFO oasis.model.event.DefaultStartEvent - Task [StartEvent_1](StartEvent_1) start.
17:51:24.437 [main] INFO oasis.model.event.DefaultStartEvent - Task [StartEvent_1](StartEvent_1) finish.(1ms)
17:51:24.437 [main] INFO oasis.model.activity.JavaServiceTask - Task [Activity_0kyozhb](가입) start.
17:51:24.446 [main] INFO oasis.executors.PlainJavaServiceTaskExecutable - Invoking class : [oasis.tutorials.springboot.domain.MemberService], method : [join]
17:51:24.483 [main] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of id
17:51:24.483 [main] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of name
17:51:24.484 [main] INFO oasis.model.activity.JavaServiceTask - Task [Activity_0kyozhb](가입) finish.(46ms)
17:51:24.484 [main] INFO oasis.model.activity.JavaServiceTask - Task [Activity_1amp5yv](조회) start.
17:51:24.484 [main] INFO oasis.executors.PlainJavaServiceTaskExecutable - Invoking class : [oasis.tutorials.springboot.domain.MemberService], method : [findMember]
17:51:24.485 [main] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of id
17:51:24.485 [main] INFO oasis.model.activity.JavaServiceTask - Task [Activity_1amp5yv](조회) finish.(0ms)
17:51:24.495 [main] INFO oasis.model.event.DefaultEndEvent - Task [Event_1xbdkg6](Event_1xbdkg6) start.
17:51:24.495 [main] INFO oasis.model.event.DefaultEndEvent - Task [Event_1xbdkg6](Event_1xbdkg6) finish.(0ms)
17:51:24.496 [main] INFO oasis.process.CoreProcessStarter - Process [Process_11oeyed](Process_11oeyed) finish.(61ms)
17:51:24.496 [main] INFO oasis.service.CoreServiceStarter - Service [joinMember] finish.(156ms)
```

### 위 테스트를 통해 알 수 있는 것

OASIS 서비스는 `ServiceStarter` 인터페이스를 통해서 실행합니다. `ServiceStarter` 는 *service id* 와 *서비스 컨텍스트*를 매개변수로 하는 `start` 메소드가 그 역할을 합니다. 서비스 ID는 곧 파일명입니다. 서비스 실행기는 서비스ID와 같은 파일명을 찾아서 실행할 것입니다. 위 프로젝트에서는 *services* 디렉토리에 저장을 했고 *services* 디렉토리는 서브 디렉토리로 구분해 놓을 수 있습니다. 

서비스 컨텍스트는 사용자 입력을 저장하고 있는 읽기 전용 컨텍스트입니다. 자세한 사항은 [Context](../Context.md) 페이지에서 더 학습할 수 있습니다.

서비스 수행 결과는 `ServiceResult` 객체로 반환되고 태스크에서 프로퍼티로 설정했던 속성 *output*의 값인 *joinedMember*를 키로 조회 태스크의 결과를 가져올 수 있습니다. 자세한 사항은 [Service Result](../Service%20Result.md) 페이지에서 더 확인할 수 있습니다.

`result` 메소드로 가져온 결과는 `TypedObject` 타입으로 반환되는데 이 타입은 실 객체와 실 객체의 타입 정보를 포함하는 클래스입니다. `getObject` 메소드로 실제 객체를 반환받을 수 있습니다.

# 웹 기능 구현

### 컨트롤러 만들기

HTTP 요청을 처리할 컨트롤러를 만들어 봅니다. `controller` 패키지를 만들고 `MemberServiceController` 클래스를 추가합니다.

```java
package oasis.tutorials.springboot.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import oasis.TypedObject;
import oasis.context.DefaultServiceContext;
import oasis.context.ServiceContext;
import oasis.service.ServiceResult;
import oasis.service.ServiceStarter;

@RestController
public class MemberServiceController {
	private final ServiceStarter serviceStarter;

	public MemberServiceController(ServiceStarter ss) {
		this.serviceStarter = ss;
	}
	
	@RequestMapping("/join")
	public TypedObject join(String id, String name) {
		Map<String, TypedObject> scc = new HashMap<>();
		scc.put("id", new TypedObject(id));
		scc.put("name", new TypedObject(name));

		ServiceContext sc = new DefaultServiceContext(scc);

		ServiceResult start = serviceStarter.start("joinMember", sc);

		return start.result("joinedMember");
	}
}
```

`join` 메소드는 앞선 테스트에서 OASIS 서비스 실행을 위해 작성했던 모습과 유사합니다. 입력값을 만들기 위한 서비스 컨텍스트를 만들고 서비스 ID와 서비스 컨텍스트를 서비스 실행기에 전달해서 OASIS 서비스를 실행합니다. 실행결과는 객체 그대로 반환하여 스프링이 오브젝트를 json으로 변환하여 반환하도록 합니다.

<aside>
💡 `@RestController` 로 선언한 스프링 컨트롤러에서 일반 객체를 반환하면 객체를 JSON 문자열로 변환하여 클라이언트로 반환합니다.

</aside>

`MemberServiceController` 는 `ServiceStater` 매개변수를 가진 생성자를 가지고 있습니다. 스프링 컨텍스트는 스프링 컨텍스트 내에 `ServiceStarter` 인스턴스가 있으면 그 인스턴스를 생성자로 전달할 것입니다. `MemberServiceController`가 정상적으로 동작하게 하기 위해서는 스프링 컨텍스트에 `ServiceStarter` 객체를 추가해야합니다.

`OasisConfig` 클래스를 만들어서 `ServiceStater`를 생성하는 Bean 설정을 해보도록 하겠습니다.

```java
package oasis.tutorials.springboot.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import oasis.factories.NonTransactionalServiceStarterFactory;
import oasis.service.ServiceStarter;

@Configuration
public class OasisConfig {
	@Bean
	public ServiceStarter serviceStarter() {
		ServiceStarter generateServiceStarter =
				new NonTransactionalServiceStarterFactory().generateServiceStarter();
		return generateServiceStarter;
	}
}
```

위 코드로 인해 스프링 컨테이너가 생성되면서 `ServiceStater` 빈을 스프링 컨텍스트에 추가할 것입니다.

*TutorialsSpringbootApplication.java* 파일을 열어서 프로젝트를 실행해 봅니다.

```
.   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::                (v2.5.4)

2021-08-31 13:40:43.978  INFO 9662 --- [           main] o.t.s.TutorialsSpringbootApplication     : Starting TutorialsSpringbootApplication using Java 1.8.0_291 on localhost with PID 9662 (~/workspace/tutorials-springboot/bin/main started by user in ~/workspace/tutorials-springboot)
2021-08-31 13:40:43.981  INFO 9662 --- [           main] o.t.s.TutorialsSpringbootApplication     : No active profile set, falling back to default profiles: default
2021-08-31 13:40:45.115  INFO 9662 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port(s): 8080 (http)
2021-08-31 13:40:45.128  INFO 9662 --- [           main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]
2021-08-31 13:40:45.129  INFO 9662 --- [           main] org.apache.catalina.core.StandardEngine  : Starting Servlet engine: [Apache Tomcat/9.0.52]
2021-08-31 13:40:45.209  INFO 9662 --- [           main] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring embedded WebApplicationContext
2021-08-31 13:40:45.209  INFO 9662 --- [           main] w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 1172 ms
2021-08-31 13:40:45.733  INFO 9662 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port(s): 8080 (http) with context path ''
2021-08-31 13:40:45.745  INFO 9662 --- [           main] o.t.s.TutorialsSpringbootApplication     : Started TutorialsSpringbootApplication in 2.401 seconds (JVM running for 2.962)
```

서버실행은 잘 됐습니다.

이제 웹 브라우저를 켜고 멤버를 추가하는 요청을 보내봅니다.

```
http://localhost:8080/join?id=1&name=hihi
```

```
2021-08-31 13:40:50.038  INFO 9662 --- [nio-8080-exec-1] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring DispatcherServlet 'dispatcherServlet'
2021-08-31 13:40:50.038  INFO 9662 --- [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Initializing Servlet 'dispatcherServlet'
2021-08-31 13:40:50.039  INFO 9662 --- [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Completed initialization in 1 ms
2021-08-31 13:40:50.079  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.service.CoreServiceStarter     : Service [joinMember] start.
2021-08-31 13:40:50.197  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.process.CoreProcessStarter     : Process [Process_11oeyed](Process_11oeyed) start.
2021-08-31 13:40:50.199  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.model.event.DefaultStartEvent  : Task [StartEvent_1](StartEvent_1) start.
2021-08-31 13:40:50.202  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.model.event.DefaultStartEvent  : Task [StartEvent_1](StartEvent_1) finish.(2ms)
2021-08-31 13:40:50.202  INFO 9662 --- [nio-8080-exec-1] c.d.o.model.activity.JavaServiceTask     : Task [Activity_0kyozhb](가입) start.
2021-08-31 13:40:50.217  INFO 9662 --- [nio-8080-exec-1] c.d.o.e.PlainJavaServiceTaskExecutable   : Invoking class : [oasis.tutorials.springboot.domain.MemberService], method : [join]
2021-08-31 13:40:50.230  INFO 9662 --- [nio-8080-exec-1] c.d.o.model.activity.JavaServiceTask     : Task [Activity_0kyozhb](가입) finish.(27ms)
2021-08-31 13:40:50.230  INFO 9662 --- [nio-8080-exec-1] c.d.o.model.activity.JavaServiceTask     : Task [Activity_1amp5yv](조회) start.
2021-08-31 13:40:50.230  INFO 9662 --- [nio-8080-exec-1] c.d.o.e.PlainJavaServiceTaskExecutable   : Invoking class : [oasis.tutorials.springboot.domain.MemberService], method : [findMember]
2021-08-31 13:40:50.231  INFO 9662 --- [nio-8080-exec-1] c.d.o.model.activity.JavaServiceTask     : Task [Activity_1amp5yv](조회) finish.(0ms)
2021-08-31 13:40:50.240  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.model.event.DefaultEndEvent    : Task [Event_1xbdkg6](Event_1xbdkg6) start.
2021-08-31 13:40:50.241  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.model.event.DefaultEndEvent    : Task [Event_1xbdkg6](Event_1xbdkg6) finish.(0ms)
2021-08-31 13:40:50.241  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.process.CoreProcessStarter     : Process [Process_11oeyed](Process_11oeyed) finish.(43ms)
2021-08-31 13:40:50.241  INFO 9662 --- [nio-8080-exec-1] c.d.oasis.service.CoreServiceStarter     : Service [joinMember] finish.(161ms)
```

로그를 확인해 보니 서비스는가 정상적으로 실행된 것을 알 수 있습니다. `join` 메서드는 서비스를 실행한 뒤에 실행결과 중 `joinMember`를 가져와서 반환합니다. 그에 대한 결과로

```
{"object":{"id":"1","name":"hihi"},"type":"oasis.tutorials.springboot.domain.Member"}
```

가 웹 브라우저에 출력이 됩니다.

`join` 메소드의 반환 타입은 `oasis.TypedObject` 입니다. 이 클래스는 내부에 `object`와 `type` 필드를 가지고 있습니다. 그래서 json 으로 변환된 결과에 *object* 와 *type* 키가 보입니다. *object*에 대한 값으로 등록 요청한 객체 정보가 보입니다. *object*의 실제 타입은 *type* 값에도 나와있듯이 위에서 만든 `Member` 클래스이고 그것에 대한 멤버 정보가 json으로 변환되었습니다. 이 결과를 보면 원하는데로 동작을 잘 한 것처럼 보입니다.

# 인프라 추상화

서버를 끄지 않고 다시 똑같은 요청을 다시 한번 보내보겠습니다.

```
http://localhost:8080/join?id=1&name=hihi
```

똑같은 결과가 반환됩니다. 이 결과는 같은 ID로 된 멤버를 추가할 수 없다는 비즈니스 규칙에 위배됩니다.

OASIS는 서비스 요청 내에서 새로운 자바 클래스 생성 요청을 받으면 새로 인스턴스를 만듭니다. 즉, 처음 요청으로 만들어진 `MemberService` 객체와 두 번째 호출했을 때 만들어진 `MemberService` 객체는 다른 객체입니다. 따라서 `MemberService` 내부에 존재하는 `members` 필드도 공유하지 않기 때문에 매 요청마다 새로운 멤버를 만들고 저장하고 사라지고, 만들고 저장하고 사라지고를 반복하게 됩니다.

`members`필드를 데이터베이스처럼 공유 가능한 저장소로 변환작업을 지금부터 시작해봅니다.

### MemberRepository

`Member`를 저장하고 찾을 수 있는 저장소 인터페이스를 만듭니다. 이 저장소는 데이터베이스를 추상화해서 실제 저장소 구현이 파일인지, 관계형 데이터베이스인지, 메모리 인지 비즈니스가 신경쓰지 않도록 경계를 그어줍니다. 이런 경계가 있으면 비즈니스 모델에 대한 테스트를 데이터베이스와 같이 인프라 계층에 대해 독립적으로 할 수 있습니다.

`domain` package에 `MemberRepositroy` interface를 추가합니다. 이 인터페이스는 `Member`를 저장하고 Id로 `Member`를 찾는 두 가지 기능만 제공합니다. 

```java
package oasis.tutorials.springboot.domain;

public interface MemberRepository {
	void save(Member member);
	Member findById(String id);

}
```

메모리에 멤버를 저장하는 `MemberRepository`를 구현합니다. `MemoryMemberRepository` 클래스를 만들어서 추가했습니다.

```java
package oasis.tutorials.springboot.domain;

import java.util.HashMap;
import java.util.Map;

public class MemoryMemberRepository implements MemberRepository {
	private final Map<String, Member> members = new HashMap<>();

	@Override
	public void save(Member member) {
		members.put(member.getId(), member);

	}

	@Override
	public Member findById(String id) {
		return members.get(id);
	}
}
```

간략하게 저장소 구현은 완료했습니다. 

### MemberRepository 사용하기

이제 이 저장소를 핵심 로직에서 사용할 수 있도록 `MemberService` 를 아래처럼 변경합니다.

```java
package oasis.tutorials.springboot.domain;

public class MemberService {
	private final MemberRepository memberRepository; // 변경

	public MemberService(MemberRepository memberRepository) { //변경
		this.memberRepository = memberRepository;
	}

	public void join(String id, String name) { //변경
		if (findMember(id) == null)
			memberRepository.save(new Member(id, name));
		else
			throw new RuntimeException(id + " 는 이미 존재하는 ID 입니다.");
	}

	public Member findMember(String id) { //변경
		return memberRepository.findById(id);
	}
}
```

`MemberService`는 `MemberRepositry`를 생성시 인자로 받아서 가지고 있다가 `join`이나 `findMember` 메소드에서 사용합니다. `MemberService`를 변경하면 앞서 만들었던 테스트도 컴파일 에러가 발생합니다. 테스트도 같이 바꿔봅니다.

```java
package oasis.tutorials.springboot.domain;

import java.util.HashMap;
import java.util.Map;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import oasis.TypedObject;
import oasis.context.DefaultServiceContext;
import oasis.context.ServiceContext;
import oasis.factories.NonTransactionalServiceStarterFactory;
import oasis.service.ServiceResult;
import oasis.service.ServiceStarter;

class MemberServiceTest {

	@Test
	void join() {
		MemberService memberService = new MemberService(new MemoryMemberRepository()); //변경
		memberService.join("1", "name");

		Member findMember = memberService.findMember("1");
		Assertions.assertThat(findMember).isNotNull();
	}

	@Test
	void rejectToJoinWhenAlreadyJoined() {
		MemberService memberService = new MemberService(new MemoryMemberRepository()); //변경
		memberService.join("1", "name");

		Assertions.assertThatExceptionOfType(RuntimeException.class).isThrownBy(() -> memberService.join("1", "name"));
	}

	@Test
	void runWithOasis() {
		ServiceStarter serviceStater = 
				new NonTransactionalServiceStarterFactory().generateServiceStarter();
		
		
		Map<String, TypedObject> acc = new HashMap<>(); //변경
		acc.put("memberRepository",new TypedObject (new MemoryMemberRepository())); //변경
		
		ApplicationContext applicationContext = new DefaultApplicationContext(acc); //변경
		
		Map<String, TypedObject> scc = new HashMap<>();
		scc.put("id", new TypedObject("id1"));
		scc.put("name", new TypedObject("newMemberName"));
	
		ServiceContext sc = new DefaultServiceContext(applicationContext, scc); //변경

		ServiceResult start = serviceStater.start("joinMember", sc);
		TypedObject result = start.result("joinedMember");
		Member object = result.getObject(Member.class);
		
		Assertions.assertThat(object.getName()).isEqualTo("newMemberName");
	}
}
```

`join`과 `rejectToJoinWhenAlreadyJoined` 테스트 케이스에서 `MemberService` 를 생성할 때 `new MemoryMemberRepository()` 를 넘기도록 변경하였습니다.

`runWithOasis` 테스트 케이스에서 `MemoryMemberRepository` 를 애플리케이션 컨텍스트에 넣는 구문을 추가하였습니다.

### 스프링 컨텍스트와 OASIS 컨텍스트 연결

유사하게 MemberServiceController 에서 Spring의 컨텍스트를 인식해서 스프링 컨텍스트에 등록한 `MemberRepository` 를 찾을 수 있도록 변경합니다.

```java
package oasis.tutorials.springboot.controller;

import java.util.HashMap;
import java.util.Map;

import oasis.context.SpringApplicationContext;
import org.springframework.context.ApplicationContext;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import oasis.TypedObject;
import oasis.context.DefaultServiceContext;
import oasis.context.ServiceContext;
import oasis.service.ServiceResult;
import oasis.service.ServiceStarter;

@RestController
public class MemberServiceController {

    private final ServiceStarter serviceStarter;
    private final ApplicationContext springApplicationContext; //변경

    public MemberServiceController(ServiceStarter ss, ApplicationContext springApplicationContext) { //변경
        this.serviceStarter = ss;
        this.springApplicationContext = springApplicationContext;
    }

    @RequestMapping("/join")
    public TypedObject join(String id, String name) {
        oasis.context.ApplicationContext applicationContext //변경
                = new SpringApplicationContext(springApplicationContext); //변경

        Map<String, TypedObject> scc = new HashMap<>();
        scc.put("id", new TypedObject(id));
        scc.put("name", new TypedObject(name));

        ServiceContext sc = new DefaultServiceContext(applicationContext, scc); //변경

        ServiceResult start = serviceStarter.start("joinMember", sc);

        return start.result("joinedMember");
    }
}
```

<aside>
💡 Spring의 `ApplicationContext`와 OASIS의 `ApplicationContext`가 이름이 동일하므로 **유의**합니다.

</aside>

### 저장소 스프링 컨텍스트에 등록

이제 힘들게 만든 `MemberRepositry` 를 스프링 컨텍스트에 등록해서 MemberService가 생성될 때 참조받도록 합니다. OasisConfig 에 추가하겠습니다.

```java
@Bean
	public MemberRepository memberRepositry() {
		return new MemoryMemberRepository();
	}
```

### 실행

이제 프로젝트를 실행하여 똑같은 요청을 두 번 실행해 봅니다. 처음 요청은 이전과 같이 잘 수행됩니다. 똑같은 요청을 다시 보내보면 `MemberService` 에 정의한 대로 `RuntimeException` 이 발생함을 알 수 있습니다.

# 정리하면

이 튜토리얼에서는 핵심 비즈니스를 구현하고 핵심 비즈니스를 어떻게 OASIS와 연동하는지, 그리고 스프링과 어떻게 같이 사용할 수 있는지 알아보았습니다.

사실 이 튜토리얼의 핵심 메시지는 OASIS 사용법 보다

> **스프링과 OASIS와 핵심로직은 서로 의존하지 않는다**
> 

 입니다.

핵심 로직을 만들고 개별로 테스트를 하였고, 핵심 로직과 OASIS 와 연동한 상태에서 또 테스트를 했습니다. 즉 모든 계층에서 개별로 테스트 가능하고 다른 기술로 변경이 가능합니다. 마지막에 Repositroy를 분리시킨것은 핵심로직과 인프라 계층을 어떻게 분리시키는지 보여드리기 위한 연습이었습니다. 이렇게 인프라를 핵심로직과 분리 시키는 것은 아주 중요합니다. 핵심 로직이 인프라 기술에 의존하고 있으면 인프라 기술적인 문제에 매우 취약할뿐만 아니라 테스트가 크게 힘들어 집니다. 이렇게 계층간 경계를 명확하게 함으로써 확장에 유연하고 변경에 따른 부작용 전파가 적은 서비스를 개발할 수 있습니다.

OASIS는 핵심 로직간의 메시지가 어떻게 흘러가는지 시각적으로 확인하며 서비스를 개발할 수 있도록 도와주는 도구입니다. 다음 튜토리얼은 핵심 로직간 메시지 흐름을 어떻게 효과적으로 표현하면서 구현하는지에 대해 알아봅니다.