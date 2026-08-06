import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import About from "./pages/About";
import Executive from "./pages/Executive";
import Activities from "./pages/Activities";
import Events from "./pages/Events";
import Membership from "./pages/Membership";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin"; // 👈 ADD THIS
import PrivacyPolicy from "./pages/PrivacyPolicy";
import EventTerms from "./pages/EventTerms";
import CheckoutReturn from "./pages/CheckoutReturn";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      {/* ❌ REMOVE BrowserRouter FROM HERE */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/executive" element={<Executive />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/events" element={<Events />} />
        <Route path="/membership" element={<Membership />} />
        <Route path="/contact" element={<Contact />} />

        {/* ✅ ADMIN ROUTE */}
        <Route path="/Admin" element={<Admin />} />

        {/* ✅ LEGAL CENTRE ROUTES */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/event-terms" element={<EventTerms />} />
        <Route path="/checkout/return" element={<CheckoutReturn />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
