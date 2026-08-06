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

  const toggleMemberRow = (email: string) =>
    setSelectedMemberRows((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );

  const deleteMemberRows = async () => {
    await safeFetch("/api/members/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: selectedMemberRows }),
    });
    setSelectedMemberRows([]);
    onReload();
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
          <Button variant="destructive" className="mb-3" onClick={deleteMemberRows}>
            Delete Selected
          </Button>
        )}

        <Button
          className="mb-4"
          onClick={() => {
            const member = memberData.find((m) => m.email === selectedMemberRows[0]);
            if (!member) return;
            setEditingMember({
              ...member,
              interests: Array.isArray(member.interests)
                ? member.interests.join(", ")
                : typeof member.interests === "object" && member.interests !== null
                ? Object.keys(member.interests).filter((k) => member.interests[k]).join(", ")
                : member.interests || "",
            });
          }}
          disabled={selectedMemberRows.length !== 1}
        >
          Modify Selected
        </Button>

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

          {editingMember && (
            <Card className="mt-4">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-bold">Edit Member</h3>
                <Input
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                />
                <Input
                  value={editingMember.phone}
                  onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                />
                <Input
                  value={editingMember.address}
                  onChange={(e) => setEditingMember({ ...editingMember, address: e.target.value })}
                />
                <Input
                  value={editingMember.interests || ""}
                  onChange={(e) => setEditingMember({ ...editingMember, interests: e.target.value })}
                />
                <Button
                  onClick={async () => {
                    await safeFetch("/api/members/update", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: editingMember.email,
                        updatedData: editingMember,
                      }),
                    });
                    setEditingMember(null);
                    setSelectedMemberRows([]);
                    onReload();
                  }}
                >
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Members;