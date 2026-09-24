// Setup panels shown inside Admin → Platform Console → API Keys & Settings,
// under their settings groups:
//   • BankFileDropBoxPanel — Apps Script pick-up, recent files, optional
//     server-side Google Drive connection
//   • BankFeedPanel        — Basiq live bank feed connection
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

async function getJson(path: string) {
  const res = await fetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}
async function postJson(path: string, body: any = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

const fmt = (d: string | Date) => new Date(d).toLocaleString("en-AU");

export function BankFileDropBoxPanel({ refreshKey }: { refreshKey?: number }) {
  const { toast } = useToast();
  const [drive, setDrive] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => getJson("/api/events/reconcile/drive/status").then(setDrive).catch(() => setDrive(null));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const copyScript = async () => {
    try {
      const res = await fetch("/api/events/reconcile/drive/apps-script");
      if (!res.ok) throw new Error("Couldn't build the script");
      await navigator.clipboard.writeText(await res.text());
      toast({ title: "Script copied", description: "Paste it into a new project at script.google.com, save, then run install." });
    } catch (err: any) {
      toast({ title: "Couldn't copy the script", description: err.message, variant: "destructive" });
    }
  };

  const connect = async () => {
    try {
      const { url } = await postJson("/api/events/reconcile/drive/connect");
      window.open(url, "_blank", "noopener");
      toast({ title: "Sign in as kutumbhosting@gmail.com in the new tab", description: "Then come back and click Refresh." });
    } catch (err: any) {
      toast({ title: "Couldn't connect Google Drive", description: err.message, variant: "destructive" });
    }
  };

  const checkNow = async () => {
    setBusy(true);
    try {
      const data = await postJson("/api/events/reconcile/drive/run-now");
      toast({ title: "Folder checked", description: data.message });
      load();
    } catch (err: any) {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Stop the server-side Google Drive connection?")) return;
    await postJson("/api/events/reconcile/drive/disconnect").catch(() => {});
    load();
  };

  if (!drive) return <p className="text-sm text-muted-foreground mt-3">Loading drop box status…</p>;

  const lastSeen = drive.appsScriptLastSeen ? new Date(drive.appsScriptLastSeen) : null;
  const stale = lastSeen && Date.now() - lastSeen.getTime() > 20 * 60_000;

  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="rounded-md border p-4 space-y-2">
        <p className="font-semibold">Automatic pick-up (Google Apps Script)</p>
        <p>
          <span className="font-medium">Status:</span>{" "}
          {lastSeen ? (
            <span className={stale ? "text-orange-700" : "text-green-700"}>
              last checked in {fmt(lastSeen)}
              {stale && " — hasn't run for over 20 minutes; open the script and run install again"}
            </span>
          ) : (
            <span className="text-orange-700">not set up yet — files dropped in the folder won't be picked up</span>
          )}
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Save the Drive Folder ID above (a pasted folder link is fine).</li>
          <li>Click <strong>Copy script</strong>.</li>
          <li>
            Signed in as kutumbhosting@gmail.com, open{" "}
            <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer" className="underline">
              script.google.com → New project
            </a>
            , paste it over the sample code and save.
          </li>
          <li>Pick <strong>install</strong> in the function list, click <strong>Run</strong>, and allow the permissions.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          It runs on Google's servers every 5 minutes, so it works even while the website server is asleep. Copy the
          script again if the website address, folder or "After import" setting changes.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={copyScript}>Copy script</Button>
          <Button size="sm" variant="outline" asChild>
            <a href={drive.folderUrl} target="_blank" rel="noopener noreferrer">Open folder</a>
          </Button>
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
        </div>
      </div>

      <div className="rounded-md border p-4 space-y-2">
        <p className="font-semibold">Letting others drop files</p>
        <p className="text-muted-foreground">
          Other people don't install anything. In Google Drive, signed in as kutumbhosting@gmail.com, right-click the
          folder → <strong>Share</strong> → add each person's email as <strong>Editor</strong>. They then use the{" "}
          <strong>Bank File Drop Box</strong> link in the website footer (or the Drive app on their phone) and drop the
          NAB CSV in. Each person gets an email saying whether their file was imported.
        </p>
        <p className="text-xs text-muted-foreground">
          Anyone with access can mark registrations as paid by dropping a statement, so share it only with the treasurer
          and people you trust — avoid "Anyone with the link". Each person needs a Google account (a free one can be made
          with any email address).
        </p>
      </div>

      {drive.imports?.length > 0 && (
        <div>
          <p className="font-semibold mb-2">Recent files</p>
          <div className="border rounded-md divide-y">
            {drive.imports.map((imp: any) => (
              <div key={imp.id} className="p-2 flex gap-3 items-start justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {imp.status === "imported" ? "✅" : "⚠️"} {imp.file_name}
                  </p>
                  <p className={`text-xs ${imp.status === "imported" ? "text-muted-foreground" : "text-red-700"}`}>
                    {fmt(imp.processed_at)}
                    {imp.uploaded_by ? ` · dropped by ${imp.uploaded_by}` : ""} · {imp.message}
                  </p>
                </div>
                {imp.has_file && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(`/api/events/reconcile/drive/imports/${imp.id}/file`, "_blank")}
                  >
                    Original
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border p-4 space-y-2">
        <p className="font-semibold">Optional: server-side polling</p>
        <p className="text-muted-foreground">
          The website can also check the folder itself, but only while its server is running. Not needed when the
          script above is set up. Requires the Google OAuth Client ID/Secret above, with this redirect URI:
        </p>
        <p className="font-mono text-xs break-all">{drive.redirectUri}</p>
        {drive.hasClient && (
          <p>
            <span className="font-medium">Status:</span>{" "}
            {drive.connected ? `Connected${drive.connectedEmail ? ` as ${drive.connectedEmail}` : ""}` : "Not connected"}
            {typeof drive.filesWaiting === "number" && ` · ${drive.filesWaiting} file(s) in folder`}
          </p>
        )}
        {drive.watcher?.lastRun && (
          <p className="text-muted-foreground">
            Last activity {fmt(drive.watcher.lastRun.at)} ({drive.watcher.lastRun.via}):{" "}
            {drive.watcher.lastRun.error || drive.watcher.lastRun.message}
          </p>
        )}
        {drive.error && <p className="text-red-600">{drive.error}</p>}
        <div className="flex gap-2 flex-wrap">
          {drive.hasClient && !drive.connected && (
            <Button size="sm" variant="outline" onClick={connect}>Connect Google Drive</Button>
          )}
          {drive.connected && (
            <>
              <Button size="sm" variant="outline" onClick={checkNow} disabled={busy}>
                {busy ? "Checking…" : "Check folder now"}
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnect}>Disconnect</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function BankFeedPanel({ refreshKey }: { refreshKey?: number }) {
  const { toast } = useToast();
  const [feed, setFeed] = useState<any | null>(null);

  const load = () => getJson("/api/events/reconcile/bank-feed/status").then(setFeed).catch(() => setFeed(null));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const connect = async () => {
    try {
      const { url } = await postJson("/api/events/reconcile/bank-feed/connect");
      window.open(url, "_blank", "noopener");
      toast({
        title: "Finish connecting in the new tab",
        description: "Log in to the bank and share the account that receives transfers, then click Refresh.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't connect bank", description: err.message, variant: "destructive" });
    }
  };

  if (!feed) return null;

  return (
    <div className="mt-4 rounded-md border p-4 space-y-2 text-sm">
      <p className="text-muted-foreground">
        Pulls incoming transfers straight from the bank (no file needed). Basiq charges for production access, so
        the Bank File Drop Box above is the free option. Once connected, a <strong>Sync from Bank</strong> button
        appears on the Event Registration page.
      </p>
      <p>
        <span className="font-medium">Status:</span>{" "}
        {!feed.configured
          ? "Add the Basiq API key above to enable."
          : feed.connected
          ? `Connected — ${feed.accounts.map((a: any) => `${a.name || "account"} ${a.accountNo || ""}`.trim()).join(", ")}`
          : "API key saved; bank not connected yet."}
        {feed.lastSync && ` · last sync ${fmt(feed.lastSync)}`}
      </p>
      {feed.error && <p className="text-red-600">{feed.error}</p>}
      <div className="flex gap-2 flex-wrap">
        {feed.configured && (
          <Button size="sm" variant="outline" onClick={connect}>
            {feed.connected ? "Re-connect / renew consent" : "Connect Bank"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
      </div>
    </div>
  );
}
