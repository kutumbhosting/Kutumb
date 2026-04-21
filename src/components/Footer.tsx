import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Facebook, Instagram, Twitter } from "lucide-react";
import logo from "@/assets/Kutumb-logo.png";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-b from-muted to-background border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* About Section */}
          <div>
          <div className="flex items-center gap-2 mb-4">
             <img src={logo} alt="Kutumb Logo" className="h-10 w-25" />
           </div>    
           <Link to="/" onClick={() => window.scrollTo(0, 0)}
              className="text-muted-foreground hover:text-primary transition-colors text-sm">
              Building stronger communities through social impact, engagement, and compassion.
           </Link>
           <div className="flex gap-6 mt-4">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram size={20} />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter size={20} />
              </a>
           </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/about" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/executive" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Executive Team
                </Link>
              </li>
              <li>
                <Link to="/activities" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Activities
                </Link>
              </li>
              <li>
                <Link to="/events" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Events
                </Link>
              </li>
            </ul>
          </div>

          {/* Get Involved */}
          <div>
            <h3 className="font-semibold mb-4">Get Involved</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/membership" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Become a Member
                </Link>
              </li>
              <li>
                <Link to="/events" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Register for Events
                </Link>
              </li>
              <li>
                <Link to="/contact" onClick={() => window.scrollTo(0, 0)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin size={16} className="mt-1 flex-shrink-0 text-primary" />
                <span>Sydney, New South Wales, Australia</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone size={16} className="flex-shrink-0 text-primary" />
                <span>+61 412 830 048</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail size={16} className="flex-shrink-0 text-primary" />
                <span>info@kutumb.org.au</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border pt-8 mt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© Kutumb Australia, {currentYear}. All rights reserved.</p>
<p>
  Website developed by{" "}
  <a
    href="https://www.prama-ai.com"
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary font-semibold hover:underline"
  >
    Prama AI, Australia
  </a>
</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;




