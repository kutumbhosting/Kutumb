// Setup panels shown inside Admin → Platform Console → Settings / API Keys,
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

// Admin → Settings → Automatic Registration Emails
export function RegistrationEmailsPanel({ refreshKey }: { refreshKey?: number }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "run">("");
  const [events, setEvents] = useState<any[] | null>(null);
  const [savingEvent, setSavingEvent] = useState<string>("");

  const load = () => {
    getJson("/api/registration-emails/status").then(setStatus).catch(() => setStatus(null));
    getJson("/api/registration-emails/events").then(setEvents).catch(() => setEvents([]));
  };

  const toggleEvent = async (ev: any, field: "autoReminders" | "autoCancel" | "autoWelcome", value: boolean) => {
    setSavingEvent(`${ev.id}-${field}`);
    try {
      const res = await fetch(`/api/registration-emails/events/${ev.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Couldn't save");
      setEvents((list) => (list || []).map((e) => (e.id === ev.id ? { ...e, [field]: value } : e)));
      setPreview(null);
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    } finally {
      setSavingEvent("");
    }
  };
  useEffect(() => {
    load();
    setPreview(null);
  }, [refreshKey]);

  const doPreview = async () => {
    setBusy("preview");
    try {
      setPreview(await getJson("/api/registration-emails/preview"));
    } catch (err: any) {
      toast({ title: "Couldn't preview", description: err.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const runNow = async () => {
    if (!window.confirm("Send the due reminder/welcome emails and cancel overdue unpaid registrations now?")) return;
    setBusy("run");
    try {
      const r = await postJson("/api/registration-emails/run-now");
      const n = (k: string) => r[k]?.length || 0;
      toast({
        title: "Done",
        description: `${n("reminders")} reminder(s), ${n("finals")} final reminder(s), ${n("cancelled")} cancelled, ${n("welcomes")} welcome email(s)${n("failed") ? `, ${n("failed")} failed to send` : ""}.`,
      });
      setPreview(null);
      load();
    } catch (err: any) {
      toast({ title: "Run failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const cfg = status?.config;
  const section = (title: string, items: any[], extra?: (i: any) => string) =>
    items?.length ? (
      <div>
        <p className="font-medium">{title} ({items.length})</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {items.map((i: any) => (
            <li key={`${title}-${i.id}`}>
              {i.event} — {i.registrationNumber || ""} {i.name} ({i.email}){extra ? ` · ${extra(i)}` : ""}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="mt-4 rounded-md border p-4 space-y-3 text-sm">
      {cfg && (
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          {!cfg.remindersOn && <li className="text-orange-700">Payment reminders are switched off above.</li>}
          {!cfg.cancelOn && <li className="text-orange-700">Auto-cancel is switched off above.</li>}
          {!cfg.welcomeOn && <li className="text-orange-700">Welcome emails are switched off above.</li>}
          <li>
            <strong>Payment reminders</strong> every {cfg.reminderDays.map((d: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(" & ") || "(no days set)"} at {cfg.hour}:00
            (Sydney) — only to registrations still awaiting payment, paid events only.
          </li>
          <li>
            <strong>Final reminder</strong> {cfg.finalDays} days before the event. For events ticked for auto-cancel it
            gives the cancellation date, and <strong>unpaid registrations are cancelled</strong> {cfg.cancelDays} days
            before (spots released, registrant emailed, admin mailbox told).
          </li>
          <li>
            Never auto-cancelled (listed for you instead): part-payments,
            {cfg.cancelClaimed ? "" : " people who said they paid by bank transfer that isn't matched yet,"} and anyone who
            registered in the final week.
          </li>
          <li>
            <strong>Welcome email</strong> the day before the event to every confirmed registration (free and paid), with
            their QR tickets attached again.
          </li>
          <li>Events whose date has no specific day (e.g. "November, 2026") are skipped.</li>
        </ul>
      )}
      <div>
        <p className="font-semibold mb-1">Which events</p>
        <p className="text-xs text-muted-foreground mb-2">
          An email goes out only when both the switch above and the event's tick here are on. New events start with
          reminders and welcome ticked, and auto-cancel unticked.
        </p>
        {!events ? (
          <p className="text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground">No upcoming events.</p>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Event</th>
                  <th className="p-2">Registrations</th>
                  <th className="p-2 text-center">Payment reminders</th>
                  <th className="p-2 text-center">Auto-cancel unpaid</th>
                  <th className="p-2 text-center">Welcome email</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((ev) => {
                  const box = (field: "autoReminders" | "autoCancel" | "autoWelcome", disabled = false) => (
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!ev[field]}
                      disabled={disabled || savingEvent === `${ev.id}-${field}`}
                      onChange={(e) => toggleEvent(ev, field, e.target.checked)}
                    />
                  );
                  return (
                    <tr key={ev.id}>
                      <td className="p-2">
                        <p className="font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.dateText || "no date"}
                          {ev.daysUntil !== null && ` · ${ev.daysUntil === 0 ? "today" : `in ${ev.daysUntil} day(s)`}`}
                          {!ev.schedulable && " · skipped: needs a specific day"}
                          {!ev.paidEvent && " · free event"}
                        </p>
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap">
                        {ev.confirmed} confirmed
                        {ev.unpaid ? <span className="text-orange-700"> · {ev.unpaid} unpaid</span> : null}
                        {ev.cancelled ? <span className="text-muted-foreground"> · {ev.cancelled} cancelled</span> : null}
                      </td>
                      <td className="p-2 text-center">{box("autoReminders", !ev.paidEvent)}</td>
                      <td className="p-2 text-center">{box("autoCancel", !ev.paidEvent)}</td>
                      <td className="p-2 text-center">{box("autoWelcome")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {status?.lastActivity && (
        <p className="text-muted-foreground">
          Last activity {fmt(status.lastActivity.at)}: {status.lastActivity.reminders?.length || 0} reminder(s),{" "}
          {status.lastActivity.finals?.length || 0} final, {status.lastActivity.cancelled?.length || 0} cancelled,{" "}
          {status.lastActivity.welcomes?.length || 0} welcome
          {status.lastActivity.failed?.length ? `, ${status.lastActivity.failed.length} failed to send` : ""}.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={doPreview} disabled={!!busy}>
          {busy === "preview" ? "Checking…" : "Preview what's due now"}
        </Button>
        <Button size="sm" onClick={runNow} disabled={!!busy}>
          {busy === "run" ? "Running…" : "Run now"}
        </Button>
      </div>

      {preview && (
        <div className="rounded-md bg-muted/50 p-3 space-y-2">
          <p className="font-medium">Due right now (nothing has been sent):</p>
          {section("Payment reminders", preview.reminders, (i) => `$${i.amountDue.toFixed(2)} due${i.note ? `, ${i.note}` : ""}`)}
          {section("Final reminders", preview.finals, (i) => `$${i.amountDue.toFixed(2)} due`)}
          {section("Would be cancelled", preview.cancelled, (i) => `$${i.amountDue.toFixed(2)} unpaid`)}
          {section("Welcome emails", preview.welcomes)}
          {section("Needs your review", preview.needsReview, (i) => i.reason)}
          {!["reminders", "finals", "cancelled", "welcomes", "needsReview"].some((k) => preview[k]?.length) && (
            <p className="text-muted-foreground">Nothing is due at the moment.</p>
          )}
          {preview.skippedEvents?.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Skipped: {preview.skippedEvents.map((s: any) => `${s.title} (${s.reason})`).join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Admin → Settings → Event Media Drop Box
export function MediaDropBoxPanel({ refreshKey }: { refreshKey?: number }) {
  const [links, setLinks] = useState<any | null>(null);
  useEffect(() => {
    getJson("/api/drop-box-links").then(setLinks).catch(() => setLinks(null));
  }, [refreshKey]);

  return (
    <div className="mt-4 rounded-md border p-4 space-y-2 text-sm">
      <p className="text-muted-foreground">
        Volunteers and photographers upload event photos and videos here using the{" "}
        <strong>Event Media Drop Box</strong> link in the website footer. Before the folder opens, they're asked to{" "}
        <strong>create (or open) a folder named after the event</strong> and put their files inside it — never loose
        in the main folder — so each event's media stays together.
      </p>
      {links?.suggestedFolderNames?.length > 0 && (
        <p className="text-muted-foreground">
          Folder names suggested to them: {links.suggestedFolderNames.map((n: string) => `"${n}"`).join(", ")}.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Access is controlled in Google Drive: right-click the folder → Share → add each person as{" "}
        <strong>Editor</strong>. Tip: create each event's folder yourself in advance, so people only have to open it.
      </p>
      {links?.mediaFolderUrl && (
        <Button size="sm" variant="outline" asChild>
          <a href={links.mediaFolderUrl} target="_blank" rel="noopener noreferrer">Open folder</a>
        </Button>
      )}
    </div>
  );
}
