import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { safeFetch } from "./safeFetch";

const FileManagement = () => {
  const { toast } = useToast();

  const [fileFolder, setFileFolder] = useState<string>("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [debugMsg, setDebugMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── debug helper ────────────────────────────────────────────────────────
  const showDebug = (msg: string) => {
    setDebugMsg(msg);
    setTimeout(() => setDebugMsg(""), 3000);
  };

  // ─── effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("CURRENT FOLDERS STATE:", folders);
  }, [folders]);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (!fileFolder) { setFiles([]); return; }
    fetchFiles(fileFolder);
  }, [fileFolder]);

  useEffect(() => {
    if (fileFolder) fetchFiles(fileFolder);
  }, [fileFolder, fileRefreshKey]);

  // ─── fetch helpers ────────────────────────────────────────────────────────
  const fetchFiles = async (folder: string) => {
    if (!folder) return;
    const data = await safeFetch(
      `/api/files/list?folder=${encodeURIComponent(folder)}&t=${Date.now()}`
    );
    setFiles(Array.isArray(data) ? [...data] : []);
  };

  const fetchFolders = async () => {
    const data = await safeFetch("/api/folders");
    console.log("FOLDERS FROM API:", data);
    setFolders(Array.isArray(data) ? data : []);
  };

  // ─── folder actions ───────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolder.trim()) { toast({ title: "Folder name required" }); return; }
    const folderName = newFolder.trim();
    const res = await safeFetch("/api/folder/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: folderName }),
    });
    if (!res) {
      toast({ title: "Error", description: "Folder creation failed", variant: "destructive" });
      return;
    }
    setNewFolder("");
    setFileFolder(folderName);
    await fetchFolders();
    await fetchFiles(folderName);
    toast({ title: "Success", description: "Folder created" });
  };

  const deleteFolder = async () => {
    if (!fileFolder) return;
    if (!confirm(`Delete folder "${fileFolder}"?`)) return;
    const res = await safeFetch("/api/folder/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName: fileFolder }),
    });
    if (!res) {
      toast({ title: "Error", description: "Delete failed", variant: "destructive" });
      return;
    }
    setFileFolder("");
    setFiles([]);
    fetchFolders();
    toast({ title: "Deleted", description: "Folder removed" });
  };

  // ─── file actions ─────────────────────────────────────────────────────────
  const deleteFile = async (file: string) => {
    if (!confirm(`Delete ${file}?`)) return;
    if (!fileFolder) { toast({ title: "Select a folder first" }); return; }
    const res = await safeFetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: fileFolder, fileNames: [file] }),
    });
    if (!res) {
      toast({ title: "Error", description: "Delete failed", variant: "destructive" });
      return;
    }
    await fetchFiles(fileFolder);
    await fetchFolders();
    toast({ title: "Deleted", description: `${file} removed` });
  };

  const uploadSelectedFile = async () => {
    showDebug("🚀 Upload clicked");
    if (!uploadFile || !fileFolder) { showDebug("❌ Missing file or folder"); return; }
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("folder", fileFolder);
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      if (!res.ok) { showDebug("❌ Upload failed"); return; }
      showDebug("✅ Upload successful");
      // Optimistic UI update
      setFiles((prev) => [...prev, uploadFile.name]);
      // Then sync with backend after a short delay
      setTimeout(() => fetchFiles(fileFolder), 500);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      showDebug("❌ " + err.message);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <h2 className="text-xl font-bold">Folders</h2>

        {/* ── Folder selector + delete ── */}
        <div className="flex w-2/3 gap-3 items-center">
          <select
            className="border p-2 rounded flex-1 text-foreground bg-background"
            value={fileFolder}
            onChange={(e) => {
              console.log("SELECTED FOLDER:", e.target.value);
              setFileFolder(e.target.value);
            }}
          >
            <option value="">-- Select Folder --</option>
            {folders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          <Button variant="destructive" onClick={deleteFolder}>
            Delete Folder
          </Button>
        </div>

        {/* ── Create new folder ── */}
        <div className="flex w-2/3 gap-2">
          <Input
            placeholder="New folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <Button onClick={createFolder}>Create Folder</Button>
        </div>

        {/* ── File list ── */}
        <div className="border rounded p-3">
          <h3 className="text-xl font-bold">Files List</h3>

          {files.length === 0 && (
            <p className="text-sm text-muted-foreground">No files found</p>
          )}

          {files.map((file) => (
            <div key={file} className="flex justify-between items-center border-b py-2">
              <span
                className={`cursor-pointer ${selectedFile === file ? "font-bold text-blue-600" : ""}`}
                onClick={() => setSelectedFile(file)}
              >
                {file}
              </span>

              <div className="flex w-1/2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/api/files/download?folder=${fileFolder}&file=${file}`,
                      "_blank"
                    )
                  }
                >
                  Download
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteFile(file)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Upload new file ── */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              console.log("FILE PICKED:", file);
              setUploadFile(file || null);
            }}
          />

          <div className="flex flex-col gap-2">
            {uploadFile && (
              <p className="text-xs text-green-600">Selected: {uploadFile.name}</p>
            )}
            <Button
              onClick={uploadSelectedFile}
              disabled={!uploadFile}
              className="w-fit"
            >
              Upload File
            </Button>
          </div>

          {debugMsg && (
            <div className="mt-2 text-sm p-2 bg-gray-100 border rounded">
              {debugMsg}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FileManagement;
