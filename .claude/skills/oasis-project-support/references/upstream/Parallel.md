# Parallel

*ParrellelGateway*나 *Parrellel Multi Instance* 마커를 이용해서 태스크를 병렬로 실행할 수 있다. 

<aside>
💡 병렬로 실행시 메인 스레드가 아닌 서브 스레드로 실행 되므로 트랜잭션이 유지 되지 않는다.

</aside>

# ParrellelGateway

병렬 게이트웨이로 분기된 흐름은 **인라인 서브 프로세스**이어야 한다. 서브 프로세스는 독립적으로 수행한 뒤에 병렬 게이트웨이로 다시 수렴한다.

![Untitled](Parallel/Untitled.png)

# Parallel Multi Instance

속성에 지정한 데이터를 병렬로 실행한다. 

예컨데 컨텍스트에 `names` 라는 이름으로 저장되어 있는 `List<String>` 타입 데이터가 있을 때 `names` 의 요소를 하나씩 가져와서 병렬 처리 태스크의 입력값으로 제공하며 실행한다. 이때 입력값으로 제공한 데이터의 이름은 `name` 으로 한다.

![Untitled](Parallel/Untitled%201.png)