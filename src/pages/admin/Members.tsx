import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeFetch, normalizeInterests, downloadCSV } from "./safeFetch";
import { useToast } from "@/hooks/use-toast";

interface MembersProps {
  memberData: any[];
  onReload: () => void;
}

const Members = ({ memberData, onReload }: MembersProps) => {
  const { toast } = useToast();
  const [selectedMemberRows, setSelectedMemberRows] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleMemberRow = (email: string) =>
    setSelectedMemberRows((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );

  // Shows a clear message instead of failing silently — in particular, if
  // the admin session cookie has expired, every request below 401s and the
  // page would otherwise look like nothing happened at all.
  const handleAuthOrServerError = async (res: Response, fallbackMessage: string) => {
    let message = fallbackMessage;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // response wasn't JSON — stick with fallbackMessage
    }
    if (res.status === 401) {
      toast({
        title: "Session expired",
        description: "Your admin session has expired. Please log out and log back in, then try again.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Something went wrong", description: message, variant: "destructive" });
    }
  };

  const deleteMemberRows = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/members/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: selectedMemberRows }),
      });

      if (!res.ok) {
        await handleAuthOrServerError(res, "Couldn't delete the selected member(s).");
        return;
      }

      toast({ title: "Deleted", description: "Selected member(s) removed." });
      setSelectedMemberRows([]);
      setEditingMember(null);
      onReload();
    } catch (err) {
      console.error("[deleteMemberRows] network error", err);
      toast({
        title: "Network error",
        description: "Couldn't reach the server. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Picks up server/data/members/members.json if one's been dropped there —
  // adds any members not already present (matched by email), then removes
  // the file/folder so it can't be imported twice by accident.
  const importFromDropIn = async () => {
    setImporting(true);
    try {
      const result = await safeFetch("/api/admin-console/import-members", { method: "POST" });
      if (!result?.found) {
        toast({ title: "No file found", description: "Place a members.json file in server/data/members/ first." });
      } else if (result.error) {
        toast({ title: "Import failed", description: result.error, variant: "destructive" });
      } else {
        toast({
          title: "Import complete",
          description: `${result.imported} member(s) added, ${result.skipped} skipped (already existed).`,
        });
        onReload();
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const openEditor = () => {
    const member = memberData.find((m) => m.email === selectedMemberRows[0]);
    if (!member) {
      toast({
        title: "Couldn't find that member",
        description: "The member list may be out of date — try refreshing the page and selecting again.",
        variant: "destructive",
      });
      return;
    }
    setEditingMember({
      ...member,
      // Kept separately from the (now editable) `email` field below so we
      // still know which record to match on the server if the admin
      // changes the email address itself.
      originalEmail: member.email,
      interests: Array.isArray(member.interests)
        ? member.interests.join(", ")
        : typeof member.interests === "object" && member.interests !== null
        ? Object.keys(member.interests).filter((k) => member.interests[k]).join(", ")
        : member.interests || "",
    });
  };

  const saveEditingMember = async () => {
    if (!editingMember) return;

    const newEmail = (editingMember.email || "").trim();
    if (!newEmail) {
      toast({ title: "Email required", description: "Email address can't be empty.", variant: "destructive" });
      return;
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
    if (!emailValid) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editingMember.originalEmail || editingMember.email,
          updatedData: { ...editingMember, email: newEmail },
        }),
      });

      if (!res.ok) {
        // Keep the panel open with their edits intact so nothing is lost.
        await handleAuthOrServerError(res, "Couldn't save changes to this member.");
        return;
      }

      toast({ title: "Saved", description: `${editingMember.name || "Member"} was updated.` });
      setEditingMember(null);
      setSelectedMemberRows([]);
      onReload();
    } catch (err) {
      console.error("[saveEditingMember] network error", err);
      toast({
        title: "Network error",
        description: "Couldn't reach the server. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between mb-6 flex-wrap gap-2">
          <h2 className="text-xl font-bold">Kutumb Members</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={importFromDropIn} disabled={importing}>
              {importing ? "Importing..." : "📥 Import from members.json"}
            </Button>
            <Button onClick={() => downloadCSV(memberData, "members.csv")}>
              Download CSV
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Total Registered Members: <span className="font-semibold text-foreground">{memberData.length}</span>
        </p>

        {selectedMemberRows.length > 0 && (
          <Button variant="destructive" className="mb-3" onClick={deleteMemberRows} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete Selected"}
          </Button>
        )}

        <Button
          className="mb-4 ml-2"
          onClick={openEditor}
          disabled={selectedMemberRows.length !== 1}
        >
          Modify Selected
        </Button>

        {editingMember && (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-bold">Edit Member — {editingMember.originalEmail || editingMember.email}</h3>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                <Input
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                <Input
                  type="email"
                  value={editingMember.email}
                  onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input
                  value={editingMember.phone}
                  onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <Input
                  value={editingMember.address}
                  onChange={(e) => setEditingMember({ ...editingMember, address: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Interests (comma-separated)
                </label>
                <Input
                  value={editingMember.interests || ""}
                  onChange={(e) => setEditingMember({ ...editingMember, interests: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveEditingMember} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingMember(null)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2"></th>
                <th className="p-2 text-left">Membership No</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Phone</th>
                <th className="p-2 text-left">Address</th>
                <th className="p-2 text-left">Interests</th>
              </tr>
            </thead>
            <tbody>
              {memberData.map((item, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedMemberRows.includes(item.email)}
                      onChange={() => toggleMemberRow(item.email)}
                    />
                  </td>
                  <td className="p-2 font-mono">{item.membershipNumber || "-"}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.email}</td>
                  <td className="p-2">{item.phone}</td>
                  <td className="p-2">{item.address}</td>
                  <td className="p-2">{normalizeInterests(item.interests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default Members;