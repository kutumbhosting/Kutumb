// ─── PastEvents ───────────────────────────────────────────────────────────────
// Placeholder for future implementation.
// Suggested features:
//   - List all past events (events where date < today)
//   - Show attendance summary per event
//   - Download per-event CSV reports
//   - Photo gallery / flyer archive per event

import { Card, CardContent } from "@/components/ui/card";

const PastEvents = () => {
  return (
    <Card>
      <CardContent className="p-12 text-center space-y-4">
        <div className="text-5xl">🗓️</div>
        <h2 className="text-2xl font-bold">Past Events</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          This section is coming soon. It will display a searchable archive of
          all past events with attendance summaries, CSV exports, and flyer history.
        </p>
        <p className="text-xs text-muted-foreground">
          To implement: connect to <code>/api/events</code> and filter by date &lt; today.
        </p>
      </CardContent>
    </Card>
  );
};

export default PastEvents;
