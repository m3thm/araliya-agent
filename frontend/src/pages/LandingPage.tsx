import { Link } from "react-router-dom";
import { DollarSign, ShoppingCart, ClipboardCheck, Truck, History } from "lucide-react";

// Free-to-use stock photography (Pexels), standing in for real product/lifestyle
// shots until real photography is available. Swap these for actual assets later.
const LILIES_IMG = "https://images.pexels.com/photos/15312442/pexels-photo-15312442.jpeg?auto=compress&cs=tinysrgb&w=800";
const SWEETS_IMG = "https://images.pexels.com/photos/18488301/pexels-photo-18488301.jpeg?auto=compress&cs=tinysrgb&w=800";
const FAMILY_GIFT_IMG = "https://images.pexels.com/photos/6185572/pexels-photo-6185572.jpeg?auto=compress&cs=tinysrgb&w=1000";
const COURIER_IMG = "https://images.pexels.com/photos/7843999/pexels-photo-7843999.jpeg?auto=compress&cs=tinysrgb&w=1000";

// ── Capability proof snippets ────────────────────────────────────────────
// Real, concrete two-line exchanges rather than abstract feature claims —
// each pairs what happens when you just ask with a caption naming the
// manual UI that does the same thing. The first is the signature card: the
// one thing here that a generic chatbot wrapper can't honestly claim —
// persistent memory of cart and order state across visits.
interface ProofExchange {
  icon: typeof DollarSign;
  eyebrow: string;
  user: string;
  ai: string;
  caption: string;
}

const SIGNATURE_EXCHANGE: ProofExchange = {
  icon: History,
  eyebrow: "It remembers what you haven't finished",
  user: "Any updates?",
  ai: "Your Kavum Box order from Tuesday hasn't been tracked yet — want to add the confirmation number now?",
  caption: "Araliya already knows your cart and orders every time you open the chat. You never have to remind it.",
};

const PROOF_EXCHANGES: ProofExchange[] = [
  {
    icon: DollarSign,
    eyebrow: "Search, in whatever currency you think in",
    user: "Something festive for my nephew, around $25",
    ai: "Converting to LKR — here's what's in range: Vesak Lantern Gift Box, LKR 6,800 (~$23)…",
    caption: "Say dollars, pounds, or euros. Araliya converts on the fly — no calculator needed.",
  },
  {
    icon: ShoppingCart,
    eyebrow: "Add to cart, by asking or by tapping",
    user: "Add two of the lily bouquets",
    ai: "Added — 2× Royal Lilies Bouquet to your cart.",
    caption: "Or tap + on any product card yourself. Same cart, either way.",
  },
  {
    icon: ClipboardCheck,
    eyebrow: "Checkout, start to finish, in conversation",
    user: "I'll take it — send it to my aunt in Kandy for Vesak",
    ai: "Got it. What's her phone number, and your name as the sender?",
    caption: "Or open the cart and fill in the form — whatever you've already told Araliya is filled in for you.",
  },
  {
    icon: Truck,
    eyebrow: "Order tracking, without leaving the chat",
    user: "It's VIMP34456CB2",
    ai: "Thanks — that one's out for delivery, should arrive today.",
    caption: "Or paste the number into Order History directly. Either way updates instantly, everywhere.",
  },
];

function ProofCard({ exchange, signature = false }: { exchange: ProofExchange; signature?: boolean }) {
  const Icon = exchange.icon;
  return (
    <div
      className={`rounded-2xl p-6 sm:p-7 transition-shadow hover:shadow-lg ${
        signature
          ? "bg-brand text-white shadow-xl shadow-brand/20"
          : "bg-surface-card border border-brand/10"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`size-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            signature ? "bg-white/15 border border-white/25" : "bg-brand/5 border border-brand/10"
          }`}
        >
          <Icon className={`size-4 ${signature ? "text-white" : "text-brand"}`} strokeWidth={2} />
        </div>

        <h3 className={`font-display text-lg sm:text-xl italic ${signature ? "text-white" : "text-ink"}`}>
          {exchange.eyebrow}
        </h3>
      </div>

      <div className="space-y-2.5 mb-4">
        <div className="flex justify-end">
          <div
            className={`text-sm leading-relaxed p-3 max-w-[85%] rounded-tl-xl rounded-bl-xl rounded-br-xl ${
              signature ? "bg-white/10" : "bg-surface"
            }`}
          >
            {exchange.user}
          </div>
        </div>
        <div className="flex justify-start">
          <div
            className={`text-sm leading-relaxed p-3 max-w-[85%] rounded-tr-xl rounded-br-xl rounded-bl-xl ${
              signature ? "bg-white text-brand" : "bg-brand/5 text-brand"
            }`}
          >
            {exchange.ai}
          </div>
        </div>
      </div>

      <p className={`text-xs leading-relaxed ${signature ? "text-white/70" : "text-ink/50"}`}>
        {exchange.caption}
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-ink antialiased">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-surface flex items-center justify-between px-6 md:px-10 py-6 border-b border-brand/10">
        <div className="text-2xl font-display font-bold text-brand italic">Araliya</div>
        <div className="hidden md:flex gap-8 text-sm font-medium tracking-wide uppercase">
          <a href="#how" className="hover:text-brand transition-colors">How it Works</a>
          <a href="#expats" className="hover:text-brand transition-colors">For Expats</a>
          <a href="#kapruka" className="hover:text-brand transition-colors">Kapruka Network</a>
        </div>
        <Link
          to="/login"
          className="px-6 py-2.5 bg-brand text-white rounded-full text-sm font-semibold hover:bg-brand-dark transition-all"
        >
          Start Chatting
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative px-6 md:px-10 pt-32 sm:pt-36 pb-20 sm:pb-32 overflow-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="z-10">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/5 text-brand text-xs font-bold uppercase tracking-widest mb-6">
              The Expat Gift Concierge
            </span>
            <h1 className="font-display text-4xl sm:text-5xl md:text-7xl leading-[1.1] mb-8 text-balance">
              Send a piece of <span className="italic">home</span>, instantly.
            </h1>
            <p className="text-lg sm:text-xl text-ink/70 leading-relaxed mb-10 max-w-lg text-pretty">
              An AI chatbot that understands the Sri Lankan heart. We browse Kapruka in real-time
              to find, pack, and deliver the perfect gift to your loved ones.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/login"
                className="px-8 py-4 bg-brand text-white rounded-lg font-bold text-lg shadow-xl shadow-brand/20 hover:scale-[1.02] transition-transform inline-block text-center"
              >
                Find a Gift Now
              </Link>
              <a
                href="#how"
                className="px-8 py-4 border border-brand/20 rounded-lg font-bold text-lg hover:bg-brand/5 transition-colors text-center"
              >
                See How It Works
              </a>
            </div>
          </div>

          {/* Mock chat */}
          <div className="relative">
            <div className="bg-surface-card rounded-2xl shadow-2xl p-5 sm:p-6 border border-brand/5 relative z-20">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="size-10 rounded-full bg-brand flex items-center justify-center text-white font-display text-xl flex-shrink-0">
                  A
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">Araliya AI</p>
                  <p className="text-[10px] text-success font-medium uppercase tracking-tighter">
                    Connected to Kapruka MCP
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-surface p-4 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl text-sm leading-relaxed">
                  Hi! I'm looking for a birthday surprise for my mother in Kandy. She loves lilies
                  and traditional sweets.
                </div>
                <div className="bg-brand/5 p-4 rounded-tl-2xl rounded-br-2xl rounded-bl-2xl text-sm leading-relaxed text-brand">
                  <p className="mb-3">
                    I've searched Kapruka and found a perfect pairing. Would you like me to add
                    these to your cart?
                  </p>

                  <div className="flex gap-3">
                    <div className="w-1/2 bg-surface-card p-2 rounded-lg border border-brand/10">
                      <img
                        src={LILIES_IMG}
                        alt="Royal Lilies Bouquet"
                        loading="lazy"
                        className="w-full aspect-square object-cover mb-2 rounded"
                      />
                      <p className="text-[10px] font-bold truncate text-ink">Royal Lilies Bouquet</p>
                      <p className="text-[10px] text-accent font-bold">LKR 8,500</p>
                    </div>
                    <div className="w-1/2 bg-surface-card p-2 rounded-lg border border-brand/10">
                      <img
                        src={SWEETS_IMG}
                        alt="Classic Kavum Box"
                        loading="lazy"
                        className="w-full aspect-square object-cover mb-2 rounded"
                      />
                      <p className="text-[10px] font-bold truncate text-ink">Classic Kavum Box</p>
                      <p className="text-[10px] text-accent font-bold">LKR 3,200</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 h-10 bg-surface rounded-full border border-border px-4 flex items-center text-xs text-ink/40">
                  Type your response...
                </div>
                <div className="size-9 rounded-full bg-brand grid place-items-center flex-shrink-0">
                  <div className="size-3.5 border-t-2 border-r-2 border-white rotate-45 -translate-x-0.5" />
                </div>
              </div>
            </div>

            <div className="absolute -top-10 -right-10 w-64 h-64 bg-accent/10 rounded-full blur-3xl -z-10" />
            <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-brand/5 rounded-full blur-3xl -z-10" />
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="how" className="px-6 md:px-10 py-20 sm:py-24 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12 md:mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-brand/5 text-brand text-xs font-bold uppercase tracking-widest mb-5">
              Two ways to do everything
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-tight text-balance mb-4">
              Say it in chat, or tap the button. Araliya keeps both in sync.
            </h2>
            <p className="text-lg text-ink/70 leading-relaxed">
              Every panel in the app — cart, checkout, order history — has a conversational shortcut. Ask for it
              and Araliya does it herself, or reach for the UI directly. Nothing you do one way is invisible to
              the other.
            </p>
          </div>

          <div className="grid gap-5 md:gap-6">
            <ProofCard exchange={SIGNATURE_EXCHANGE} signature />
            <div className="grid sm:grid-cols-2 gap-5 md:gap-6">
              {PROOF_EXCHANGES.map((exchange) => (
                <ProofCard key={exchange.eyebrow} exchange={exchange} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Storytelling */}
      <section id="expats" className="px-6 md:px-10 py-20 sm:py-24 border-t border-brand/10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            <div className="w-full md:w-1/2">
              <img
                src={FAMILY_GIFT_IMG}
                alt="A family gathered together, exchanging a wrapped gift"
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-2xl shadow-lg"
              />
            </div>
            <div className="w-full md:w-1/2 space-y-8">
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-tight text-balance">
                Bridging the miles between <span className="text-brand">you</span> and{" "}
                <span className="text-brand">them</span>.
              </h2>
              <p className="text-lg text-ink/70 leading-relaxed">
                Being an expat means missing the small moments. Araliya was built by Sri Lankans,
                for Sri Lankans, ensuring your presence is felt at every birthday, anniversary,
                and holiday.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">Real-time stock validation</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">Island-wide delivery tracking</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">International payment support</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Kapruka network */}
      <section id="kapruka" className="px-6 md:px-10 py-20 sm:py-24 border-t border-brand/10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12 md:gap-16">
            <div className="w-full md:w-1/2">
              <img
                src={COURIER_IMG}
                alt="A courier handling packages for island-wide delivery"
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-2xl shadow-lg"
              />
            </div>
            <div className="w-full md:w-1/2 space-y-8">
              <span className="inline-block px-4 py-1.5 rounded-full bg-brand/5 text-brand text-xs font-bold uppercase tracking-widest">
                Under the hood
              </span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-tight text-balance">
                Backed by <span className="text-brand">Sri Lanka's largest</span> gifting marketplace.
              </h2>
              <p className="text-lg text-ink/70 leading-relaxed">
                Araliya doesn't maintain its own warehouse — she shops Kapruka in real time, Sri
                Lanka's largest e-commerce platform, live since 2003 and publicly listed on the
                Colombo Stock Exchange. Thousands of local sellers list on Kapruka, giving Araliya
                over 125,000 products to search across flowers, cakes, sweets, electronics,
                groceries, and curated gift hampers. Because Kapruka owns its own fulfillment
                centers rather than outsourcing to third parties, stock counts and delivery updates
                Araliya gives you are pulled straight from the source, not stale estimates.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">125,000+ products across every gifting category</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">Trusted by over 1.2 million Sri Lankan expats worldwide</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="size-2 bg-accent rounded-full flex-shrink-0" />
                  <span className="font-medium">Same-day delivery options, island-wide</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-brand/10 px-6 md:px-10 py-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8 text-center md:text-left">
          <div className="text-2xl font-display font-bold text-brand italic">Araliya</div>
          <p className="text-sm text-ink/50">
            © 2026 Araliya Gift AI. Built for the Sri Lankan Global Community.
          </p>
          <div className="flex gap-6">
            <div className="size-5 bg-ink/10 rounded-full" />
            <div className="size-5 bg-ink/10 rounded-full" />
            <div className="size-5 bg-ink/10 rounded-full" />
          </div>
        </div>
      </footer>
    </div>
  );
}