---
product: "AG Grid"
title: "Row Selection"
description: "Configure row selection, checkbox selection, and group selection in the React Table. Single row selection, multiple row selection, and multi select with click."
framework: react
version: "36.2.0"
related:
    - title: "Cell Selection"
      url: "https://www.ag-grid.com/react-data-grid/cell-selection/"
llms: "https://www.ag-grid.com/llms.txt"
---

# Row Selection

Configure the grid to allow users to select rows by clicking them, focusing a row and pressing `␣ Space` or via API.

## Enabling Row Selection

Row selection is configured with the `rowSelection` grid property. Setting `rowSelection.mode` to either `'multiRow'` or `'singleRow'` will allow you to select rows by clicking, focusing a row and pressing `␣ Space`, or via the selection API.

```jsx
const rowSelection = useMemo(() => { 
	return {
        mode: 'singleRow',
    };
}, []);

<AgGridReact rowSelection={rowSelection} />
```

The following example illustrates a basic row selection configuration. Use the select control to choose the default single row or multi-row configuration.

See detailed documentation on the two row selection modes:

- [Single Row Selection](https://www.ag-grid.com/react-data-grid/row-selection-single-row/)
- [Multi-Row Selection](https://www.ag-grid.com/react-data-grid/row-selection-multi-row/)

#### Enabling Row Selection

```tsx
"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  StrictMode,
} from "react";
import { createRoot } from "react-dom/client";
import { AgGridReact, AgGridProvider } from "ag-grid-react";
import "./styles.css";
import {
  ClientSideRowModelModule,
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  ModuleRegistry,
  RowSelectionMode,
  RowSelectionModule,
  RowSelectionOptions,
  enableDevValidations,
} from "ag-grid-community";
import {
  ColumnMenuModule,
  ColumnsToolPanelModule,
  ContextMenuModule,
  RowGroupingModule,
} from "ag-grid-enterprise";
import { IOlympicData } from "./interfaces";
import { useFetchJson } from "./useFetchJson";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [
  RowSelectionModule,
  ClientSideRowModelModule,
  ColumnsToolPanelModule,
  ColumnMenuModule,
  ContextMenuModule,
  RowGroupingModule,
];

const getSelectValue: (id: string) => RowSelectionMode = (id: string) => {
  return (
    (document.querySelector<HTMLSelectElement>(id)
      ?.value as RowSelectionMode) ?? "singleRow"
  );
};

const GridExample = () => {
  const gridRef = useRef<AgGridReact<IOlympicData>>(null);
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  const [columnDefs, setColumnDefs] = useState<ColDef[]>([
    { field: "athlete", minWidth: 150 },
    { field: "age", maxWidth: 90 },
    { field: "country", minWidth: 150 },
    { field: "year", maxWidth: 90 },
    { field: "date", minWidth: 150 },
    { field: "sport", minWidth: 150 },
    { field: "gold" },
    { field: "silver" },
    { field: "bronze" },
    { field: "total" },
  ]);
  const defaultColDef = useMemo<ColDef>(() => {
    return {
      flex: 1,
      minWidth: 100,
    };
  }, []);
  const rowSelection = useMemo<
    RowSelectionOptions | "single" | "multiple"
  >(() => {
    return {
      mode: "singleRow",
    };
  }, []);

  const { data, loading } = useFetchJson<IOlympicData>(
    "https://www.ag-grid.com/example-assets/small-olympic-winners.json",
  );

  const updateSelectionOptions = useCallback(() => {
    gridRef.current!.api.setGridOption("rowSelection", {
      mode: getSelectValue("#input-selection-mode"),
    });
  }, []);

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div className="example-wrapper">
          <div className="example-header">
            <label>
              <span>Selection mode: </span>
              <select
                id="input-selection-mode"
                onChange={updateSelectionOptions}
              >
                <option value="singleRow">singleRow</option>
                <option value="multiRow">multiRow</option>
              </select>
            </label>
          </div>

          <div style={gridStyle}>
            <AgGridReact<IOlympicData>
              ref={gridRef}
              rowData={data}
              loading={loading}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowSelection={rowSelection}
            />
          </div>
        </div>
      </div>
    </AgGridProvider>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <GridExample />
  </StrictMode>,
);
```

[Live example: Enabling Row Selection](https://www.ag-grid.com/examples/row-selection/enabling-row-selection/reactFunctionalTs/)

## Row Selection with Enterprise Features

Row selection can be used when using row grouping, tree data and the server-side row model. See the respective sections of the documentation:

- [Row Group Selection](https://www.ag-grid.com/react-data-grid/grouping-row-selection/)
- [Tree Data Selection](https://www.ag-grid.com/react-data-grid/tree-data-selection/)
- [Server-Side Row Model Selection](https://www.ag-grid.com/react-data-grid/server-side-model-selection/)
