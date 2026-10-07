export default function Page() {
  return (
    <div>
      {rows.length === 0 && <p>데이터가 없다</p>}
      {rows.length > 0 && (
        <AgDataGrid rows={rows} />
      )}
      {list.length !== 0 && !loading && <AgDataGrid rows={list} />}
      {list.length === 0 && (<p>빈 목록</p>)}
      {other.length > 0 && (<div />)}
    </div>
  );
}
