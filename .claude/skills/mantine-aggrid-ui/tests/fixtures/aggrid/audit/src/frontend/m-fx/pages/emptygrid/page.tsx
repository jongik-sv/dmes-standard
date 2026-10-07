export default function Page() {
  return (
    <div>
      {rows.length === 0 ? (
        <p>없음</p>
      ) : (
        <AgDataGrid rows={rows} />
      )}
      {rows.length > 0 ? (<AgDataGrid rows={rows} />) : (<p>none</p>)}
      {rows.length !== 0 ? (
        <AgDataGrid rows={rows} />
      ) : null}
      {rows.length < 1 ? (<AgDataGrid />) : (<AgDataGrid />)}
      {items.length ? (<AgDataGrid />) : (<p />)}
      {rows.length == 0 ? <p /> : (<div />)}
      {a.length > 0 ? (<b>(</b>) : (<AgDataGrid />)}
    </div>
  );
}
