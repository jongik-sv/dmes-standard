# Looping

태스크의 Sequential Multi Instance 나 Loop 마커를 추가하면 그 태스크는 순회하며 실행된다.

![Untitled](Looping/Untitled.png)

### 실행결과

실행결과는 Extentions의 property에 `output` Property를 지정하여 받아올 수 있다. `List<TypedObject>` 는 실행결과의 타입이다.

# Sequential Multi Instance

어떤 데이터를 대상으로 순회할 지 *Collection* 속성과 요소의 이름은 무엇으로 할지 *Element Variable* 속성을 입력하여 실행한다.

태스크에서는 다른 컨텍스트 데이터는 동일하게 접근 가능하지만 컬렉션 속성으로 지정한 데이터는 직접 접근이 불가하고 지정한 요소의 이름으로 요소만 접근 가능하다.

![Untitled](Looping/Untitled%201.png)

<aside>
💡 **Element Variable**을 입력하지 않으면 unpack을 시도한다. 맵이거나 플레인 오브젝트(컬렉션, String, Integer 등) 인 경우만 가능하다.

</aside>

<aside>
💡 **Element Variable** 에 `spyDto:sequential.SpyDto` 와 같이 `이름:타입` 을 입력하면 반복 요소의 데이터를 지정한 타입으로 변환 후 지정한 이름으로 반복 태스크에서 사용한다. 단, 컬렉션의 요소가 `Map`이어야 한다.

</aside>

# Loop

모든 기능과 제약사항은 *Sequential Multi Instance* 와 동일하다. 다만 컬렉션과 컬렉션 요소이름을 `iter` 프로퍼티로 지정하는 것이 다르다.

아래는 이름 목록을 가지고 있는 리스트가 서비스 컨텍스트에 존재할 때 Loop 를 사용한 예이다.

*Loop* maker는 *General* 탭에 속성 지정란이 없어 *Extensions* 탭에서 `iter` 속성을 지정해야 한다.

![Untitled](Looping/Untitled%202.png)

`iter` 프로퍼티를 추가 후 `names -> name` 을 입력한다. `names` 는 *Sequential Multi Instance* 의 *Collection* 속성값과 같고 `name` 은 *Element Variable* 과 같다.

![Untitled](Looping/Untitled%203.png)

> loop→oasis.Loop#loopMaker()
> 

# input

Input/Output 탭에서 input 값을 지정한 경우 모든 반복요소 수행시 입력값으로 사용한다.