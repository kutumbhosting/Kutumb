import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeFetch, normalizeInterests, downloadCSV } from "./safeFetch";

interface MembersProps {
  memberData: any[];
  onReload: () => void;
}

const Members = ({ memberData, onReload }: MembersProps) => {
  const [selectedMemberRows, setSelectedMemberRows] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<any | null>(null);

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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between mb-6">
          <h2 className="text-xl font-bold">Kutumb Members</h2>
          <Button onClick={() => downloadCSV(memberData, "members.csv")}>
            Download CSV
          </Button>
        </div>

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
