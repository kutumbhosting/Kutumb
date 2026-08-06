import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as any) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

interface ColumnDef {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

// Renders one form control appropriate to a column's Postgres type, and
// converts its value back to something the API can bind correctly:
//  - boolean        -> checkbox, real true/false
//  - ARRAY          -> comma-separated text, split into a real array
//  - integer/numeric -> number input, coerced to a JS number
//  - json/jsonb      -> textarea of raw JSON text (Postgres casts it)
//  - everything else -> plain text input
function FieldEditor({
  column,
  value,
  onChange,
}: {
  column: ColumnDef;
  value: any;
  onChange: (v: any) => void;
}) {
  if (column.data_type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true || value === "true"}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (column.data_type === "ARRAY") {
    const text = Array.isArray(value) ? value.join(", ") : value || "";
    return (
      <Input
        value={text}
        placeholder="comma, separated, values"
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    );
  }
  if (column.data_type === "json" || column.data_type === "jsonb") {
    return (
      <textarea
        className="w-full border rounded p-1.5 text-xs font-mono bg-background"
        rows={2}
        value={typeof value === "string" ? value : JSON.stringify(value ?? {})}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (["integer", "bigint", "numeric", "smallint", "real", "double precision"].includes(column.data_type)) {
    return (
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }
  return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function displayValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function DatabaseTables() {
  const { toast } = useToast();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [primaryKey, setPrimaryKey] = useState("id");
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editingPk, setEditingPk] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, any>>({});

  useEffect(() => {
    api("/api/db-tables/tables").then(setTables).catch((err) =>
      toast({ title: "Couldn't load table list", description: err.message, variant: "destructive" })
    );
  }, []);

  const loadTable = async (table: string) => {
    if (!table) return;
    setLoading(true);
    setShowAddForm(false);
    setEditingPk(null);
    try {
      const result = await api(`/api/db-tables/tables/${table}`);
      setColumns(result.columns);
      setRows(result.rows);
      setPrimaryKey(result.primaryKey);
      setTruncated(result.truncated);
    } catch (err: any) {
      toast({ title: "Couldn't load table", description: err.message, variant: "destructive" });
      setColumns([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedTable) loadTable(selectedTable); }, [selectedTable]);

  const startEdit = (row: any) => {
    setEditingPk(String(row[primaryKey]));
    setEditValues({ ...row });
  };

  const saveEdit = async () => {
    try {
      await api(`/api/db-tables/tables/${selectedTable}/${editingPk}`, {
        method: "PUT",
        body: JSON.stringify(editValues),
      });
      toast({ title: "Row updated" });
      setEditingPk(null);
      loadTable(selectedTable);
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const deleteRow = async (row: any) => {
    if (!confirm(`Delete this row from ${selectedTable}? This can't be undone.`)) return;
    try {
      await api(`/api/db-tables/tables/${selectedTable}/${row[primaryKey]}`, { method: "DELETE" });
      toast({ title: "Row deleted" });
      loadTable(selectedTable);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const createRow = async () => {
    try {
      await api(`/api/db-tables/tables/${selectedTable}`, {
        method: "POST",
        body: JSON.stringify(newRow),
      });
      toast({ title: "Row created" });
      setNewRow({});
      setShowAddForm(false);
      loadTable(selectedTable);
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    }
  };

  const creatableColumns = columns.filter((c) => c.column_name !== primaryKey);

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <Label>Table</Label>
        <select
          className="w-full mt-1 p-2 border rounded text-foreground bg-background"
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
        >
          <option value="">-- Choose a table --</option>
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Admin Users, Settings, and Media Files are managed on their own tabs instead of here, for safety.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {selectedTable && !loading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"}{truncated ? " (showing first 500)" : ""}
            </p>
            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? "Cancel" : "+ Add row"}
            </Button>
          </div>

          {showAddForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="font-semibold text-sm">New row in {selectedTable}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {creatableColumns.map((col) => (
                  <div key={col.column_name}>
                    <Label className="text-xs">{col.column_name}{col.is_nullable === "NO" && !col.column_default && " *"}</Label>
                    <FieldEditor
                      column={col}
                      value={newRow[col.column_name]}
                      onChange={(v) => setNewRow({ ...newRow, [col.column_name]: v })}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={createRow}>Create row</Button>
            </div>
          )}

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b bg-muted/50">
                  {columns.map((col) => (
                    <th key={col.column_name} className="px-2 py-2 whitespace-nowrap font-semibold">{col.column_name}</th>
                  ))}
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingPk === String(row[primaryKey]);
                  return (
                    <tr key={row[primaryKey]} className="border-b hover:bg-muted/20">
                      {columns.map((col) => (
                        <td key={col.column_name} className="px-2 py-1.5 max-w-[220px]">
                          {isEditing && col.column_name !== primaryKey ? (
                            <FieldEditor
                              column={col}
                              value={editValues[col.column_name]}
                              onChange={(v) => setEditValues({ ...editValues, [col.column_name]: v })}
                            />
                          ) : (
                            <span className="block truncate" title={displayValue(row[col.column_name])}>
                              {displayValue(row[col.column_name])}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button size="sm" onClick={saveEdit}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingPk(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => startEdit(row)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteRow(row)}>Delete</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="px-2 py-4 text-center text-muted-foreground">No rows yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
