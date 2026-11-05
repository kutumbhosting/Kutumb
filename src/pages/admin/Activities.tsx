import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { safeFetch } from "./safeFetch";

interface MediaItem {
  type: "image" | "video";
  src: string;
}

interface ActivityRow {
  id: number;
  title: string;
  description: string;
  schedule: string;
  location: string;
  participationOptions: string[];
  benefits: string[];
  legacyImages: string[];
  media: MediaItem[];
}

interface FormState {
  title: string;
  description: string;
  schedule: string;
  location: string;
  participationOptions: string; // one per line
  benefits: string; // one per line
}

const emptyForm: FormState = {
  title: "",
  description: "",
  schedule: "",
  location: "",
  participationOptions: "",
  benefits: "",
};

const Activities = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null); // null = adding new
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const data = await safeFetch("/api/admin-activities");
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const editing = editingId !== null ? rows.find((r) => r.id === editingId) : undefined;

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPendingFiles([]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const startModify = () => {
    if (selected.length !== 1) return;
    const row = rows.find((r) => r.id === selected[0]);
    if (!row) return;
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description,
      schedule: row.schedule,
      location: row.location,
      participationOptions: row.participationOptions.join("\n"),
      benefits: row.benefits.join("\n"),
    });
    setPendingFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const uploadFiles = async (id: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/admin-activities/${id}/media`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Upload failed");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Please enter the activity title.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editingId === null ? "/api/admin-activities" : `/api/admin-activities/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Save failed");

      if (pendingFiles.length > 0) {
        try {
          await uploadFiles(data.id, pendingFiles);
        } catch (err: any) {
          toast({ title: "Saved, but upload failed", description: err.message, variant: "destructive" });
          await load();
          setEditingId(data.id);
          setPendingFiles([]);
          return;
        }
      }
      toast({ title: editingId === null ? "Activity added" : "Activity updated", description: form.title });
      resetForm();
      setSelected([]);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    const names = rows.filter((r) => selected.includes(r.id)).map((r) => r.title).join(", ");
    if (!confirm(`Delete ${selected.length} selected activit${selected.length === 1 ? "y" : "ies"}?\n\n${names}\n\nThis also removes their uploaded photos/videos.`)) return;
    try {
      const res = await fetch("/api/admin-activities/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Delete failed");
      toast({ title: "Deleted", description: `${data.deleted} activit${data.deleted === 1 ? "y" : "ies"} removed` });
      if (editingId !== null && selected.includes(editingId)) resetForm();
      setSelected([]);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const removeMedia = async (src: string) => {
    if (editingId === null || !confirm("Remove this photo/video?")) return;
    try {
      const res = await fetch(`/api/admin-activities/${editingId}/media/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Delete failed");
      toast({ title: "Removed", description: "Media deleted" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-8">
      {/* ── Table of all activities ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Activities</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {rows.length} activit{rows.length === 1 ? "y" : "ies"} · {selected.length} selected
              </span>
              <Button size="sm" variant="outline" disabled={selected.length !== 1} onClick={startModify}
                title={selected.length === 1 ? "Edit the selected activity" : "Select exactly one activity to modify"}>
                Modify Selected
              </Button>
              <Button size="sm" variant="destructive" disabled={selected.length === 0} onClick={deleteSelected}>
                Delete Selected
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading activities…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No activities yet. Add one below.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Photos / Videos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const photos = r.legacyImages.length + r.media.filter((m) => m.type === "image").length;
                    const videos = r.media.filter((m) => m.type === "video").length;
                    return (
                      <TableRow key={r.id} data-state={selected.includes(r.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(r.id)}
                            onCheckedChange={() => toggle(r.id)}
                            aria-label={`Select ${r.title}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="max-w-[14rem]">{r.schedule || "-"}</TableCell>
                        <TableCell>{r.location || "-"}</TableCell>
                        <TableCell className="max-w-[22rem] truncate" title={r.description}>{r.description || "-"}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">{photos} 🖼️ · {videos} 🎬</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / modify form ── */}
      <div ref={formRef}>
        <Card className={editingId !== null ? "border-primary border-2" : undefined}>
          <CardContent className="p-6">
            <h3 className="text-lg font-bold mb-4">
              {editingId === null ? "Add New Activity" : `Modify Activity: ${editing?.title ?? ""}`}
            </h3>
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="act-title">Title *</Label>
                  <Input id="act-title" value={form.title} onChange={set("title")} placeholder="e.g. Kutumb Yoga" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="act-schedule">Schedule</Label>
                  <Input id="act-schedule" value={form.schedule} onChange={set("schedule")} placeholder="e.g. Every Saturday, 12:00 PM - 3:00 PM" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="act-location">Location</Label>
                  <Input id="act-location" value={form.location} onChange={set("location")} placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="act-desc">Description</Label>
                <Textarea id="act-desc" rows={3} value={form.description} onChange={set("description")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="act-part">Participation options (one per line)</Label>
                  <Textarea id="act-part" rows={4} value={form.participationOptions} onChange={set("participationOptions")} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="act-ben">Benefits (one per line)</Label>
                  <Textarea id="act-ben" rows={4} value={form.benefits} onChange={set("benefits")} />
                </div>
              </div>

              {/* Photos & videos */}
              <div className="space-y-2">
                <Label>Photos & Videos</Label>

                {editing && (editing.legacyImages.length > 0 || editing.media.length > 0) && (
                  <div className="flex flex-wrap gap-3">
                    {editing.legacyImages.map((img) => (
                      <div key={img} className="relative">
                        <img src={`/activity-images/${img}`} alt="" className="w-28 h-28 object-cover rounded border" />
                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1 rounded">original</span>
                      </div>
                    ))}
                    {editing.media.map((m) => (
                      <div key={m.src} className="relative group">
                        {m.type === "image" ? (
                          <img src={`/api/media/${m.src}`} alt="" className="w-28 h-28 object-cover rounded border" />
                        ) : (
                          <video src={`/api/media/${m.src}`} className="w-28 h-28 object-cover rounded border" muted />
                        )}
                        <button
                          type="button"
                          className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                          onClick={() => removeMedia(m.src)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="block text-sm"
                  onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
                />
                <p className="text-xs text-muted-foreground">
                  Choose photos/videos from your computer (up to 50 MB each). They upload when you save.
                  {pendingFiles.length > 0 && ` ${pendingFiles.length} file(s) ready to upload.`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId === null ? "Add Activity" : "Save Changes"}
                </Button>
                {editingId !== null && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel / Add New Instead
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Activities;
