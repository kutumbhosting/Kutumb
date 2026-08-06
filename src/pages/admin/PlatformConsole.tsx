import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type SettingRow = { group: string; key: string; label: string; secret: boolean; value: string; hasValue: boolean };

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as any) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

function SettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = () => api("/api/admin-console/settings").then(setSettings).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (key: string) => {
    const value = edits[key];
    if (value === undefined) return;
    try {
      await api(`/api/admin-console/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
      toast({ title: "Saved" });
      setEdits({ ...edits, [key]: undefined as any });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const clear = async (key: string) => {
    if (!confirm("Clear this key?")) return;
    await api(`/api/admin-console/settings/${key}`, { method: "DELETE" });
    toast({ title: "Cleared" });
    load();
  };

  const groups = Array.from(new Set(settings.map((s) => s.group)));

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group}>
          <h3 className="font-bold text-lg mb-3">{group}</h3>
          <div className="space-y-3">
            {settings.filter((s) => s.group === group).map((s) => (
              <div key={s.key} className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <Label>{s.label}{s.secret && s.hasValue && " (set — hidden)"}</Label>
                  <Input
                    type={s.secret ? "password" : "text"}
                    placeholder={s.secret ? "••••••••" : ""}
                    value={edits[s.key] ?? (s.secret ? "" : s.value)}
                    onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}
                  />
                </div>
                <Button size="sm" onClick={() => save(s.key)}>Save</Button>
                {s.hasValue && <Button size="sm" variant="outline" onClick={() => clear(s.key)}>Clear</Button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminUsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const load = () => api("/api/admin-console/admin-users").then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) return;
    try {
      await api("/api/admin-console/admin-users", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Admin user created" });
      setForm({ name: "", email: "", password: "" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const del = async (id: number) => {
    if (!confirm("Delete this admin user?")) return;
    try {
      await api(`/api/admin-console/admin-users/${id}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap items-end">
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <Button onClick={create}>Add admin</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td><Button size="sm" variant="destructive" onClick={() => del(u.id)}>Delete</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/api/admin-console/audit-log").then(setRows).catch(() => {}); }, []);
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left border-b"><th className="py-2">When</th><th>Admin</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b">
            <td className="py-2">{new Date(r.created_at).toLocaleString()}</td>
            <td>{r.admin_email}</td>
            <td>{r.action}</td>
            <td>{r.entity || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DatabaseTab() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ current: string | null; connected: boolean } | null>(null);
  const [newConnStr, setNewConnStr] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const load = () => api("/api/admin-console/database").then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  const test = async () => {
    if (!newConnStr.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api("/api/admin-console/database/test", { method: "POST", body: JSON.stringify({ connectionString: newConnStr }) });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!newConnStr.trim()) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await api("/api/admin-console/database", { method: "PUT", body: JSON.stringify({ connectionString: newConnStr }) });
      setSaveResult(result.message);
      toast({ title: "Saved", description: "Restart the server for this to take effect." });
      setNewConnStr("");
      setTestResult(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="font-bold text-lg mb-2">Current connection</h3>
        {status ? (
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${status.connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm">{status.connected ? "Connected" : "Not connected"}</span>
            <span className="text-sm text-muted-foreground font-mono">{status.current || "(not set)"}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
      </div>

      <div className="border-t pt-6">
        <h3 className="font-bold text-lg mb-2">Rotate / change connection string</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Paste a new Neon (or any Postgres) connection string. It's tested against a throwaway connection
          first — nothing is saved unless the test succeeds, and the live app keeps using the current
          connection until you restart the server after saving.
        </p>
        <Label>New connection string</Label>
        <Input
          type="password"
          placeholder="postgresql://user:password@host/db?sslmode=require"
          value={newConnStr}
          onChange={(e) => { setNewConnStr(e.target.value); setTestResult(null); }}
          className="font-mono text-sm"
        />

        {testResult && (
          <p className={`text-sm mt-2 ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
            {testResult.ok ? "✅ " : "❌ "}{testResult.message}
          </p>
        )}
        {saveResult && <p className="text-sm mt-2 text-amber-600">⚠️ {saveResult}</p>}

        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={test} disabled={testing || !newConnStr.trim()}>
            {testing ? "Testing..." : "Test connection"}
          </Button>
          <Button onClick={save} disabled={saving || !newConnStr.trim() || !testResult?.ok}>
            {saving ? "Saving..." : "Save to .env"}
          </Button>
        </div>
        {!testResult?.ok && newConnStr.trim() && (
          <p className="text-xs text-muted-foreground mt-1">Test the connection successfully before saving.</p>
        )}
      </div>
    </div>
  );
}

export default function PlatformConsole({ currentAdminEmail }: { currentAdminEmail?: string }) {
  return (
    <div>
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">API Keys & Settings</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="users">Admin Users</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="database"><DatabaseTab /></TabsContent>
        <TabsContent value="users"><AdminUsersTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
