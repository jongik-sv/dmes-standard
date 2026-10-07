---
product: "AG Grid"
title: "Column Definitions"
description: "Column Definitions define each column within the React Data Grid. Configure and update column properties individually or apply defaults to all columns."
framework: react
version: "36.2.0"
related:
    - title: "Updating Definitions"
      url: "https://www.ag-grid.com/react-data-grid/column-updating-definitions/"
    - title: "Auto-Generate Columns"
      url: "https://www.ag-grid.com/react-data-grid/auto-generate-columns/"
    - title: "Column State"
      url: "https://www.ag-grid.com/react-data-grid/column-state/"
llms: "https://www.ag-grid.com/llms.txt"
---

# Column Definitions

Each column in the grid is defined using a Column Definition (`ColDef`). Columns are positioned in the grid according to the order the Column Definitions are specified in the Grid Options.

[React Column Definitions](https://www.youtube.com/watch?v=aDCepyF_DUY)

#### Simple Definitions

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
import {
  ClientSideRowModelModule,
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  ModuleRegistry,
  enableDevValidations,
} from "ag-grid-community";
import { IOlympicData } from "./interfaces";
import { useFetchJson } from "./useFetchJson";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [ClientSideRowModelModule];

const GridExample = () => {
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  const [columnDefs, setColumnDefs] = useState<ColDef[]>([
    { field: "athlete" },
    { field: "sport" },
    { field: "age" },
  ]);

  const { data, loading } = useFetchJson<IOlympicData>(
    "https://www.ag-grid.com/example-assets/olympic-winners.json",
  );

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div style={{ height: "100%", boxSizing: "border-box" }}>
          <div style={gridStyle}>
            <AgGridReact<IOlympicData>
              rowData={data}
              loading={loading}
              columnDefs={columnDefs}
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

[Live example: Simple Definitions](https://www.ag-grid.com/examples/column-definitions/simple/reactFunctionalTs/)

```jsx
const [columnDefs, setColumnDefs] = useState([
    { field: 'athlete' },
    { field: 'sport' },
    { field: 'age' }
]);

<AgGridReact columnDefs={columnDefs} />
```

See [Column Options](https://www.ag-grid.com/react-data-grid/column-properties/) for all available properties.

## Column Defaults

Use `defaultColDef` to set properties across ALL Columns.

```jsx
const defaultColDef = useMemo(() => { 
	return {
        width: 150,
        cellStyle: { fontWeight: 'bold' },
    };
}, []);

<AgGridReact defaultColDef={defaultColDef} />
```

#### Default Col Def

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
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  ModuleRegistry,
  enableDevValidations,
} from "ag-grid-community";
import { IOlympicData } from "./interfaces";
import { useFetchJson } from "./useFetchJson";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [CellStyleModule, ClientSideRowModelModule];

const GridExample = () => {
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  const [columnDefs, setColumnDefs] = useState<ColDef[]>([
    { field: "athlete" },
    { field: "sport" },
    { field: "age" },
  ]);
  const defaultColDef = useMemo<ColDef>(() => {
    return {
      width: 150,
      cellStyle: { fontWeight: "bold" },
    };
  }, []);

  const { data, loading } = useFetchJson<IOlympicData>(
    "https://www.ag-grid.com/example-assets/olympic-winners.json",
  );

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div style={{ height: "100%", boxSizing: "border-box" }}>
          <div style={gridStyle}>
            <AgGridReact<IOlympicData>
              rowData={data}
              loading={loading}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
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

[Live example: Default Col Def](https://www.ag-grid.com/examples/column-definitions/default-col-def/reactFunctionalTs/)

## Cell Data Types

The grid provides built-in [Cell Data Types](https://www.ag-grid.com/react-data-grid/cell-data-types/) for common data types such as `text`, `number`, `boolean`, `date` and more. By default these types are [inferred](https://www.ag-grid.com/react-data-grid/cell-data-types/#inferring-data-types) from the row data and configure appropriate rendering, editing, filtering, and sorting behaviour for each column without the need for explicit configuration via `columnDefs`.

## Column Types

Use `columnTypes` to define a set of Column properties to be applied together. The properties in a column type are applied to a Column by setting its `type` property.

```jsx
// Define column types
const columnTypes = useMemo(() => { 
	return {
        currency: {
            width: 150,
            valueFormatter: currencyFormatter
        },
        shaded: {
            cellClass: 'shaded-class'
        }
    };
}, []);
const [columnDefs, setColumnDefs] = useState([
    { field: 'productName'},

    // uses properties from currency type
    { field: 'boughtPrice', type: 'currency'},

    // uses properties from currency AND shaded types
    { field: 'soldPrice', type: ['currency', 'shaded'] },
]);

<AgGridReact
    columnTypes={columnTypes}
    columnDefs={columnDefs}
/>
```

> **Note**
>
> Column Types work on Columns only and not Column Groups.

The below example shows Column Types.

#### Column Definition Example

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
  CellStyleModule,
  ClientSideRowModelModule,
  ColDef,
  ColGroupDef,
  ColTypeDefs,
  GridApi,
  GridOptions,
  ModuleRegistry,
  ValueFormatterParams,
  enableDevValidations,
} from "ag-grid-community";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [CellStyleModule, ClientSideRowModelModule];

interface SalesRecord {
  productName: string;
  boughtPrice: number;
  soldPrice: number;
}

function currencyFormatter(params: ValueFormatterParams) {
  const value = Math.floor(params.value);
  if (isNaN(value)) {
    return "";
  }
  return "£" + value.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

const GridExample = () => {
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);
  const [rowData, setRowData] = useState<SalesRecord[]>([
    { productName: "Lamp", boughtPrice: 100, soldPrice: 200 },
    { productName: "Chair", boughtPrice: 150, soldPrice: 300 },
    { productName: "Desk", boughtPrice: 200, soldPrice: 400 },
  ]);
  const columnTypes = useMemo<ColTypeDefs>(() => {
    return {
      currency: {
        width: 150,
        valueFormatter: currencyFormatter,
      },
      shaded: {
        cellClass: "shaded-class",
      },
    };
  }, []);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([
    { field: "productName" },
    // uses properties from currency type
    { field: "boughtPrice", type: "currency" },
    // uses properties from currency AND shaded types
    { field: "soldPrice", type: ["currency", "shaded"] },
  ]);

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div style={{ height: "100%", boxSizing: "border-box" }}>
          <div style={gridStyle}>
            <AgGridReact<SalesRecord>
              rowData={rowData}
              columnTypes={columnTypes}
              columnDefs={columnDefs}
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

[Live example: Column Definition Example](https://www.ag-grid.com/examples/column-definitions/column-types/reactFunctionalTs/)

## Provided Column Types

The grid provides the Column Types `rightAligned` and `numericColumn`. Both of these types right align the header and cell contents by applying CSS classes `ag-right-aligned-header` to Column Headers and `ag-right-aligned-cell` to Cells.

```jsx
const [columnDefs, setColumnDefs] = useState([
    { headerName: 'Column A', field: 'a' },
    { headerName: 'Column B', field: 'b', type: 'rightAligned' },
    { headerName: 'Column C', field: 'c', type: 'numericColumn' },
]);

<AgGridReact columnDefs={columnDefs} />
```

> **Note**
>
> The provided column types use cell classes to apply styling. The `CellStyleModule` is required for these types to work correctly.

## Updating Columns

Columns can be controlled by updating the column state, or updating the column definition.

[Column State](https://www.ag-grid.com/react-data-grid/column-state/) should be used when restoring a users grid, for example saving and restoring column widths.

Column Definitions should be updated to modify properties that the user cannot control, and as such are not supported by Column State. Whilst column definitions can be used to change stateful properties, this can cause additional side effects.

### Using Column State

The [Grid Api](https://www.ag-grid.com/react-data-grid/grid-api/#reference-state-applyColumnState) function `applyColumnState` can be used to update [Column State](https://www.ag-grid.com/react-data-grid/column-state/).

```jsx
// Sort Athlete column ascending
gridApi.applyColumnState({
    state: [
        {
            colId: 'athlete',
            sort: 'asc'
        }
    ]
});
```

In the example below, use the 'Sort Athlete' button to apply a column state.

#### Column State

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
  AutoSizeStrategy,
  ClientSideRowModelModule,
  ColDef,
  ColGroupDef,
  ColumnApiModule,
  ColumnAutoSizeModule,
  GridApi,
  GridOptions,
  ModuleRegistry,
  enableDevValidations,
} from "ag-grid-community";
import { IOlympicData } from "./interfaces";
import { useFetchJson } from "./useFetchJson";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [
  ColumnApiModule,
  ColumnAutoSizeModule,
  ClientSideRowModelModule,
];

const GridExample = () => {
  const gridRef = useRef<AgGridReact<IOlympicData>>(null);
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);

  const [columnDefs, setColumnDefs] = useState<ColDef[]>([
    { field: "athlete" },
    { field: "age" },
    { field: "country" },
    { field: "sport" },
  ]);
  const autoSizeStrategy = useMemo<AutoSizeStrategy>(() => {
    return {
      type: "fitGridWidth",
    };
  }, []);

  const { data, loading } = useFetchJson<IOlympicData>(
    "https://www.ag-grid.com/example-assets/small-olympic-winners.json",
  );

  const onBtSortAthlete = useCallback(() => {
    gridRef.current!.api.applyColumnState({
      state: [{ colId: "athlete", sort: "asc" }],
    });
  }, []);

  const onBtClearAllSorting = useCallback(() => {
    gridRef.current!.api.applyColumnState({
      defaultState: { sort: null },
    });
  }, []);

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div className="test-container">
          <div className="test-header">
            <button onClick={onBtSortAthlete}>Sort Athlete</button>
            <button onClick={onBtClearAllSorting}>Clear All Sorting</button>
          </div>

          <div style={gridStyle}>
            <AgGridReact<IOlympicData>
              ref={gridRef}
              rowData={data}
              loading={loading}
              columnDefs={columnDefs}
              autoSizeStrategy={autoSizeStrategy}
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

[Live example: Column State](https://www.ag-grid.com/examples/column-definitions/column-state/reactFunctionalTs/)

### Updating Column Definitions

To update an attribute by [Updating Column Definitions](https://www.ag-grid.com/react-data-grid/column-updating-definitions/#changing-column-definition), pass a new array of [Column Definitions](https://www.ag-grid.com/react-data-grid/column-definitions/) to the grid options.

```
// Supply new column definitions to the grid
setColumnDefs([
  { field: 'athlete', headerName: 'C1' },
  { field: 'age', headerName: 'C2' },
  { field: 'country', headerName: 'C3' },
  { field: 'sport', headerName: 'C4' },
]);
```

In the example below, use the 'Update Header Names' button to update the column definitions.

#### Column Definition Update

```tsx
'use client';
import { useFetchJson } from './useFetchJson';
import React, {
  StrictMode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import type { ColDef, SizeColumnsToFitGridStrategy } from "ag-grid-community";
import {
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  enableDevValidations,
} from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";

import type { IOlympicData } from "./interfaces";
import "./styles.css";

if (process.env.NODE_ENV !== "production") {
  // Enable extended validations only for development
  enableDevValidations();
}

const modules = [ColumnAutoSizeModule, ClientSideRowModelModule];

const columnDefinitions: ColDef[] = [
  { field: "athlete" },
  { field: "age" },
  { field: "country" },
  { field: "sport" },
];

const updatedHeaderColumnDefs: ColDef[] = [
  { field: "athlete", headerName: "C1" },
  { field: "age", headerName: "C2" },
  { field: "country", headerName: "C3" },
  { field: "sport", headerName: "C4" },
];

const GridExample = () => {
  const gridRef = useRef<AgGridReact<IOlympicData>>(null);
  const containerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);
  const gridStyle = useMemo(() => ({ height: "100%", width: "100%" }), []);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>(columnDefinitions);
  const autoSizeStrategy = useMemo<SizeColumnsToFitGridStrategy>(
    () => ({
      type: "fitGridWidth",
    }),
    [],
  );

  const { data, loading } = useFetchJson<IOlympicData>(
    "https://www.ag-grid.com/example-assets/small-olympic-winners.json",
  );

  const onBtUpdateHeaders = useCallback(() => {
    setColumnDefs(updatedHeaderColumnDefs);
  }, []);

  const onBtRestoreHeaders = useCallback(() => {
    setColumnDefs(columnDefinitions);
  }, []);

  return (
    <AgGridProvider modules={modules}>
      <div style={containerStyle}>
        <div className="test-container">
          <div className="test-header">
            <button onClick={onBtUpdateHeaders}>Update Header Names</button>
            <button onClick={onBtRestoreHeaders}>
              Restore Original Column Definitions
            </button>
          </div>
          <div style={gridStyle}>
            <AgGridReact<IOlympicData>
              ref={gridRef}
              rowData={data}
              loading={loading}
              columnDefs={columnDefs}
              autoSizeStrategy={autoSizeStrategy}
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

[Live example: Column Definition Update](https://www.ag-grid.com/examples/column-definitions/column-definition-update/reactFunctionalTs/)
